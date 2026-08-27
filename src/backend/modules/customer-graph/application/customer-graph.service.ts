import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  canonicalRequestHash,
  idempotencyReceiptParticipant,
  lockIdempotencyAuthority,
  type IdempotentMutationOperation,
} from "@/backend/platform/idempotency";
import {
  writeCustomerGraphEvidence,
  type CustomerGraphAction,
  type CustomerGraphOperation,
} from "@/backend/platform/audit";
import {
  lookupActiveActor,
  revalidateActiveActor,
  workspaceAuthorityParticipant,
  type TrustedActor,
} from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import {
  CustomerGraphError,
  type CompanyCreateCommandV1,
  type CompanyEditCommandV1,
  type ContactCreateCommandV1,
  type ContactEditCommandV1,
  type ContactAffiliationReplaceCommandV1,
  type CustomerGraphListQueryV1,
} from "../contracts/customer-graph.contract";
import type {
  CompanyScreenCreateCommandV2,
  CompanyScreenEditCommandV2,
  ContactScreenCreateCommandV2,
  ContactScreenEditCommandV2,
} from "@/backend/modules/screen-forms/contracts/screen-forms.contract";
import { contactTransactionParticipant } from "@/backend/modules/contacts";

type Kind = "company" | "contact";
type LeadMutationOperation = CustomerGraphOperation;
type Assignment = {
  responsibleMembershipId: string | null;
  responsibleTeamId: string | null;
  visibility: "workspace" | "teams";
  visibleTeamIds: string[];
  responsibleMembershipVersion?: number | null;
  responsibleTeamVersion?: number | null;
  visibleTeamVersions?: Record<string, number>;
};
type CompanyCreate = CompanyCreateCommandV1 | CompanyScreenCreateCommandV2;
type CompanyEdit = CompanyEditCommandV1 | CompanyScreenEditCommandV2;
type ContactCreate = ContactCreateCommandV1 | ContactScreenCreateCommandV2;
type ContactEdit = ContactEditCommandV1 | ContactScreenEditCommandV2;
type Root = {
  id: string;
  version: number;
  status: "active" | "archived";
  displayName: string;
  updatedAt: string;
  responsibleMembershipId: string | null;
  responsibleTeamId: string | null;
  visibility: "workspace" | "teams";
  authorityContractVersion: string;
};
const tables = {
  company: {
    root: "companies",
    visible: "company_visible_teams",
    fk: "company_id",
  },
  contact: {
    root: "contacts",
    visible: "contact_visible_teams",
    fk: "contact_id",
  },
} as const;
const fail = (
  code: ConstructorParameters<typeof CustomerGraphError>[0],
  status: number,
) => {
  throw new CustomerGraphError(code, status);
};
const normalizeName = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const normalizeDomain = (value: string | null) =>
  value ? value.trim().toLowerCase() : null;
const normalizeEmail = (value: string | null) =>
  value ? value.trim().toLowerCase() : null;
const normalizePhone = (value: string | null) => (value ? value.trim() : null);
const phoneCountry = (value: string | null) =>
  value
    ? value.match(/^\+(\d{1,3})/)?.[1]
      ? `+${value.match(/^\+(\d{1,3})/)![1]}`
      : "+unknown"
    : null;
const moneyColumns = (
  value: {
    amountMinor: string;
    currencyCode: "USD" | "CAD";
    currencyExponent: 2;
  } | null,
) =>
  [
    value?.amountMinor ?? null,
    value?.currencyCode ?? null,
    value?.currencyExponent ?? null,
  ] as const;
const companyCommand = (command: CompanyCreate | CompanyEdit) =>
  "profile" in command
    ? {
        ...command.profile,
        displayName: command.profile.name,
        ...command.assignment,
      }
    : command;
const contactCommand = (command: ContactCreate | ContactEdit) =>
  "profile" in command
    ? {
        ...command.profile,
        email: command.profile.primaryEmail,
        phone: command.profile.directPhone,
        affiliation: command.profile.company
          ? {
              companyId: command.profile.company.companyId,
              roleCode: command.profile.company.roleCode,
            }
          : null,
        ...command.assignment,
      }
    : command;

function cursor(value: string | undefined, kind: Kind, status: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as {
      v: number;
      k: string;
      s: string;
      u: string;
      i: string;
    };
    if (
      parsed.v !== 1 ||
      parsed.k !== kind ||
      parsed.s !== status ||
      !Number.isFinite(Date.parse(parsed.u)) ||
      !/^[0-9a-f-]{36}$/i.test(parsed.i)
    )
      throw 0;
    return parsed;
  } catch {
    fail("validation_failed", 400);
  }
}
const encode = (
  kind: Kind,
  status: string,
  row: { updatedAt: string; id: string },
) =>
  Buffer.from(
    JSON.stringify({ v: 1, k: kind, s: status, u: row.updatedAt, i: row.id }),
  ).toString("base64url");
async function readTx<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>) {
  const tx = await pool.connect();
  try {
    await tx.query("begin read only");
    const value = await work(tx);
    await tx.query("commit");
    return value;
  } catch (e) {
    await tx.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    tx.release();
  }
}
function canManage(actor: TrustedActor) {
  return actor.role === "owner" || actor.role === "admin";
}
type VisibleRoot = Pick<Root, "visibility" | "responsibleMembershipId"> & {
  id?: string;
  companyId?: string;
};
const visibleId = (row: VisibleRoot) =>
  row.id ?? row.companyId ?? fail("resource_not_found", 404);
