import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { dealPartyReferenceParticipant } from "@/backend/modules/customer-graph";
import { leadOutcomeParticipant } from "@/backend/modules/leads";
import {
  lookupActiveActor,
  revalidateActiveActor,
  salesAuthorityParticipant,
  type TrustedActor,
} from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import {
  canonicalRequestHash,
  idempotencyReceiptParticipant,
  lockIdempotencyAuthority,
  type IdempotentMutationOperation,
} from "@/backend/platform/idempotency";
import {
  writeSalesEvidence,
  type SalesOperation,
} from "@/backend/platform/audit";
import {
  SalesError,
  type SalesDealCreateCommandV1,
  type SalesDealUpdateCommandV1,
  type SalesDealStageTransitionCommandV1,
  type SalesDealListQueryV1,
  type SalesDealBoardQueryV1,
} from "../contracts/deal.contract";
type Deal = {
  dealId: string;
  pipelineId: string;
  stageId: string;
  outcomeClass: "open" | "won" | "lost";
  name: string;
  lifecycle: "active" | "archived";
  amountMinor: string | null;
  currencyCode: "USD" | "CAD" | null;
  currencyExponent: 2 | null;
  probabilityBps: number;
  expectedCloseOn: string | null;
  stageEnteredAt: string;
  closedAt: string | null;
  lostReasonCode: string | null;
  responsibleMembershipId: string;
  responsibleTeamId: string | null;
  visibility: "workspace" | "teams";
  version: number;
  updatedAt: string;
  visibleTeamIds?: string[];
};
type Stage = {
  stageId: string;
  pipelineId: string;
  code: string;
  label: string;
  outcomeClass: "open" | "won" | "lost";
  sortKey: number;
  defaultProbabilityBps: number;
  version: number;
};
type PresentedPartyRow = {
  dealId: string;
  id: string;
  recordType: "crm.company" | "crm.contact";
  recordId: string;
  isPrimary: boolean;
  presentation?: { label: string; available: boolean };
};
const fail = (
    code: ConstructorParameters<typeof SalesError>[0],
    status: number,
  ): never => {
    throw new SalesError(code, status);
  },
  manage = (a: TrustedActor) => a.role === "owner" || a.role === "admin";