async function visible(
  tx: PoolClient,
  actor: TrustedActor,
  kind: Kind,
  rows: VisibleRoot[],
) {
  if (actor.role !== "member") return new Set(rows.map(visibleId));
  if (!rows.length) return new Set<string>();
  const t = tables[kind];
  const teamIds = (
    await tx.query<{ id: string }>(
      `select distinct v.${t.fk} id from ${t.visible} v join team_memberships tm on tm.workspace_id=v.workspace_id and tm.team_id=v.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where v.workspace_id=$1 and v.${t.fk}=any($2::uuid[]) and tm.workspace_membership_id=$3`,
      [actor.workspaceId, rows.map(visibleId), actor.membershipId],
    )
  ).rows.map((r) => r.id);
  return new Set(
    rows
      .filter(
        (r) =>
          r.visibility === "workspace" ||
          r.responsibleMembershipId === actor.membershipId ||
          teamIds.includes(visibleId(r)),
      )
      .map(visibleId),
  );
}
async function options(tx: PoolClient, actor: TrustedActor) {
  if (!canManage(actor)) return { responsibleMemberships: [], teams: [] };
  const [m, t] = await Promise.all([
    tx.query<{ id: string; label: string }>(
      `select m.id,coalesce(nullif(btrim(u.display_name),''),'Workspace member') label from workspace_memberships m join users u on u.id=m.user_id and u.status='active' where m.workspace_id=$1 and m.status='active' order by lower(u.display_name),m.id limit 501`,
      [actor.workspaceId],
    ),
    tx.query<{ id: string; label: string }>(
      `select id,name label from teams where workspace_id=$1 and status='active' order by lower(name),id limit 101`,
      [actor.workspaceId],
    ),
  ]);
  return { responsibleMemberships: m.rows, teams: t.rows };
}
async function assignment(
  tx: PoolClient,
  actor: TrustedActor,
  value: Assignment,
  kind: Kind,
  id?: string,
) {
  const authority = workspaceAuthorityParticipant(tx),
    teamIds = [...new Set(value.visibleTeamIds)].sort();
  await authority.lockReferences({
    workspaceId: actor.workspaceId,
    membershipIds: [value.responsibleMembershipId],
    teamIds: [value.responsibleTeamId, ...teamIds],
  });
  await authority.validateAssignment(
    actor.workspaceId,
    value.responsibleMembershipId,
    value.responsibleTeamId,
  );
  await authority.validateVisibleTeams(actor.workspaceId, teamIds);
  if (value.visibleTeamVersions) {
    const membership = value.responsibleMembershipId
        ? (
            await tx.query<{ version: number }>(
              `select version from workspace_memberships where workspace_id=$1 and id=$2 and status='active' for no key update`,
              [actor.workspaceId, value.responsibleMembershipId],
            )
          ).rows[0]
        : null,
      selected = [
        ...new Set(
          [value.responsibleTeamId, ...teamIds].filter(
            (teamId): teamId is string => teamId !== null,
          ),
        ),
      ].sort(),
      rows = selected.length
        ? (
            await tx.query<{ id: string; version: number }>(
              `select id,version from teams where workspace_id=$1 and id=any($2::uuid[]) and status='active' order by id for no key update`,
              [actor.workspaceId, selected],
            )
          ).rows
        : [],
      versions = new Map(rows.map((row) => [row.id, row.version]));
    if (
      (value.responsibleMembershipId !== null &&
        membership?.version !== value.responsibleMembershipVersion) ||
      rows.length !== selected.length ||
      (value.responsibleTeamId &&
        versions.get(value.responsibleTeamId) !==
          value.responsibleTeamVersion) ||
      teamIds.some(
        (teamId) =>
          versions.get(teamId) !== value.visibleTeamVersions?.[teamId],
      )
    )
      fail("assignment_unavailable", 409);
  }
  if (
    (value.visibility === "workspace" && teamIds.length) ||
    (value.visibility === "teams" && !teamIds.length)
  )
    fail("assignment_unavailable", 409);
  if (id) {
    const t = tables[kind];
    await tx.query(
      `select ${t.fk},team_id from ${t.visible} where workspace_id=$1 and ${t.fk}=$2 order by team_id for update`,
      [actor.workspaceId, id],
    );
  }
  return teamIds;
}
async function setTeams(
  tx: PoolClient,
  actor: TrustedActor,
  kind: Kind,
  id: string,
  teamIds: string[],
) {
  const t = tables[kind];
  await tx.query(
    `delete from ${t.visible} where workspace_id=$1 and ${t.fk}=$2`,
    [actor.workspaceId, id],
  );
  for (const teamId of teamIds)
    await tx.query(
      `insert into ${t.visible}(workspace_id,${t.fk},team_id,created_by_membership_id) values($1,$2,$3,$4)`,
      [actor.workspaceId, id, teamId, actor.membershipId],
    );
}
async function evidence(
  tx: PoolClient,
  input: {
    actor: TrustedActor;
    operation: CustomerGraphOperation;
    action: CustomerGraphAction;
    kind: Kind;
    id: string;
    version: number;
    requestId: string;
    operationId: string;
    changeFields: string[];
  },
) {
  return writeCustomerGraphEvidence(tx, input);
}
async function replay<T>(
  tx: PoolClient,
  actor: TrustedActor,
  operation: IdempotentMutationOperation,
  key: string,
  request: unknown,
  work: (operationId: string) => Promise<T>,
): Promise<T> {
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
    prior = await receipts.find<T>(principal, operation, key);
  if (prior) {
    if (prior.requestHash !== hash) fail("idempotency_conflict", 409);
    return { ...(prior.outcome as object), replayed: true } as T;
  }
  const operationId = randomUUID(),
    outcome = await work(operationId);
  await receipts.save({
    principalKey: principal,
    operation,
    idempotencyKey: key,
    requestHash: hash,
    outcome,
  });
  return outcome;
}
async function root(
  tx: PoolClient,
  actor: TrustedActor,
  kind: Kind,
  id: string,
  lock = false,
): Promise<Root> {
  const t = tables[kind];
  const row = (
    await tx.query<Root>(
      `select id,version,status,display_name "displayName",updated_at::text "updatedAt",responsible_membership_id "responsibleMembershipId",responsible_team_id "responsibleTeamId",visibility,authority_contract_version "authorityContractVersion" from ${t.root} where workspace_id=$1 and id=$2 ${lock ? "for update" : ""}`,
      [actor.workspaceId, id],
    )
  ).rows[0];
  if (!row) fail("resource_not_found", 404);
  return row;
}

export async function listCustomerGraph(
  pool: Pool,
  actor: TrustedActor,
  kind: Kind,
  query: CustomerGraphListQueryV1,
  requestId: string,
  beforeFinalFence?: () => Promise<void>,
) {
  return readTx(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor),
      c = cursor(query.cursor, kind, query.status),
      t = tables[kind];
    const rows = query.bootstrap
      ? []
      : (
          await tx.query<Root>(
            `select r.id,r.version,r.status,r.display_name "displayName",r.updated_at::text "updatedAt",r.responsible_membership_id "responsibleMembershipId",r.responsible_team_id "responsibleTeamId",r.visibility,r.authority_contract_version "authorityContractVersion" from ${t.root} r where r.workspace_id=$1 and r.status=$2 and ($3::timestamptz is null or (r.updated_at,r.id)<($3::timestamptz,$4::uuid)) and ($6::text<>'member' or r.visibility='workspace' or r.responsible_membership_id=$7::uuid or exists(select 1 from ${t.visible} v join team_memberships tm on tm.workspace_id=v.workspace_id and tm.team_id=v.team_id join teams team on team.workspace_id=tm.workspace_id and team.id=tm.team_id and team.status='active' where v.workspace_id=r.workspace_id and v.${t.fk}=r.id and tm.workspace_membership_id=$7::uuid)) order by r.updated_at desc,r.id desc limit $5`,
            [
              current.workspaceId,
              query.status,
              c?.u ?? null,
              c?.i ?? null,
              query.limit + 1,
              current.role,
              current.membershipId,
            ],
          )
        ).rows;
    const safe = rows.slice(0, query.limit),
      more = rows.length > query.limit,
      last = safe.at(-1);
    await beforeFinalFence?.();
    const finalActor = await lookupActiveActor(tx, current),
      ids = safe.map((row) => row.id).sort(),
      finalRows = ids.length
        ? (
            await tx.query<Root>(
              `select r.id,r.version,r.status,r.display_name "displayName",r.updated_at::text "updatedAt",r.responsible_membership_id "responsibleMembershipId",r.responsible_team_id "responsibleTeamId",r.visibility,r.authority_contract_version "authorityContractVersion" from ${t.root} r where r.workspace_id=$1 and r.id=any($2::uuid[]) and ($3::text<>'member' or r.visibility='workspace' or r.responsible_membership_id=$4::uuid or exists(select 1 from ${t.visible} v join team_memberships tm on tm.workspace_id=v.workspace_id and tm.team_id=v.team_id join teams team on team.workspace_id=tm.workspace_id and team.id=tm.team_id and team.status='active' where v.workspace_id=r.workspace_id and v.${t.fk}=r.id and tm.workspace_membership_id=$4::uuid)) order by r.id`,
              [
                finalActor.workspaceId,
                ids,
                finalActor.role,
                finalActor.membershipId,
              ],
            )
          ).rows
        : [],
      finalById = new Map(finalRows.map((row) => [row.id, row]));
    if (
      safe.some((row) => {
        const final = finalById.get(row.id);
        return (
          !final ||
          final.version !== row.version ||
          final.updatedAt !== row.updatedAt ||
          final.displayName !== row.displayName ||
          final.status !== row.status ||
          final.visibility !== row.visibility ||
          final.responsibleMembershipId !== row.responsibleMembershipId ||
          final.responsibleTeamId !== row.responsibleTeamId
        );
      })
    )
      fail("resource_not_found", 404);
    return {
      contractVersion: "customer-graph-list.v1",
      kind,
      capabilities: { canCreate: canManage(finalActor) },
      items: safe.map((r) => {
        const canonical = r.authorityContractVersion === "customer-graph-v1";
        return {
          id: r.id,
          displayName: r.displayName,
          status: r.status,
          version: r.version,
          updatedAt: new Date(r.updatedAt).toISOString(),
          capabilities: {
            canEdit:
              canonical && canManage(finalActor) && r.status === "active",
            canArchive:
              canonical && canManage(finalActor) && r.status === "active",
            canRestore:
              canonical && canManage(finalActor) && r.status === "archived",
          },
          reconciliation: canonical
            ? { required: false, action: "none" }
            : { required: true, action: "authority_adoption_required" },
        };
      }),
      nextCursor: more && last ? encode(kind, query.status, last) : null,
      requestId,
    };
  });
}
const maskedEmail = (value: unknown) =>
  typeof value === "string" && value.includes("@")
    ? `${value[0]}***@${value.split("@")[1]}`
    : null;
const maskedPhone = (value: unknown) =>
  typeof value === "string" && value.length >= 4
    ? `***${value.slice(-4)}`
    : null;