async function readTx<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>) {
  const tx = await pool.connect();
  try {
    await tx.query("begin read only");
    const result = await work(tx);
    await tx.query("commit");
    return result;
  } catch (error) {
    await tx.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
}
function money(row: Deal) {
  return row.amountMinor === null
    ? null
    : {
        amountMinor: String(row.amountMinor),
        currencyCode: row.currencyCode!,
        currencyExponent: 2 as const,
      };
}
function cursor(value: string | undefined, scope: Record<string, unknown>) {
  if (!value) return null;
  try {
    const p = JSON.parse(Buffer.from(value, "base64url").toString()) as {
      v: number;
      u: string;
      i: string;
      s: string;
    };
    if (
      p.v !== 1 ||
      p.s !== canonicalRequestHash(scope) ||
      !Number.isFinite(Date.parse(p.u)) ||
      !/^[0-9a-f-]{36}$/i.test(p.i)
    )
      throw 0;
    return p;
  } catch {
    fail("validation_failed", 400);
  }
}
const encode = (
  row: { updatedAt: string; dealId: string },
  scope: Record<string, unknown>,
) =>
  Buffer.from(
    JSON.stringify({
      v: 1,
      u: row.updatedAt,
      i: row.dealId,
      s: canonicalRequestHash(scope),
    }),
  ).toString("base64url");
async function replay<T>(
  tx: PoolClient,
  actor: TrustedActor,
  operation: SalesOperation,
  key: string,
  request: unknown,
  work: (operationId: string) => Promise<T>,
  authorizeReplay?: () => Promise<void>,
) {
  if (
    key.length < 16 ||
    key.length > 128 ||
    ![...key].every((c) => c >= " " && c <= "~")
  )
    fail("validation_failed", 400);
  const principal = `workspace:${actor.workspaceId}:membership:${actor.membershipId}`,
    hash = canonicalRequestHash(request);
  await lockIdempotencyAuthority(tx, `${principal}:${operation}:${key}`);
  const receipts = idempotencyReceiptParticipant(tx),
    old = await receipts.find<T>(
      principal,
      operation as IdempotentMutationOperation,
      key,
    );
  if (old) {
    if (old.requestHash !== hash) fail("idempotency_conflict", 409);
    await authorizeReplay?.();
    return { ...(old.outcome as object), replayed: true } as T;
  }
  const operationId = randomUUID(),
    result = await work(operationId);
  await receipts.save({
    principalKey: principal,
    operation: operation as IdempotentMutationOperation,
    idempotencyKey: key,
    requestHash: hash,
    outcome: result,
  });
  return result;
}
async function pipeline(
  tx: PoolClient,
  workspaceId: string,
  pipelineId?: string,
  lock = false,
) {
  const p = (
    await tx.query<{
      pipelineId: string;
      label: string;
      configurationVersion: number;
      version: number;
    }>(
      `select id "pipelineId",label,configuration_version "configurationVersion",version from sales_pipelines where workspace_id=$1 and lifecycle='active' and ${pipelineId ? "id=$2" : "is_default"} ${lock ? "for no key update" : ""}`,
      [workspaceId, ...(pipelineId ? [pipelineId] : [])],
    )
  ).rows[0];
  if (!p) fail("pipeline_unavailable", 409);
  const stages = (
    await tx.query<Stage>(
      `select id "stageId",pipeline_id "pipelineId",code,label,outcome_class "outcomeClass",sort_key::float8 "sortKey",default_probability_bps "defaultProbabilityBps",version from deal_stage_definitions where workspace_id=$1 and pipeline_id=$2 and lifecycle='active' order by sort_key,id ${lock ? "for no key update" : ""}`,
      [workspaceId, p.pipelineId],
    )
  ).rows;
  if (!stages.length) fail("pipeline_unavailable", 409);
  return { ...p, stages };
}
async function root(
  tx: PoolClient,
  actor: TrustedActor,
  id: string,
  lock = false,
) {
  const row = (
    await tx.query<Deal>(
      `select id "dealId",pipeline_id "pipelineId",stage_id "stageId",outcome_class "outcomeClass",name,lifecycle,amount_minor "amountMinor",currency_code "currencyCode",currency_exponent "currencyExponent",probability_bps "probabilityBps",expected_close_on::text "expectedCloseOn",stage_entered_at::text "stageEnteredAt",closed_at::text "closedAt",lost_reason_code "lostReasonCode",responsible_membership_id "responsibleMembershipId",responsible_team_id "responsibleTeamId",visibility,version,updated_at::text "updatedAt" from deals where workspace_id=$1 and id=$2 ${lock ? "for update" : ""}`,
      [actor.workspaceId, id],
    )
  ).rows[0];
  if (!row) fail("resource_not_found", 404);
  return row;
}
async function visibleIds(tx: PoolClient, actor: TrustedActor, rows: Deal[]) {
  if (actor.role !== "member") return new Set(rows.map((r) => r.dealId));
  if (!rows.length) return new Set<string>();
  const teams = new Set(
    (
      await tx.query<{ id: string }>(
        `select distinct dvt.deal_id id from deal_visible_teams dvt join team_memberships tm on tm.workspace_id=dvt.workspace_id and tm.team_id=dvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where dvt.workspace_id=$1 and dvt.deal_id=any($2::uuid[]) and tm.workspace_membership_id=$3`,
        [actor.workspaceId, rows.map((r) => r.dealId), actor.membershipId],
      )
    ).rows.map((r) => r.id),
  );
  return new Set(
    rows
      .filter(
        (r) =>
          r.visibility === "workspace" ||
          r.responsibleMembershipId === actor.membershipId ||
          teams.has(r.dealId),
      )
      .map((r) => r.dealId),
  );
}
async function parties(tx: PoolClient, actor: TrustedActor, dealIds: string[]) {
  if (!dealIds.length)
    return new Map<
      string,
      Array<{
        id: string;
        recordType: "crm.company" | "crm.contact";
        recordId: string;
        isPrimary: boolean;
      }>
    >();
  const rows = (
      await tx.query<{
        dealId: string;
        id: string;
        recordType: "crm.company" | "crm.contact";
        recordId: string;
        isPrimary: boolean;
      }>(
        `select deal_id "dealId",id,record_type "recordType",record_id "recordId",is_primary "isPrimary" from deal_party_refs where workspace_id=$1 and deal_id=any($2::uuid[]) and lifecycle='active' order by deal_id,role_code,contact_slot,id`,
        [actor.workspaceId, [...dealIds].sort()],
      )
    ).rows,
    refs = rows.map((r) => ({
      recordType: r.recordType,
      recordId: r.recordId,
    })),
    presented = await dealPartyReferenceParticipant(tx).present(actor, refs),
    result = new Map<string, typeof rows>();
  for (const row of rows)
    result.set(row.dealId, [...(result.get(row.dealId) ?? []), row]);
  return new Map(
    [...result].map(([id, values]) => [
      id,
      values.map((v) => ({
        ...v,
        presentation: presented.get(`${v.recordType}:${v.recordId}`),
      })),
    ]),
  );
}
function summary(
  row: Deal,
  partyRows: PresentedPartyRow[],
  actor: TrustedActor,
) {
  const company = partyRows.find((p) => p.recordType === "crm.company"),
    contact = partyRows.find(
      (p) => p.recordType === "crm.contact" && p.isPrimary,
    ),
    show = (p: PresentedPartyRow | undefined) =>
      !p
        ? null
        : p.presentation?.available
          ? {
              available: true,
              recordId: p.recordId,
              label: p.presentation.label,
            }
          : { available: false };
  return {
    dealId: row.dealId,
    name: row.name,
    lifecycle: row.lifecycle,
    outcomeClass: row.outcomeClass,
    stageId: row.stageId,
    pipelineId: row.pipelineId,
    value: money(row),
    expectedCloseOn: row.expectedCloseOn,
    probabilityBps: row.probabilityBps,
    company: show(company),
    primaryContact: show(contact),
    responsibleMembershipId: row.responsibleMembershipId,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
    capabilities: {
      canEdit: manage(actor) && row.lifecycle === "active",
      canTransition:
        (manage(actor) || row.responsibleMembershipId === actor.membershipId) &&
        row.lifecycle === "active",
      canArchive: manage(actor) && row.lifecycle === "active",
      canRestore: manage(actor) && row.lifecycle === "archived",
    },
  };
}
async function finalFence(
  tx: PoolClient,
  actor: TrustedActor,
  expected: Deal[],
) {
  const current = await lookupActiveActor(tx, actor),
    ids = expected.map((r) => r.dealId).sort();
  if (!ids.length) return { actor: current, rows: [], partyRows: new Map() };
  const rows = (
      await tx.query<Deal>(
        `select d.id "dealId",d.pipeline_id "pipelineId",d.stage_id "stageId",d.outcome_class "outcomeClass",d.name,d.lifecycle,d.amount_minor "amountMinor",d.currency_code "currencyCode",d.currency_exponent "currencyExponent",d.probability_bps "probabilityBps",d.expected_close_on::text "expectedCloseOn",d.stage_entered_at::text "stageEnteredAt",d.closed_at::text "closedAt",d.lost_reason_code "lostReasonCode",d.responsible_membership_id "responsibleMembershipId",d.responsible_team_id "responsibleTeamId",d.visibility,d.version,d.updated_at::text "updatedAt",array(select dvt.team_id::text from deal_visible_teams dvt where dvt.workspace_id=d.workspace_id and dvt.deal_id=d.id order by dvt.visible_team_slot) "visibleTeamIds" from deals d where d.workspace_id=$1 and d.id=any($2::uuid[]) and ($3::text<>'member' or d.visibility='workspace' or d.responsible_membership_id=$4::uuid or exists(select 1 from deal_visible_teams dvt join team_memberships tm on tm.workspace_id=dvt.workspace_id and tm.team_id=dvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where dvt.workspace_id=d.workspace_id and dvt.deal_id=d.id and tm.workspace_membership_id=$4::uuid)) order by d.id`,
        [current.workspaceId, ids, current.role, current.membershipId],
      )
    ).rows,
    actual = new Map(rows.map((r) => [r.dealId, r]));
  if (
    expected.some((e) => {
      const a = actual.get(e.dealId);
      return (
        !a ||
        a.version !== e.version ||
        a.updatedAt !== e.updatedAt ||
        a.name !== e.name
      );
    })
  )
    fail("resource_not_found", 404);
  return { actor: current, rows, partyRows: await parties(tx, current, ids) };
}
export async function getSalesPipeline(
  pool: Pool,
  actor: TrustedActor,
  requestId: string,
) {
  return readTx(pool, async (tx) => {
    const initial = await lookupActiveActor(tx, actor),
      current = await lookupActiveActor(tx, initial),
      p = await pipeline(tx, current.workspaceId).catch((e) => {
        if (e instanceof SalesError && e.code === "pipeline_unavailable")
          return null;
        throw e;
      }),
      authority = salesAuthorityParticipant(tx),
      can = authority.canCreate(current);
    return {
      contractVersion: "sales-pipeline-view.v1",
      pipeline: p
        ? {
            pipelineId: p.pipelineId,
            label: p.label,
            configurationVersion: p.configurationVersion,
            version: p.version,
            stages: p.stages,
          }
        : null,
      options: can
        ? await authority.options(current)
        : { responsibleMemberships: [], teams: [] },
      capabilities: { canCreate: can && Boolean(p), canManageAssignment: can },
      requestId,
    };
  });
}
export async function listDeals(
  pool: Pool,
  actor: TrustedActor,
  query: SalesDealListQueryV1,
  requestId: string,
  beforeFence?: () => Promise<void>,
) {
  return readTx(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor),
      scope = {
        lifecycle: query.lifecycle,
        pipelineId: query.pipelineId ?? null,
        stageId: query.stageId ?? null,
      },
      c = cursor(query.cursor, scope),
      rows = (
        await tx.query<Deal>(
          `select id "dealId",pipeline_id "pipelineId",stage_id "stageId",outcome_class "outcomeClass",name,lifecycle,amount_minor "amountMinor",currency_code "currencyCode",currency_exponent "currencyExponent",probability_bps "probabilityBps",expected_close_on::text "expectedCloseOn",stage_entered_at::text "stageEnteredAt",closed_at::text "closedAt",lost_reason_code "lostReasonCode",responsible_membership_id "responsibleMembershipId",responsible_team_id "responsibleTeamId",visibility,version,updated_at::text "updatedAt" from deals d where workspace_id=$1 and lifecycle=$2 and ($3::uuid is null or pipeline_id=$3) and ($4::uuid is null or stage_id=$4) and ($5::timestamptz is null or (updated_at,id)<($5::timestamptz,$6::uuid)) and ($8::text<>'member' or visibility='workspace' or responsible_membership_id=$9::uuid or exists(select 1 from deal_visible_teams dvt join team_memberships tm on tm.workspace_id=dvt.workspace_id and tm.team_id=dvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where dvt.workspace_id=d.workspace_id and dvt.deal_id=d.id and tm.workspace_membership_id=$9::uuid)) order by updated_at desc,id desc limit $7`,
          [
            current.workspaceId,
            query.lifecycle,
            query.pipelineId ?? null,
            query.stageId ?? null,
            c?.u ?? null,
            c?.i ?? null,
            query.limit + 1,
            current.role,
            current.membershipId,
          ],
        )
      ).rows,
      safe = rows.slice(0, query.limit),
      more = rows.length > query.limit,
      last = safe.at(-1);
    await beforeFence?.();
    const final = await finalFence(tx, current, safe);
    return {
      contractVersion: "sales-deal-list.v1",
      filters: {
        lifecycle: query.lifecycle,
        ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
        ...(query.stageId ? { stageId: query.stageId } : {}),
      },
      items: safe.map((r) =>
        summary(r, final.partyRows.get(r.dealId) ?? [], final.actor),
      ),
      nextCursor: more && last ? encode(last, scope) : null,
      requestId,
    };
  });
}
export async function getDealBoard(
  pool: Pool,
  actor: TrustedActor,
  query: SalesDealBoardQueryV1,
  requestId: string,
) {
  return readTx(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor),
      p = await pipeline(tx, current.workspaceId, query.pipelineId),
      all: Deal[] = [],
      pages: Array<{ stage: Stage; rows: Deal[]; more: boolean }> = [];
    const stageIds = new Set(p.stages.map((stage) => stage.stageId));
    if (
      Object.keys(query.stageCursors).some((stageId) => !stageIds.has(stageId))
    )
      fail("validation_failed", 400);
    for (const stage of p.stages) {
      const scope = { pipelineId: p.pipelineId, stageId: stage.stageId },
        c = cursor(query.stageCursors[stage.stageId], scope),
        rows = (
          await tx.query<Deal>(
            `select id "dealId",pipeline_id "pipelineId",stage_id "stageId",outcome_class "outcomeClass",name,lifecycle,amount_minor "amountMinor",currency_code "currencyCode",currency_exponent "currencyExponent",probability_bps "probabilityBps",expected_close_on::text "expectedCloseOn",stage_entered_at::text "stageEnteredAt",closed_at::text "closedAt",lost_reason_code "lostReasonCode",responsible_membership_id "responsibleMembershipId",responsible_team_id "responsibleTeamId",visibility,version,updated_at::text "updatedAt" from deals d where workspace_id=$1 and pipeline_id=$2 and stage_id=$3 and lifecycle='active' and ($4::timestamptz is null or (stage_entered_at,id)>($4::timestamptz,$5::uuid)) and ($7::text<>'member' or visibility='workspace' or responsible_membership_id=$8::uuid or exists(select 1 from deal_visible_teams dvt join team_memberships tm on tm.workspace_id=dvt.workspace_id and tm.team_id=dvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where dvt.workspace_id=d.workspace_id and dvt.deal_id=d.id and tm.workspace_membership_id=$8::uuid)) order by stage_entered_at,id limit $6`,
            [
              current.workspaceId,
              p.pipelineId,
              stage.stageId,
              c?.u ?? null,
              c?.i ?? null,
              query.limitPerStage + 1,
              current.role,
              current.membershipId,
            ],
          )
        ).rows;
      pages.push({
        stage,
        rows: rows.slice(0, query.limitPerStage),
        more: rows.length > query.limitPerStage,
      });
      all.push(...rows.slice(0, query.limitPerStage));
    }
    const final = await finalFence(tx, current, all);
    const finalPipeline = await pipeline(
      tx,
      final.actor.workspaceId,
      p.pipelineId,
    );
    if (
      finalPipeline.version !== p.version ||
      finalPipeline.configurationVersion !== p.configurationVersion
    )
      fail("pipeline_unavailable", 409);
    return {
      contractVersion: "sales-deal-board.v1",
      pipeline: {
        pipelineId: p.pipelineId,
        label: finalPipeline.label,
        configurationVersion: finalPipeline.configurationVersion,
        version: finalPipeline.version,
      },
      filters: { pipelineId: p.pipelineId },
      stages: pages.map((page) => ({
        ...(finalPipeline.stages.find(
          (stage) => stage.stageId === page.stage.stageId,
        ) ?? fail("pipeline_unavailable", 409)),
        items: page.rows.map((r) =>
          summary(r, final.partyRows.get(r.dealId) ?? [], final.actor),
        ),
        nextCursor:
          page.more && page.rows.at(-1)
            ? encode(
                {
                  updatedAt: page.rows.at(-1)!.stageEnteredAt,
                  dealId: page.rows.at(-1)!.dealId,
                },
                { pipelineId: p.pipelineId, stageId: page.stage.stageId },
              )
            : null,
      })),
      requestId,
    };
  });
}
export async function getDeal(
  pool: Pool,
  actor: TrustedActor,
  dealId: string,
  requestId: string,
  beforeFence?: () => Promise<void>,
) {
  return readTx(pool, async (tx) => {
    const initial = await lookupActiveActor(tx, actor),
      deal = await root(tx, initial, dealId),
      seen = await visibleIds(tx, initial, [deal]);
    if (!seen.has(dealId)) fail("resource_not_found", 404);
    await beforeFence?.();
    const final = await finalFence(tx, initial, [deal]),
      current = final.actor,
      fresh = final.rows[0] ?? fail("resource_not_found", 404),
      p = await pipeline(tx, current.workspaceId, fresh.pipelineId),
      teamIds = fresh.visibleTeamIds ?? [],
      partyRows = final.partyRows.get(dealId) ?? [],
      present = partyRows.map((r: PresentedPartyRow) =>
        r.presentation?.available
          ? r.recordType === "crm.company"
            ? {
                kind: "company",
                companyId: r.recordId,
                label: r.presentation.label,
                available: true,
              }
            : {
                kind: "contact",
                contactId: r.recordId,
                label: r.presentation.label,
                isPrimary: r.isPrimary,
                available: true,
              }
          : {
              kind: r.recordType === "crm.company" ? "company" : "contact",
              available: false,
            },
      ),
      authority = salesAuthorityParticipant(tx),
      canEdit = authority.canEdit(current) && fresh.lifecycle === "active",
      canTransition =
        authority.canTransition(current, fresh) &&
        fresh.lifecycle === "active" &&
        fresh.outcomeClass === "open";
    return {
      contractVersion: "sales-deal-detail.v1",
      deal: {
        dealId: fresh.dealId,
        name: fresh.name,
        pipelineId: fresh.pipelineId,
        stageId: fresh.stageId,
        outcomeClass: fresh.outcomeClass,
        lifecycle: fresh.lifecycle,
        value: money(fresh),
        probabilityBps: fresh.probabilityBps,
        expectedCloseOn: fresh.expectedCloseOn,
        responsibleMembershipId: fresh.responsibleMembershipId,
        version: fresh.version,
        updatedAt: new Date(fresh.updatedAt).toISOString(),
        closedAt: fresh.closedAt
          ? new Date(fresh.closedAt).toISOString()
          : null,
        lostReasonCode: fresh.lostReasonCode,
        responsibleTeamId: fresh.responsibleTeamId,
        visibility: fresh.visibility,
        visibleTeamIds: teamIds,
        parties: present,
        capabilities: {
          canEdit,
          canTransition,
          canArchive: canEdit,
          canRestore:
            authority.canEdit(current) && fresh.lifecycle === "archived",
          canManageAssignment: canEdit,
          eligibleTargetStageIds: canTransition
            ? p.stages
                .filter((s) => s.stageId !== fresh.stageId)
                .map((s) => s.stageId)
            : [],
        },
      },
      pipeline: { pipelineId: p.pipelineId, label: p.label, stages: p.stages },
      options: canEdit
        ? await authority.options(current)
        : { responsibleMemberships: [], teams: [] },
      requestId,
    };
  });
}
async function setTeams(
  tx: PoolClient,
  actor: TrustedActor,
  dealId: string,
  ids: string[],
) {
  await tx.query(
    `delete from deal_visible_teams where workspace_id=$1 and deal_id=$2`,
    [actor.workspaceId, dealId],
  );
  let slot = 1;
  for (const id of [...new Set(ids)].sort())
    await tx.query(
      `insert into deal_visible_teams(workspace_id,deal_id,team_id,visible_team_slot,created_by_membership_id) values($1,$2,$3,$4,$5)`,
      [actor.workspaceId, dealId, id, slot++, actor.membershipId],
    );
}
async function setParties(
  tx: PoolClient,
  actor: TrustedActor,
  dealId: string,
  input: {
    companyId: string;
    contacts: Array<{ contactId: string; isPrimary: boolean }>;
  },
  operationId: string,
) {
  await tx.query(
    `update deal_party_refs set lifecycle='ended',version=version+1,governing_operation_id=$3,ended_at=now(),ended_by_membership_id=$4,updated_at=now() where workspace_id=$1 and deal_id=$2 and lifecycle='active'`,
    [actor.workspaceId, dealId, operationId, actor.membershipId],
  );
  await tx.query(
    `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,is_primary,governing_operation_id,created_by_membership_id) values($1,$2,'customer_company','crm.company',$3,false,$4,$5)`,
    [
      actor.workspaceId,
      dealId,
      input.companyId,
      operationId,
      actor.membershipId,
    ],
  );
  let slot = 1;
  for (const c of input.contacts)
    await tx.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,is_primary,governing_operation_id,created_by_membership_id) values($1,$2,'buying_contact','crm.contact',$3,$4,$5,$6,$7)`,
      [
        actor.workspaceId,
        dealId,
        c.contactId,
        slot++,
        c.isPrimary,
        operationId,
        actor.membershipId,
      ],
    );
}
async function finalWriteFence(
  tx: PoolClient,
  actor: TrustedActor,
  input: {
    responsibleMembershipId: string;
    responsibleTeamId: string | null;
    visibility: "workspace" | "teams";
    visibleTeamIds: string[];
    companyId: string;
    contacts: Array<{ contactId: string }>;
    dealId?: string;
  },
) {
  const current = await revalidateActiveActor(tx, actor);
  if (!manage(current)) fail("resource_not_found", 404);
  await dealPartyReferenceParticipant(tx).lockAndRequireDealParties(
    current,
    input.companyId,
    input.contacts.map((c) => c.contactId),
  );
  if (input.dealId)
    await tx.query(
      `select deal_id,team_id from deal_visible_teams where workspace_id=$1 and deal_id=$2 order by team_id for update`,
      [current.workspaceId, input.dealId],
    );
  await salesAuthorityParticipant(tx).lockAndValidate(current, input);
  const finalActor = await revalidateActiveActor(tx, current);
  if (!manage(finalActor)) fail("resource_not_found", 404);
  return finalActor;
}
export async function createDeal(
  pool: Pool,
  input: {
    actor: TrustedActor;
    command: SalesDealCreateCommandV1;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!manage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "sales-deal-create.v1",
      input.key,
      input.command,
      async (operationId) => {
        const p = await pipeline(
          tx,
          actor.workspaceId,
          input.command.pipelineId,
          true,
        );
        const stage =
          p.stages.find((s) => s.stageId === input.command.stageId) ??
          fail("stage_unavailable", 409);
        if (stage.outcomeClass !== "open") fail("stage_unavailable", 409);
        const current = await finalWriteFence(tx, actor, {
          ...input.command,
          companyId: input.command.parties.companyId,
          contacts: input.command.parties.contacts,
        });
        const value = input.command.value,
          row = (
            await tx.query<{ id: string; version: number }>(
              `insert into deals(workspace_id,pipeline_id,stage_id,outcome_class,name,amount_minor,currency_code,currency_exponent,probability_bps,probability_source,expected_close_on,stage_entered_at,responsible_membership_id,responsible_team_id,visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'stage_default',$10,now(),$11,$12,$13,$14,$15,$15) returning id,version`,
              [
                current.workspaceId,
                p.pipelineId,
                stage.stageId,
                stage.outcomeClass,
                input.command.name,
                value?.amountMinor ?? null,
                value?.currencyCode ?? null,
                value?.currencyExponent ?? null,
                stage.defaultProbabilityBps,
                input.command.expectedCloseOn,
                input.command.responsibleMembershipId,
                input.command.responsibleTeamId,
                input.command.visibility,
                operationId,
                current.membershipId,
              ],
            )
          ).rows[0];
        await setParties(
          tx,
          current,
          row.id,
          input.command.parties,
          operationId,
        );
        await setTeams(tx, current, row.id, input.command.visibleTeamIds);
        await tx.query(
          `insert into deal_stage_transitions(workspace_id,deal_id,to_pipeline_id,to_stage_id,to_outcome_class,result_deal_version,changed_by_membership_id,governing_operation_id,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())`,
          [
            current.workspaceId,
            row.id,
            p.pipelineId,
            stage.stageId,
            stage.outcomeClass,
            row.version,
            current.membershipId,
            operationId,
          ],
        );
        await writeSalesEvidence(tx, {
          actor: current,
          operation: "sales-deal-create.v1",
          dealId: row.id,
          version: row.version,
          requestId: input.requestId,
          operationId,
          changeFields: ["created"],
        });
        return {
          contractVersion: "sales-deal-result.v1",
          dealId: row.id,
          version: row.version,
          changed: true,
          replayed: false,
          stage: { stageId: stage.stageId, outcomeClass: stage.outcomeClass },
          requestId: input.requestId,
          reconciliation: { required: false, action: "none" },
        };
      },
    );
  });
}
export async function updateDeal(
  pool: Pool,
  input: {
    actor: TrustedActor;
    dealId: string;
    command: SalesDealUpdateCommandV1;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!manage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "sales-deal-update.v1",
      input.key,
      { dealId: input.dealId, command: input.command },
      async (operationId) => {
        const old = await root(tx, actor, input.dealId, true);
        if (old.lifecycle !== "active") fail("resource_not_found", 404);
        if (old.version !== input.command.expectedVersion)
          fail("stale_version", 409);
        const current = await finalWriteFence(tx, actor, {
            ...input.command,
            companyId: input.command.parties.companyId,
            contacts: input.command.parties.contacts,
            dealId: old.dealId,
          }),
          value = input.command.value;
        await setParties(
          tx,
          current,
          old.dealId,
          input.command.parties,
          operationId,
        );
        await setTeams(tx, current, old.dealId, input.command.visibleTeamIds);
        await tx.query(
          `update deals set name=$3,amount_minor=$4,currency_code=$5,currency_exponent=$6,expected_close_on=$7,responsible_membership_id=$8,responsible_team_id=$9,visibility=$10,governing_operation_id=$11,updated_by_membership_id=$12,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$13`,
          [
            current.workspaceId,
            old.dealId,
            input.command.name,
            value?.amountMinor ?? null,
            value?.currencyCode ?? null,
            value?.currencyExponent ?? null,
            input.command.expectedCloseOn,
            input.command.responsibleMembershipId,
            input.command.responsibleTeamId,
            input.command.visibility,
            operationId,
            current.membershipId,
            input.command.expectedVersion,
          ],
        );
        await writeSalesEvidence(tx, {
          actor: current,
          operation: "sales-deal-update.v1",
          dealId: old.dealId,
          version: old.version + 1,
          requestId: input.requestId,
          operationId,
          changeFields: [
            "profile",
            "value",
            "expectedCloseOn",
            "parties",
            "assignment",
          ],
        });
        return {
          contractVersion: "sales-deal-result.v1",
          dealId: old.dealId,
          version: old.version + 1,
          changed: true,
          replayed: false,
          stage: { stageId: old.stageId, outcomeClass: old.outcomeClass },
          requestId: input.requestId,
          reconciliation: { required: false, action: "none" },
        };
      },
    );
  });
}
export async function transitionDeal(
  pool: Pool,
  input: {
    actor: TrustedActor;
    dealId: string;
    command: SalesDealStageTransitionCommandV1;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    return replay(
      tx,
      actor,
      "sales-deal-stage-transition.v1",
      input.key,
      { dealId: input.dealId, command: input.command },
      async (operationId) => {
        const old = await root(tx, actor, input.dealId, true);
        if (old.lifecycle !== "active") fail("resource_not_found", 404);
        if (old.version !== input.command.expectedVersion)
          fail("stale_version", 409);
        const current = await revalidateActiveActor(tx, actor);
        if (!salesAuthorityParticipant(tx).canTransition(current, old))
          fail("resource_not_found", 404);
        const p = await pipeline(tx, current.workspaceId, old.pipelineId, true);
        const target =
          p.stages.find((s) => s.stageId === input.command.targetStageId) ??
          fail("stage_unavailable", 409);
        if (
          (target.outcomeClass === "lost" && !input.command.lostReasonCode) ||
          (target.outcomeClass !== "lost" && input.command.lostReasonCode)
        )
          fail("validation_failed", 400);
        if (
          target.stageId === old.stageId &&
          input.command.lostReasonCode !== old.lostReasonCode
        )
          fail("validation_failed", 400);
        if (target.stageId === old.stageId)
          return {
            contractVersion: "sales-deal-result.v1",
            dealId: old.dealId,
            version: old.version,
            changed: false,
            replayed: false,
            stage: { stageId: old.stageId, outcomeClass: old.outcomeClass },
            requestId: input.requestId,
            reconciliation: { required: false, action: "none" },
          };
        if (old.outcomeClass !== "open") fail("terminal_deal", 409);
        const finalActor = await revalidateActiveActor(tx, current);
        if (!salesAuthorityParticipant(tx).canTransition(finalActor, old))
          fail("resource_not_found", 404);
        const closed = target.outcomeClass === "open" ? null : new Date();
        await tx.query(
          `update deals set stage_id=$3,outcome_class=$4,probability_bps=$5,probability_source='stage_default',stage_entered_at=now(),closed_at=$6,lost_reason_code=$7,governing_operation_id=$8,updated_by_membership_id=$9,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$10`,
          [
            finalActor.workspaceId,
            old.dealId,
            target.stageId,
            target.outcomeClass,
            target.defaultProbabilityBps,
            closed,
            input.command.lostReasonCode,
            operationId,
            finalActor.membershipId,
            input.command.expectedVersion,
          ],
        );
        await tx.query(
          `insert into deal_stage_transitions(workspace_id,deal_id,from_pipeline_id,from_stage_id,from_outcome_class,to_pipeline_id,to_stage_id,to_outcome_class,result_deal_version,changed_by_membership_id,governing_operation_id,occurred_at) values($1,$2,$3,$4,$5,$3,$6,$7,$8,$9,$10,now())`,
          [
            finalActor.workspaceId,
            old.dealId,
            old.pipelineId,
            old.stageId,
            old.outcomeClass,
            target.stageId,
            target.outcomeClass,
            old.version + 1,
            finalActor.membershipId,
            operationId,
          ],
        );
        // A closing Deal settles the outcome of the Lead it came from. Sales owns the
        // conversion lineage and Deals so it resolves the Lead and the derived outcome
        // here; the Leads module owns the `leads` write and applies it.
        // A Lead is `won` when ANY of its Deals was won, so a later lost Deal never
        // downgrades a Lead that already produced business.
        if (target.outcomeClass !== "open") {
          const derived = (await tx.query<{ leadId: string; hasWon: boolean }>(
            `select lineage.lead_record_id "leadId", exists(
               select 1 from lead_deal_conversion_lineage sibling
                 join deals sibling_deal on sibling_deal.workspace_id=sibling.workspace_id
                   and sibling_deal.id=sibling.deal_id
                where sibling.workspace_id=$1 and sibling.lead_record_id=lineage.lead_record_id
                  and sibling.lead_record_type='crm.lead' and sibling_deal.outcome_class='won') "hasWon"
               from lead_deal_conversion_lineage lineage
              where lineage.workspace_id=$1 and lineage.deal_id=$2 and lineage.lead_record_type='crm.lead'`,
            [finalActor.workspaceId, old.dealId],
          )).rows[0];
          if (derived)
            await leadOutcomeParticipant(tx).applyDerivedOutcome({
              workspaceId: finalActor.workspaceId,
              leadId: derived.leadId,
              status: derived.hasWon ? "won" : "lost",
            });
        }
        await writeSalesEvidence(tx, {
          actor: finalActor,
          operation: "sales-deal-stage-transition.v1",
          dealId: old.dealId,
          version: old.version + 1,
          requestId: input.requestId,
          operationId,
          changeFields: ["stage"],
        });
        return {
          contractVersion: "sales-deal-result.v1",
          dealId: old.dealId,
          version: old.version + 1,
          changed: true,
          replayed: false,
          stage: { stageId: target.stageId, outcomeClass: target.outcomeClass },
          requestId: input.requestId,
          reconciliation: { required: false, action: "none" },
        };
      },
      async () => {
        const current = await revalidateActiveActor(tx, actor);
        const deal = await root(tx, current, input.dealId);
        const visible = await visibleIds(tx, current, [deal]);
        if (
          deal.lifecycle !== "active" ||
          !visible.has(deal.dealId) ||
          !salesAuthorityParticipant(tx).canTransition(current, deal)
        )
          fail("resource_not_found", 404);
      },
    );
  });
}
export async function changeDealLifecycle(
  pool: Pool,
  input: {
    actor: TrustedActor;
    dealId: string;
    expectedVersion: number;
    to: "active" | "archived";
    key: string;
    requestId: string;
  },
) {
  const operation =
    `sales-deal-${input.to === "active" ? "restore" : "archive"}.v1` as SalesOperation;
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!manage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      operation,
      input.key,
      { dealId: input.dealId, expectedVersion: input.expectedVersion },
      async (operationId) => {
        const old = await root(tx, actor, input.dealId, true);
        if (old.version !== input.expectedVersion) fail("stale_version", 409);
        if (old.lifecycle === input.to) fail("resource_not_found", 404);
        const current = await revalidateActiveActor(tx, actor);
        if (!manage(current)) fail("resource_not_found", 404);
        await tx.query(
          `update deals set lifecycle=$3,archived_at=${input.to === "archived" ? "now()" : "null"},archived_by_membership_id=${input.to === "archived" ? "$4" : "null"},governing_operation_id=$5,updated_by_membership_id=$4,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$6`,
          [
            current.workspaceId,
            old.dealId,
            input.to,
            current.membershipId,
            operationId,
            input.expectedVersion,
          ],
        );
        await writeSalesEvidence(tx, {
          actor: current,
          operation,
          dealId: old.dealId,
          version: old.version + 1,
          requestId: input.requestId,
          operationId,
          changeFields: ["lifecycle"],
        });
        return {
          contractVersion: "sales-deal-result.v1",
          dealId: old.dealId,
          version: old.version + 1,
          changed: true,
          replayed: false,
          stage: { stageId: old.stageId, outcomeClass: old.outcomeClass },
          requestId: input.requestId,
          reconciliation: { required: false, action: "none" },
        };
      },
    );
  });
}