export async function getCustomerGraph(
  pool: Pool,
  actor: TrustedActor,
  kind: Kind,
  id: string,
  requestId: string,
  beforeFinalFence?: () => Promise<void>,
) {
  return readTx(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor),
      r = await root(tx, current, kind, id),
      allowed = await visible(tx, current, kind, [r]);
    if (!allowed.has(id)) fail("resource_not_found", 404);
    const t = tables[kind],
      teamIds = (
        await tx.query<{ teamId: string }>(
          `select team_id "teamId" from ${t.visible} where workspace_id=$1 and ${t.fk}=$2 order by team_id`,
          [current.workspaceId, id],
        )
      ).rows.map((x) => x.teamId),
      canonical = r.authorityContractVersion === "customer-graph-v1";
    type AffiliationRow = {
      id?: string;
      affiliationId: string;
      companyId: string;
      companyName: string;
      roleCode: string;
      isPrimary: boolean;
      version: number;
      status: "active" | "archived";
      displayName: string;
      updatedAt: string;
      responsibleMembershipId: string | null;
      responsibleTeamId: string | null;
      visibility: "workspace" | "teams";
      authorityContractVersion: string;
    };
    await beforeFinalFence?.();
    const finalActor = await lookupActiveActor(tx, current),
      fresh = await root(tx, finalActor, kind, id),
      stillVisible = await visible(tx, finalActor, kind, [fresh]);
    if (
      fresh.version !== r.version ||
      fresh.updatedAt !== r.updatedAt ||
      !stillVisible.has(id)
    )
      fail("resource_not_found", 404);
    const manager = canManage(finalActor),
      raw =
        kind === "company"
          ? (
              await tx.query(
                `select domain_normalized "domain" from companies where workspace_id=$1 and id=$2`,
                [finalActor.workspaceId, id],
              )
            ).rows[0]
          : (
              await tx.query(
                `select first_name "firstName",last_name "lastName",email_display email,phone_display phone from contacts where workspace_id=$1 and id=$2`,
                [finalActor.workspaceId, id],
              )
            ).rows[0],
      detail =
        kind === "company"
          ? {
              domain: manager ? raw.domain : null,
              disclosure: { domain: manager ? "full" : "withheld" },
            }
          : {
              firstName: raw.firstName,
              lastName: raw.lastName,
              email: manager ? raw.email : null,
              phone: manager ? raw.phone : null,
              maskedEmail: maskedEmail(raw.email),
              maskedPhone: maskedPhone(raw.phone),
              disclosure: { channels: manager ? "full" : "masked" },
            };
    const finalAffiliationRows =
        kind === "contact"
          ? (
              await tx.query<AffiliationRow & { companyVisible: boolean }>(
                `select a.id "affiliationId",a.company_id "companyId",c.display_name "companyName",a.role_code "roleCode",a.is_primary "isPrimary",a.version,c.id,c.status,c.display_name "displayName",c.updated_at::text "updatedAt",c.responsible_membership_id "responsibleMembershipId",c.responsible_team_id "responsibleTeamId",c.visibility,c.authority_contract_version "authorityContractVersion",(c.status='active' and ($3::text<>'member' or c.visibility='workspace' or c.responsible_membership_id=$4::uuid or exists(select 1 from company_visible_teams cvt join team_memberships tm on tm.workspace_id=cvt.workspace_id and tm.team_id=cvt.team_id join teams team on team.workspace_id=tm.workspace_id and team.id=tm.team_id and team.status='active' where cvt.workspace_id=c.workspace_id and cvt.company_id=c.id and tm.workspace_membership_id=$4::uuid))) "companyVisible" from contact_company_affiliations a join companies c on c.workspace_id=a.workspace_id and c.id=a.company_id where a.workspace_id=$1 and a.contact_id=$2 and a.lifecycle='active' order by a.company_id,a.id`,
                [
                  finalActor.workspaceId,
                  id,
                  finalActor.role,
                  finalActor.membershipId,
                ],
              )
            ).rows
          : [],
      safeAffiliations = finalAffiliationRows.map((a) =>
        a.companyVisible
          ? {
              affiliationId: a.affiliationId,
              companyId: a.companyId,
              companyName: a.companyName,
              roleCode: a.roleCode,
              isPrimary: a.isPrimary,
              version: a.version,
              companyVisible: true as const,
            }
          : { companyUnavailable: true as const },
      );
    return {
      contractVersion: "customer-graph-detail.v1",
      kind,
      record: {
        ...r,
        ...detail,
        visibleTeamIds: teamIds,
        affiliations: safeAffiliations,
        capabilities: {
          canEdit: canonical && manager && r.status === "active",
          canArchive: canonical && manager && r.status === "active",
          canRestore: canonical && manager && r.status === "archived",
          canManageAffiliations:
            kind === "contact" && canonical && manager && r.status === "active",
          canManageAssignment: canonical && manager && r.status === "active",
        },
        reconciliation: canonical
          ? { required: false, action: "none" }
          : { required: true, action: "authority_adoption_required" },
      },
      options:
        canonical && manager && r.status === "active"
          ? await options(tx, finalActor)
          : { responsibleMemberships: [], teams: [] },
      requestId,
    };
  });
}

export async function createCompany(
  pool: Pool,
  input: {
    actor: TrustedActor;
    command: CompanyCreate;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!canManage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "company-create.v1",
      input.key,
      input.command,
      async (operationId) => {
        const command = companyCommand(input.command),
          teams = await assignment(tx, actor, command, "company"),
          name = command.displayName.trim(),
          domain = normalizeDomain(command.domain),
          profile = "profile" in input.command ? input.command.profile : null,
          revenue = moneyColumns(profile?.annualRevenue ?? null);
        if (profile?.parentCompanyId) {
          const parent = (
            await tx.query<{ version: number }>(
              `select version from companies where workspace_id=$1 and id=$2 and status='active' order by id for update`,
              [actor.workspaceId, profile.parentCompanyId],
            )
          ).rows[0];
          if (!parent || parent.version !== profile.parentCompanyVersion)
            fail("resource_not_found", 404);
        }
        const row = (
          await tx.query<{ id: string; version: number }>(
            `insert into companies(workspace_id,display_name,name_normalized,domain_normalized,normalization_version,status,responsible_membership_id,responsible_team_id,visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version,website_url,industry,size_band,employee_count,annual_revenue_minor,annual_revenue_currency_code,annual_revenue_currency_exponent,parent_company_id,phone_display,street,city,state_province,postal_code,country) values($1,$2,$3,$4,'customer-graph-v1','active',$5,$6,$7,$8,$9,$9,'customer-graph-v1',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning id,version`,
            [
              actor.workspaceId,
              name,
              normalizeName(name),
              domain,
              command.responsibleMembershipId,
              command.responsibleTeamId,
              command.visibility,
              operationId,
              actor.membershipId,
              profile?.website ?? null,
              profile?.industry ?? null,
              profile?.sizeBand ?? null,
              profile?.employeeCount ?? null,
              ...revenue,
              profile?.parentCompanyId ?? null,
              profile?.phone ?? null,
              profile?.address.street ?? null,
              profile?.address.city ?? null,
              profile?.address.stateProvince ?? null,
              profile?.address.postalCode ?? null,
              profile?.address.country ?? null,
            ],
          )
        ).rows[0];
        if (domain)
          await tx.query(
            `insert into company_domain_points(workspace_id,company_id,domain_display,domain_normalized,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,$3,$3,'customer-graph-v1',true,'manual',$4,$5)`,
            [
              actor.workspaceId,
              row.id,
              domain,
              operationId,
              actor.membershipId,
            ],
          );
        await setTeams(tx, actor, "company", row.id, teams);
        const current = await revalidateActiveActor(tx, actor);
        if (!canManage(current)) fail("resource_not_found", 404);
        await evidence(tx, {
          actor: current,
          operation: "company-create.v1",
          action: "crm.company.created",
          kind: "company",
          id: row.id,
          version: row.version,
          requestId: input.requestId,
          operationId,
          changeFields: ["created"],
        });
        return {
          contractVersion: "company-result.v1",
          companyId: row.id,
          version: row.version,
          replayed: false,
          requestId: input.requestId,
        };
      },
    );
  });
}

async function editRoot(
  pool: Pool,
  input: {
    actor: TrustedActor;
    kind: Kind;
    id: string;
    command: CompanyEdit | ContactEdit;
    key: string;
    requestId: string;
  },
) {
  const operation = `${input.kind}-edit.v1` as LeadMutationOperation;
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!canManage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      operation,
      input.key,
      { id: input.id, command: input.command },
      async (operationId) => {
        const old = await root(tx, actor, input.kind, input.id, true);
        if (old.status !== "active") fail("resource_not_found", 404);
        if (old.version !== input.command.expectedVersion)
          fail("stale_version", 409);
        if (old.authorityContractVersion !== "customer-graph-v1")
          fail("authority_conflict", 409);
        const normalized =
            input.kind === "company"
              ? companyCommand(input.command as CompanyEdit)
              : contactCommand(input.command as ContactEdit),
          teams = await assignment(tx, actor, normalized, input.kind, input.id);
        let fields: string[] = [];
        if (input.kind === "company") {
          const c = normalized as ReturnType<typeof companyCommand>,
            name = c.displayName.trim(),
            domain = normalizeDomain(c.domain),
            profile =
              "profile" in input.command
                ? (input.command as CompanyScreenEditCommandV2).profile
                : null,
            revenue = moneyColumns(profile?.annualRevenue ?? null);
          const prior = (
            await tx.query<{ domain: string | null }>(
              `select domain_normalized domain from companies where workspace_id=$1 and id=$2`,
              [actor.workspaceId, input.id],
            )
          ).rows[0];
          if (prior.domain !== domain) {
            await tx.query(
              `update company_domain_points set lifecycle='archived',is_primary=false,version=version+1,governing_operation_id=$3,updated_by_membership_id=$4,archived_at=now(),archived_by_membership_id=$4,updated_at=now() where workspace_id=$1 and company_id=$2 and lifecycle='active' and is_primary`,
              [actor.workspaceId, input.id, operationId, actor.membershipId],
            );
            if (domain)
              await tx.query(
                `insert into company_domain_points(workspace_id,company_id,domain_display,domain_normalized,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,$3,$3,'customer-graph-v1',true,'manual',$4,$5)`,
                [
                  actor.workspaceId,
                  input.id,
                  domain,
                  operationId,
                  actor.membershipId,
                ],
              );
            fields.push("domain");
          }
          if (profile?.parentCompanyId) {
            await tx.query(
              `select pg_advisory_xact_lock(hashtextextended($1,0))`,
              [`customer-graph-parent:${actor.workspaceId}`],
            );
            const ancestry = new Map<string, string | null>();
            let cursor: string | null = profile.parentCompanyId;
            while (cursor) {
              if (cursor === input.id || ancestry.has(cursor))
                fail("resource_not_found", 404);
              if (ancestry.size >= 100) fail("resource_not_found", 404);
              const ancestor:
                | { id: string; parentCompanyId: string | null }
                | undefined = (
                await tx.query<{ id: string; parentCompanyId: string | null }>(
                  `select id,parent_company_id "parentCompanyId" from companies where workspace_id=$1 and id=$2 and status='active'`,
                  [actor.workspaceId, cursor],
                )
              ).rows[0];
              if (!ancestor) fail("resource_not_found", 404);
              ancestry.set(ancestor.id, ancestor.parentCompanyId);
              cursor = ancestor.parentCompanyId;
            }
            const locked = (
              await tx.query<{
                id: string;
                parentCompanyId: string | null;
                version: number;
              }>(
                `select id,parent_company_id "parentCompanyId",version from companies where workspace_id=$1 and id=any($2::uuid[]) and status='active' order by id for update`,
                [actor.workspaceId, [...ancestry.keys()].sort()],
              )
            ).rows;
            if (
              locked.length !== ancestry.size ||
              locked.find((ancestor) => ancestor.id === profile.parentCompanyId)
                ?.version !== profile.parentCompanyVersion ||
              locked.some(
                (ancestor) =>
                  ancestry.get(ancestor.id) !== ancestor.parentCompanyId,
              )
            )
              fail("resource_not_found", 404);
          }
          await tx.query(
            `update companies set display_name=$3,name_normalized=$4,domain_normalized=$5,responsible_membership_id=$6,responsible_team_id=$7,visibility=$8,governing_operation_id=$9,updated_by_membership_id=$10,website_url=case when $26 then $12 else website_url end,industry=case when $26 then $13 else industry end,size_band=case when $26 then $14 else size_band end,employee_count=case when $26 then $15 else employee_count end,annual_revenue_minor=case when $26 then $16 else annual_revenue_minor end,annual_revenue_currency_code=case when $26 then $17 else annual_revenue_currency_code end,annual_revenue_currency_exponent=case when $26 then $18 else annual_revenue_currency_exponent end,parent_company_id=case when $26 then $19 else parent_company_id end,phone_display=case when $26 then $20 else phone_display end,street=case when $26 then $21 else street end,city=case when $26 then $22 else city end,state_province=case when $26 then $23 else state_province end,postal_code=case when $26 then $24 else postal_code end,country=case when $26 then $25 else country end,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$11`,
            [
              actor.workspaceId,
              input.id,
              name,
              normalizeName(name),
              domain,
              c.responsibleMembershipId,
              c.responsibleTeamId,
              c.visibility,
              operationId,
              actor.membershipId,
              input.command.expectedVersion,
              profile?.website ?? null,
              profile?.industry ?? null,
              profile?.sizeBand ?? null,
              profile?.employeeCount ?? null,
              ...revenue,
              profile?.parentCompanyId ?? null,
              profile?.phone ?? null,
              profile?.address.street ?? null,
              profile?.address.city ?? null,
              profile?.address.stateProvince ?? null,
              profile?.address.postalCode ?? null,
              profile?.address.country ?? null,
              profile !== null,
            ],
          );
          fields.push("profile", "assignment");
        } else {
          const c = normalized as ReturnType<typeof contactCommand>,
            profile =
              "profile" in input.command
                ? (input.command as ContactScreenEditCommandV2).profile
                : null,
            name = [c.firstName.trim(), c.lastName?.trim()]
              .filter(Boolean)
              .join(" "),
            email = normalizeEmail(c.email),
            phone = normalizePhone(c.phone);
          const prior = (
            await tx.query<{ email: string | null; phone: string | null }>(
              `select email_normalized email,phone_normalized phone from contacts where workspace_id=$1 and id=$2`,
              [actor.workspaceId, input.id],
            )
          ).rows[0];
          for (const p of [
            {
              kind: "email",
              old: prior.email,
              value: email,
              display: email,
              country: null,
            },
            {
              kind: "phone",
              old: prior.phone,
              value: phone,
              display: phone,
              country: phoneCountry(phone),
            },
          ])
            if (p.old !== p.value) {
              await tx.query(
                `update contact_identity_points set lifecycle='archived',is_primary=false,version=version+1,governing_operation_id=$3,updated_by_membership_id=$4,archived_at=now(),archived_by_membership_id=$4,updated_at=now() where workspace_id=$1 and contact_id=$2 and kind=$5 and lifecycle='active' and is_primary`,
                [
                  actor.workspaceId,
                  input.id,
                  operationId,
                  actor.membershipId,
                  p.kind,
                ],
              );
              if (p.value)
                await tx.query(
                  `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,phone_country_code_used,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,$3,$4,$5,$6,'customer-graph-v1',true,'manual',$7,$8)`,
                  [
                    actor.workspaceId,
                    input.id,
                    p.kind,
                    p.display,
                    p.value,
                    p.country,
                    operationId,
                    actor.membershipId,
                  ],
                );
            }
          if (profile) {
            for (const p of [
              {
                kind: "email",
                usage: "email_secondary",
                value: normalizeEmail(profile.secondaryEmail),
                country: null,
              },
              {
                kind: "phone",
                usage: "phone_mobile",
                value: normalizePhone(profile.mobilePhone),
                country: phoneCountry(profile.mobilePhone),
              },
            ]) {
              await tx.query(
                `update contact_identity_points set lifecycle='archived',is_primary=false,version=version+1,governing_operation_id=$3,updated_by_membership_id=$4,archived_at=now(),archived_by_membership_id=$4,updated_at=now() where workspace_id=$1 and contact_id=$2 and channel_usage=$5 and lifecycle='active'`,
                [
                  actor.workspaceId,
                  input.id,
                  operationId,
                  actor.membershipId,
                  p.usage,
                ],
              );
              if (p.value)
                await tx.query(
                  `insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,phone_country_code_used,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,$3,$4,$5,$5,$6,'customer-graph-v1',false,'manual',$7,$8)`,
                  [
                    actor.workspaceId,
                    input.id,
                    p.kind,
                    p.usage,
                    p.value,
                    p.country,
                    operationId,
                    actor.membershipId,
                  ],
                );
            }
          }
          await tx.query(
            `update contacts set display_name=$3,person_name_normalized=$4,first_name=$5,last_name=$6,email_display=$7,email_normalized=$8,phone_display=$9,phone_normalized=$9,phone_country_code_used=$10,responsible_membership_id=$11,responsible_team_id=$12,visibility=$13,governing_operation_id=$14,updated_by_membership_id=$15,salutation=case when $27 then $17 else salutation end,job_title=case when $27 then $18 else job_title end,department=case when $27 then $19 else department end,linkedin_url=case when $27 then $20 else linkedin_url end,lifecycle_stage=case when $27 then $21 else lifecycle_stage end,street=case when $27 then $22 else street end,city=case when $27 then $23 else city end,state_province=case when $27 then $24 else state_province end,postal_code=case when $27 then $25 else postal_code end,country=case when $27 then $26 else country end,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$16`,
            [
              actor.workspaceId,
              input.id,
              name,
              normalizeName(name),
              c.firstName.trim(),
              c.lastName?.trim() ?? null,
              email,
              email,
              phone,
              phoneCountry(phone),
              c.responsibleMembershipId,
              c.responsibleTeamId,
              c.visibility,
              operationId,
              actor.membershipId,
              input.command.expectedVersion,
              profile?.salutation ?? null,
              profile?.jobTitle ?? null,
              profile?.department ?? null,
              profile?.linkedinUrl ?? null,
              profile?.lifecycleStage ?? null,
              profile?.address.street ?? null,
              profile?.address.city ?? null,
              profile?.address.stateProvince ?? null,
              profile?.address.postalCode ?? null,
              profile?.address.country ?? null,
              profile !== null,
            ],
          );
          fields = ["profile", "assignment"];
        }
        await setTeams(tx, actor, input.kind, input.id, teams);
        const current = await revalidateActiveActor(tx, actor);
        if (!canManage(current)) fail("resource_not_found", 404);
        const resultVersion = old.version + 1;
        await evidence(tx, {
          actor: current,
          operation,
          action: `crm.${input.kind}.updated`,
          kind: input.kind,
          id: input.id,
          version: resultVersion,
          requestId: input.requestId,
          operationId,
          changeFields: fields,
        });
        return {
          contractVersion: `${input.kind}-result.v1`,
          [`${input.kind}Id`]: input.id,
          version: resultVersion,
          replayed: false,
          requestId: input.requestId,
        };
      },
    );
  });
}
export const editCompany = (
  pool: Pool,
  input: {
    actor: TrustedActor;
    companyId: string;
    command: CompanyEdit;
    key: string;
    requestId: string;
  },
) => editRoot(pool, { ...input, kind: "company", id: input.companyId });

export async function createContact(
  pool: Pool,
  input: {
    actor: TrustedActor;
    command: ContactCreate;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!canManage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "contact-create.v1",
      input.key,
      input.command,
      async (operationId) => {
        const command = contactCommand(input.command) as ReturnType<
            typeof contactCommand
          > & { affiliation: { companyId: string; roleCode: string } | null },
          profile = "profile" in input.command ? input.command.profile : null,
          teams = await assignment(tx, actor, command, "contact"),
          companyIds = command.affiliation
            ? [command.affiliation.companyId]
            : [];
        if (companyIds.length) {
          const found = (
            await tx.query<{ id: string; version: number }>(
              `select id,version from companies where workspace_id=$1 and id=any($2::uuid[]) and status='active' order by id for update`,
              [actor.workspaceId, companyIds],
            )
          ).rows;
          if (found.length !== companyIds.length)
            fail("resource_not_found", 404);
          if (
            profile?.company &&
            found[0]?.version !== profile.company.companyVersion
          )
            fail("resource_not_found", 404);
        }
        const name = [command.firstName.trim(), command.lastName?.trim()]
            .filter(Boolean)
            .join(" "),
          email = normalizeEmail(command.email),
          phone = normalizePhone(command.phone),
          row = (
            await tx.query<{ id: string; version: number }>(
              `insert into contacts(workspace_id,display_name,person_name_normalized,first_name,last_name,email_display,email_normalized,phone_display,phone_normalized,phone_country_code_used,normalization_version,company_id,status,responsible_membership_id,responsible_team_id,visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version,salutation,job_title,department,linkedin_url,lifecycle_stage,street,city,state_province,postal_code,country) values($1,$2,$3,$4,$5,$6,$6,$7,$7,$8,'customer-graph-v1',$9,'active',$10,$11,$12,$13,$14,$14,'customer-graph-v1',$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id,version`,
              [
                actor.workspaceId,
                name,
                normalizeName(name),
                command.firstName.trim(),
                command.lastName?.trim() ?? null,
                email,
                phone,
                phoneCountry(phone),
                command.affiliation?.companyId ?? null,
                command.responsibleMembershipId,
                command.responsibleTeamId,
                command.visibility,
                operationId,
                actor.membershipId,
                profile?.salutation ?? null,
                profile?.jobTitle ?? null,
                profile?.department ?? null,
                profile?.linkedinUrl ?? null,
                profile?.lifecycleStage ?? null,
                profile?.address.street ?? null,
                profile?.address.city ?? null,
                profile?.address.stateProvince ?? null,
                profile?.address.postalCode ?? null,
                profile?.address.country ?? null,
              ],
            )
          ).rows[0];
        for (const p of [
          {
            kind: "email",
            usage: "email_primary",
            value: email,
            country: null,
            primary: true,
          },
          {
            kind: "phone",
            usage: "phone_direct",
            value: phone,
            country: phoneCountry(phone),
            primary: false,
          },
          {
            kind: "email",
            usage: "email_secondary",
            value: normalizeEmail(profile?.secondaryEmail ?? null),
            country: null,
            primary: false,
          },
          {
            kind: "phone",
            usage: "phone_mobile",
            value: normalizePhone(profile?.mobilePhone ?? null),
            country: phoneCountry(profile?.mobilePhone ?? null),
            primary: false,
          },
        ])
          if (p.value)
            await tx.query(
              `insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,phone_country_code_used,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,$3,$4,$5,$5,$6,'customer-graph-v1',$7,'manual',$8,$9)`,
              [
                actor.workspaceId,
                row.id,
                p.kind,
                p.usage,
                p.value,
                p.country,
                p.primary,
                operationId,
                actor.membershipId,
              ],
            );
        if (command.affiliation)
          await tx.query(
            `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,valid_from,governing_operation_id,created_by_membership_id) values($1,$2,$3,$4,true,now(),$5,$6)`,
            [
              actor.workspaceId,
              row.id,
              command.affiliation.companyId,
              command.affiliation.roleCode,
              operationId,
              actor.membershipId,
            ],
          );
        await setTeams(tx, actor, "contact", row.id, teams);
        const current = await revalidateActiveActor(tx, actor);
        if (!canManage(current)) fail("resource_not_found", 404);
        await evidence(tx, {
          actor: current,
          operation: "contact-create.v1",
          action: "crm.contact.created",
          kind: "contact",
          id: row.id,
          version: row.version,
          requestId: input.requestId,
          operationId,
          changeFields: ["created"],
        });
        return {
          contractVersion: "contact-result.v1",
          contactId: row.id,
          version: row.version,
          replayed: false,
          requestId: input.requestId,
        };
      },
    );
  });
}
export const editContact = (
  pool: Pool,
  input: {
    actor: TrustedActor;
    contactId: string;
    command: ContactEdit;
    key: string;
    requestId: string;
  },
) => editRoot(pool, { ...input, kind: "contact", id: input.contactId });

export async function changeLifecycle(
  pool: Pool,
  input: {
    actor: TrustedActor;
    kind: Kind;
    id: string;
    expectedVersion: number;
    to: "active" | "archived";
    key: string;
    requestId: string;
  },
) {
  const operation =
    `${input.kind}-${input.to === "active" ? "restore" : "archive"}.v1` as LeadMutationOperation;
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!canManage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      operation,
      input.key,
      { expectedVersion: input.expectedVersion, id: input.id },
      async (operationId) => {
        const old = await root(tx, actor, input.kind, input.id, true);
        if (old.version !== input.expectedVersion) fail("stale_version", 409);
        if (old.authorityContractVersion !== "customer-graph-v1")
          fail("authority_conflict", 409);
        if (old.status === input.to) fail("resource_not_found", 404);
        const t = tables[input.kind],
          archived = input.to === "archived";
        await tx.query(
          `update ${t.root} set status=$3,version=version+1,governing_operation_id=$4,updated_by_membership_id=$5,archived_at=${archived ? "now()" : "null"},archived_by_membership_id=${archived ? "$5" : "null"},updated_at=now() where workspace_id=$1 and id=$2 and version=$6`,
          [
            actor.workspaceId,
            input.id,
            input.to,
            operationId,
            actor.membershipId,
            input.expectedVersion,
          ],
        );
        const current = await revalidateActiveActor(tx, actor);
        if (!canManage(current)) fail("resource_not_found", 404);
        await evidence(tx, {
          actor: current,
          operation,
          action: `crm.${input.kind}.${archived ? "archived" : "restored"}`,
          kind: input.kind,
          id: input.id,
          version: old.version + 1,
          requestId: input.requestId,
          operationId,
          changeFields: ["status"],
        });
        return {
          contractVersion: `${input.kind}-result.v1`,
          [`${input.kind}Id`]: input.id,
          version: old.version + 1,
          replayed: false,
          requestId: input.requestId,
        };
      },
    );
  });
}

export async function replaceContactAffiliation(
  pool: Pool,
  input: {
    actor: TrustedActor;
    contactId: string;
    command: ContactAffiliationReplaceCommandV1;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!canManage(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "contact-affiliation-replace.v1",
      input.key,
      input.command,
      async (operationId) => {
        const contact = await root(tx, actor, "contact", input.contactId, true);
        if (contact.status !== "active") fail("resource_not_found", 404);
        if (contact.version !== input.command.expectedVersion)
          fail("stale_version", 409);
        if (contact.authorityContractVersion !== "customer-graph-v1")
          fail("authority_conflict", 409);
        const companyIds = input.command.affiliation
          ? [input.command.affiliation.companyId]
          : [];
        if (companyIds.length) {
          const companies = (
            await tx.query(
              `select id from companies where workspace_id=$1 and id=any($2::uuid[]) and status='active' order by id for update`,
              [actor.workspaceId, [...companyIds].sort()],
            )
          ).rows;
          if (companies.length !== companyIds.length)
            fail("resource_not_found", 404);
        }
        await tx.query(
          `select id from contact_company_affiliations where workspace_id=$1 and contact_id=$2 and lifecycle='active' order by company_id,id for update`,
          [actor.workspaceId, input.contactId],
        );
        await tx.query(
          `update contact_company_affiliations set lifecycle='ended',version=version+1,valid_to=now(),ended_by_membership_id=$3,governing_operation_id=$4,updated_at=now() where workspace_id=$1 and contact_id=$2 and lifecycle='active'`,
          [actor.workspaceId, input.contactId, actor.membershipId, operationId],
        );
        if (input.command.affiliation)
          await tx.query(
            `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,valid_from,governing_operation_id,created_by_membership_id) values($1,$2,$3,$4,true,now(),$5,$6)`,
            [
              actor.workspaceId,
              input.contactId,
              input.command.affiliation.companyId,
              input.command.affiliation.roleCode,
              operationId,
              actor.membershipId,
            ],
          );
        await tx.query(
          `update contacts set company_id=$3,version=version+1,governing_operation_id=$4,updated_by_membership_id=$5,updated_at=now() where workspace_id=$1 and id=$2 and version=$6`,
          [
            actor.workspaceId,
            input.contactId,
            input.command.affiliation?.companyId ?? null,
            operationId,
            actor.membershipId,
            input.command.expectedVersion,
          ],
        );
        const current = await revalidateActiveActor(tx, actor);
        if (!canManage(current)) fail("resource_not_found", 404);
        await evidence(tx, {
          actor: current,
          operation: "contact-affiliation-replace.v1",
          action: "crm.contact.affiliation_replaced",
          kind: "contact",
          id: input.contactId,
          version: contact.version + 1,
          requestId: input.requestId,
          operationId,
          changeFields: ["affiliation"],
        });
        return {
          contractVersion: "contact-result.v1",
          contactId: input.contactId,
          version: contact.version + 1,
          replayed: false,
          requestId: input.requestId,
        };
      },
    );
  });
}

export async function listCustomerGraphScreenOptions(
  tx: PoolClient,
  actor: TrustedActor,
  input: {
    optionKind: "company" | "parent_company";
    search: string;
    cursor: { label: string; id: string } | null;
    limit: number;
    excludeRecordId?: string;
  },
) {
  const hierarchyQuery =
      input.optionKind === "parent_company" && input.excludeRecordId,
    args = [
      actor.workspaceId,
      input.search,
      input.cursor?.label ?? null,
      input.cursor?.id ?? null,
      input.limit + 1,
      ...(hierarchyQuery ? [input.excludeRecordId] : []),
    ],
    hierarchy =
      hierarchyQuery
        ? `and c.id not in (with recursive descendants(id) as (select $6::uuid union select child.id from companies child join descendants d on child.parent_company_id=d.id where child.workspace_id=$1) select id from descendants)`
        : "",
    rows = (
      await tx.query<{ id: string; label: string; version: number }>(
        `select c.id,c.display_name label,c.version from companies c where c.workspace_id=$1 and c.status='active' and lower(c.display_name) like $2 escape '\\' ${hierarchy} and ($3::text is null or (lower(c.display_name),c.id)>($3,$4::uuid)) order by lower(c.display_name),c.id limit $5 for no key update of c`,
        args,
      )
    ).rows;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    target: { kind: "version" as const, version: row.version },
  }));
}

export async function readCustomerGraphScreenCompanyOption(
  tx: PoolClient,
  actor: TrustedActor,
  companyId: string,
) {
  const row = (
    await tx.query<{ id: string; label: string; version: number }>(
      `select id,display_name label,version from companies where workspace_id=$1 and id=$2 and status='active' for no key update`,
      [actor.workspaceId, companyId],
    )
  ).rows[0];
  return row
    ? {
        id: row.id,
        label: row.label,
        target: { kind: "version" as const, version: row.version },
      }
    : null;
}

export async function lockExplicitScreenCompany(
  tx: PoolClient,
  actor: TrustedActor,
  input: { companyId: string; expectedVersion?: number; snapshotName: string },
) {
  const row = (
    await tx.query<{ id: string; version: number; displayName: string }>(
      `select id,version,display_name "displayName" from companies where workspace_id=$1 and id=$2 and status='active' order by id for no key update`,
      [actor.workspaceId, input.companyId],
    )
  ).rows[0];
  if (
    !row ||
    (input.expectedVersion !== undefined &&
      row.version !== input.expectedVersion) ||
    row.displayName !== input.snapshotName
  )
    fail("resource_not_found", 404);
  return row;
}

export async function evaluateAndLockScreenContactCandidates(
  tx: PoolClient,
  actor: TrustedActor,
  input: { emailNormalized: string | null; phoneNormalized: string | null },
) {
  const contacts = contactTransactionParticipant(tx),
    initial = await contacts.findCandidates({
      workspaceId: actor.workspaceId,
      emailNormalized: input.emailNormalized,
      phoneNormalized: input.phoneNormalized,
    }),
    unique = [...new Map(initial.map((row) => [row.id, row])).values()];
  await contacts.lockCandidateSet(actor.workspaceId, unique);
  const rerun = await contacts.findCandidates({
      workspaceId: actor.workspaceId,
      emailNormalized: input.emailNormalized,
      phoneNormalized: input.phoneNormalized,
    }),
    fresh = [...new Map(rerun.map((row) => [row.id, row])).values()];
  if (
    unique.length !== fresh.length ||
    unique.some(
      (row) =>
        fresh.find((candidate) => candidate.id === row.id)?.version !==
        row.version,
    )
  )
    fail("stale_version", 409);
  return fresh;
}
