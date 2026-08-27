import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  lookupActiveActor,
  revalidateActiveActor,
  workspaceAuthorityParticipant,
  listAuthorityScreenOptions,
  readAuthorityScreenOptionTarget,
  readAuthorityScreenOption,
  assertScreenAssignmentTargetVersions,
  readLeadScreenAssignmentFacts,
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
  evaluateAndLockScreenContactCandidates,
  getCustomerGraphScreenProfileV1,
  listCustomerGraphScreenOptions,
  readCustomerGraphScreenCompanyOption,
  lockExplicitScreenCompany,
} from "@/backend/modules/customer-graph";
import { identityReviewTransactionParticipant } from "@/backend/modules/identity-review";
import { writeLeadScreenAudit } from "@/backend/platform/audit";
import { writeLeadScreenEvent } from "@/backend/platform/outbox";
import {
  listLeadStageScreenOptions,
  readLeadStageScreenOption,
  readLeadStageScreenOptionTarget,
} from "../queries/screen-form-options.participant";
import {
  screenFormBootstrapV1Schema,
  screenProfileDetailV1Schema,
  screenProfileResultV1Schema,
  screenFormOptionsV1Schema,
  screenFormSelectedOptionV1Schema,
  type LeadScreenCreateCommandV2,
  type LeadScreenEditCommandV2,
  type ScreenFormOptionsQueryV1,
  type ScreenFormSelectedOptionQueryV1,
} from "@/backend/modules/screen-forms/contracts/screen-forms.contract";

type Kind = "company" | "contact" | "lead";
const manager = (actor: TrustedActor) =>
  actor.role === "owner" || actor.role === "admin";
const fail = (code: string, status: number): never => {
  throw Object.assign(new Error(code), { code, status });
};
type OptionTarget =
  | { kind: "version"; version: number }
  | { kind: "updated_at"; updatedAt: string };
function selectionFailure(input: {
  field: string;
  optionKind: "company" | "lead_stage" | "assignment_membership" | "assignment_team";
  id: string;
  submittedTarget: OptionTarget;
  currentTarget: OptionTarget | null;
}): never {
  const outcome = input.currentTarget ? "changed" : "unavailable";
  throw Object.assign(new Error("selection_unavailable"), {
    code: "selection_unavailable",
    status: 409,
    fields: [input.field],
    selection: {
      field: input.field,
      optionKind: input.optionKind,
      submitted: { id: input.id, target: input.submittedTarget },
      outcome,
      ...(input.currentTarget ? { currentTarget: input.currentTarget } : {}),
    },
  });
}
const sameTarget = (left: OptionTarget, right: OptionTarget) =>
  left.kind === right.kind &&
  (left.kind === "version"
    ? right.kind === "version" && left.version === right.version
    : right.kind === "updated_at" && left.updatedAt === right.updatedAt);

async function reconcileLeadSelections(
  tx: PoolClient,
  actor: TrustedActor,
  command: LeadScreenCreateCommandV2 | LeadScreenEditCommandV2,
) {
  const company = await readCustomerGraphScreenCompanyOption(
    tx,
    actor,
    command.profile.company.companyId,
  );
  const companyTarget = {
    kind: "version" as const,
    version: command.profile.company.companyVersion,
  };
  if (!company || !sameTarget(companyTarget, company.target))
    selectionFailure({
      field: "profile.company",
      optionKind: "company",
      id: command.profile.company.companyId,
      submittedTarget: companyTarget,
      currentTarget: company?.target ?? null,
    });

  const stageTarget = {
      kind: "updated_at" as const,
      updatedAt: command.profile.stageUpdatedAt,
    },
    currentStageTarget = await readLeadStageScreenOptionTarget(
      tx,
      actor,
      command.profile.stageId,
    );
  if (!currentStageTarget || !sameTarget(stageTarget, currentStageTarget))
    selectionFailure({
      field: "profile.stageId",
      optionKind: "lead_stage",
      id: command.profile.stageId,
      submittedTarget: stageTarget,
      currentTarget: currentStageTarget,
    });

  const assignmentTargets: Array<{
    field: string;
    optionKind: "assignment_membership" | "assignment_team";
    id: string;
    target: OptionTarget;
  }> = [
    ...(command.assignment.responsibleMembershipId &&
    command.assignment.responsibleMembershipVersion !== null
      ? [{
      field: "assignment.responsibleMembershipId",
      optionKind: "assignment_membership" as const,
      id: command.assignment.responsibleMembershipId,
      target: {
        kind: "version" as const,
        version: command.assignment.responsibleMembershipVersion,
      },
    }]
      : []),
    ...(command.assignment.responsibleTeamId &&
    command.assignment.responsibleTeamVersion !== null
      ? [{
      field: "assignment.responsibleTeamId",
      optionKind: "assignment_team" as const,
      id: command.assignment.responsibleTeamId,
      target: {
        kind: "version" as const,
        version: command.assignment.responsibleTeamVersion,
      },
    }]
      : []),
    ...command.assignment.visibleTeamIds.map((id) => ({
      field: "assignment.visibleTeamIds",
      optionKind: "assignment_team" as const,
      id,
      target: {
        kind: "version" as const,
        version: command.assignment.visibleTeamVersions[id],
      },
    })),
  ];
  const lockGroups = new Map<
    string,
    {
      optionKind: "assignment_membership" | "assignment_team";
      id: string;
      selections: typeof assignmentTargets;
    }
  >();
  for (const selected of assignmentTargets) {
    const key = `${selected.optionKind}:${selected.id}`,
      group = lockGroups.get(key);
    if (group) group.selections.push(selected);
    else
      lockGroups.set(key, {
        optionKind: selected.optionKind,
        id: selected.id,
        selections: [selected],
      });
  }
  const orderedGroups = [...lockGroups.values()].sort(
    (left, right) =>
      left.optionKind.localeCompare(right.optionKind) ||
      left.id.localeCompare(right.id),
  );
  for (const group of orderedGroups) {
    const currentTarget = await readAuthorityScreenOptionTarget(tx, actor, {
      optionKind: group.optionKind,
      id: group.id,
    });
    for (const selected of [...group.selections].sort((left, right) =>
      left.field.localeCompare(right.field),
    ))
      if (!currentTarget || !sameTarget(selected.target, currentTarget))
        selectionFailure({
          field: selected.field,
          optionKind: selected.optionKind,
          id: selected.id,
          submittedTarget: selected.target,
          currentTarget,
        });
  }
}
const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const phone = (value: string | null) =>
  value ? value.replace(/[^+\d]/g, "") : null;
const phoneCountry = (value: string | null) =>
  value
    ? value.match(/^\+(\d{1,3})/)?.[1]
      ? `+${value.match(/^\+(\d{1,3})/)![1]}`
      : "+unknown"
    : null;

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

type OptionCursor = { label: string; id: string };
const encodeOptionCursor = (value: OptionCursor) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function decodeOptionCursor(value?: string): OptionCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed.label !== "string" ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.id,
      )
    )
      fail("validation_failed", 400);
    return parsed;
  } catch {
    return fail("validation_failed", 400);
  }
}
export async function listScreenFormOptionsV1(
  pool: Pool,
  actor: TrustedActor,
  query: ScreenFormOptionsQueryV1,
  requestId: string,
) {
  return runModuleTransaction(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor);
    if (!manager(current)) fail("resource_not_found", 404);
    const cursor = decodeOptionCursor(query.cursor),
      search = `%${query.query.toLocaleLowerCase("en-US").replace(/[\\%_]/g, "\\$&")}%`,
      common = { search, cursor, limit: query.limit };
    const selected =
      query.optionKind === "company" || query.optionKind === "parent_company"
        ? await listCustomerGraphScreenOptions(tx, current, {
            ...common,
            optionKind: query.optionKind,
            excludeRecordId: query.excludeRecordId,
          })
        : query.optionKind === "lead_stage"
          ? await listLeadStageScreenOptions(tx, current, common)
          : await listAuthorityScreenOptions(tx, current, {
              ...common,
              optionKind: query.optionKind,
            });
    const finalActor = await revalidateActiveActor(tx, current);
    if (!manager(finalActor)) fail("resource_not_found", 404);
    const more = selected.length > query.limit,
      items = selected.slice(0, query.limit),
      last = items.at(-1);
    return screenFormOptionsV1Schema.parse({
      contractVersion: "screen-form-options.v1",
      kind: query.kind,
      optionKind: query.optionKind,
      items,
      nextCursor:
        more && last
          ? encodeOptionCursor({
              label: last.label.toLocaleLowerCase("en-US"),
              id: last.id,
            })
          : null,
      requestId,
    });
  });
}

export async function getScreenFormSelectedOptionV1(
  pool: Pool,
  actor: TrustedActor,
  query: ScreenFormSelectedOptionQueryV1,
  requestId: string,
) {
  return runModuleTransaction(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor);
    if (!manager(current) || query.kind !== "lead")
      fail("resource_not_found", 404);
    const selected =
      query.optionKind === "company"
        ? await readCustomerGraphScreenCompanyOption(tx, current, query.id)
        : query.optionKind === "lead_stage"
          ? await readLeadStageScreenOption(tx, current, query.id)
          : query.optionKind === "assignment_membership" ||
              query.optionKind === "assignment_team"
            ? await readAuthorityScreenOption(tx, current, {
                optionKind: query.optionKind,
                id: query.id,
              })
            : null;
    const finalActor = await revalidateActiveActor(tx, current);
    if (!manager(finalActor)) fail("resource_not_found", 404);
    const outcome = !selected
      ? { submitted: { id: query.id, target: query.target }, outcome: "unavailable" as const }
      : sameTarget(query.target, selected.target)
        ? {
            submitted: { id: query.id, target: query.target },
            outcome: "unchanged" as const,
            current: selected,
          }
        : {
            submitted: { id: query.id, target: query.target },
            outcome: "changed" as const,
            current: selected,
          };
    return screenFormSelectedOptionV1Schema.parse({
      contractVersion: "screen-form-selected-option.v1",
      kind: query.kind,
      optionKind: query.optionKind,
      selected: outcome,
      requestId,
    });
  });
}
async function assignment(
  tx: PoolClient,
  actor: TrustedActor,
  value: LeadScreenCreateCommandV2["assignment"],
) {
  const authority = workspaceAuthorityParticipant(tx),
    teams = [...value.visibleTeamIds].sort();
  await authority.lockReferences({
    workspaceId: actor.workspaceId,
    membershipIds: [value.responsibleMembershipId],
    teamIds: [value.responsibleTeamId, ...teams],
  });
  await authority.validateAssignment(
    actor.workspaceId,
    value.responsibleMembershipId,
    value.responsibleTeamId,
  );
  await authority.validateVisibleTeams(actor.workspaceId, teams);
  await assertScreenAssignmentTargetVersions(tx, actor, value);
  return teams;
}
async function evidence(
  tx: PoolClient,
  input: {
    actor: TrustedActor;
    leadId: string;
    version: number;
    requestId: string;
    operationId: string;
    operation: string;
    action: string;
    fields: string[];
  },
) {
  await writeLeadScreenAudit(tx, input);
  await writeLeadScreenEvent(tx, {
    workspaceId: input.actor.workspaceId,
    leadId: input.leadId,
    version: input.version,
    requestId: input.requestId,
    operationId: input.operationId,
    action: input.action,
    fields: input.fields,
  });
}

export async function getScreenFormBootstrapV1(
  pool: Pool,
  actor: TrustedActor,
  kind: Kind,
  requestId: string,
) {
  return runModuleTransaction(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor),
      canManage = manager(current);
    if (!canManage)
      return screenFormBootstrapV1Schema.parse({
        contractVersion: "screen-form-bootstrap.v1",
        kind,
        capabilities: {
          canCreate: false,
          canCreateCompany: false,
          canManageAssignment: false,
          canWriteSensitiveProfile: false,
        },
        requestId,
      });
    const finalActor = await revalidateActiveActor(tx, current);
    if (!manager(finalActor)) fail("resource_not_found", 404);
    return screenFormBootstrapV1Schema.parse({
      contractVersion: "screen-form-bootstrap.v1",
      kind,
      capabilities: {
        canCreate: true,
        canCreateCompany: kind === "lead",
        canManageAssignment: true,
        canWriteSensitiveProfile: true,
      },
      requestId,
    });
  });
}

export async function getScreenProfileV1(
  pool: Pool,
  actor: TrustedActor,
  kind: Kind,
  id: string,
  requestId: string,
) {
  return runModuleTransaction(pool, async (tx) => {
    const current = await lookupActiveActor(tx, actor);
    if (kind !== "lead")
      return getCustomerGraphScreenProfileV1(tx, current, kind, id, requestId);
    const row = (
      await tx.query<Record<string, unknown>&{id:string;owner_membership_id:string|null;visibility:string}>(
        `select * from leads where workspace_id=$1 and id=$2`,
        [current.workspaceId, id],
      )
    ).rows[0];
    if (
      !row ||
      !(await workspaceAuthorityParticipant(tx).canDiscloseLead(current, row))
    )
      fail("resource_not_found", 404);
    const finalActor = await revalidateActiveActor(tx, current),
      fresh = (
        await tx.query<Record<string, unknown>&{id:string;owner_membership_id:string|null;visibility:string}>(
          `select * from leads where workspace_id=$1 and id=$2 for key share`,
          [finalActor.workspaceId, id],
        )
      ).rows[0];
    if (
      !fresh ||
      fresh.version !== row.version ||
      !(await workspaceAuthorityParticipant(tx).canDiscloseLead(
        finalActor,
        fresh,
      ))
    )
      fail("resource_not_found", 404);
    const companyId = String(fresh.company_id),company=await lockExplicitScreenCompany(tx, finalActor, {
      companyId,
      snapshotName: String(fresh.company),
    });
    await getCustomerGraphScreenProfileV1(
      tx,
      finalActor,
      "company",
      companyId,
      requestId,
    );
    const stage = (
      await tx.query<{ updatedAt: string }>(
        `select updated_at::text "updatedAt" from pipeline_stages where workspace_id=$1 and id=$2 and status='active' for key share`,
        [finalActor.workspaceId, fresh.stage_id],
      )
    ).rows[0];
    if (!stage) fail("resource_not_found", 404);
    const identityReview = await identityReviewTransactionParticipant(
      tx,
    ).screenReviewSummary(finalActor.workspaceId, id, String(fresh.identity_review_status), fresh.company_id as string | null, true);
    if (!identityReview) fail("authority_conflict", 409);
    const full = manager(finalActor),
      assignment = full
        ? await readLeadScreenAssignmentFacts(tx, finalActor, {
            leadId: id,
            ownerMembershipId: fresh.owner_membership_id as string | null,
            responsibleTeamId: fresh.responsible_team_id as string | null,
            visibility: fresh.visibility as "workspace" | "teams",
          })
        : null,
      address = {
        street: fresh.street ?? null,
        city: fresh.city ?? null,
        stateProvince: fresh.state_province ?? null,
        postalCode: fresh.postal_code ?? null,
        country: fresh.country ?? null,
      },
      money =
        fresh.annual_revenue_minor === null
          ? null
          : {
              amountMinor: String(fresh.annual_revenue_minor),
              currencyCode: fresh.annual_revenue_currency_code,
              currencyExponent: fresh.annual_revenue_currency_exponent,
            },
      mask = (value: unknown) =>
        typeof value === "string" && value.includes("@")
          ? `${value[0]}***@${value.split("@")[1]}`
          : "withheld";
    return screenProfileDetailV1Schema.parse({
      contractVersion: "screen-profile-detail.v1",
      kind: "lead",
      recordId: id,
      version: Number(fresh.version),
      base: {
        salutation: fresh.salutation ?? null,
        firstName: fresh.first_name,
        lastName: fresh.last_name,
        jobTitle: fresh.job_title ?? null,
        source: fresh.source,
        sourcePlatform: fresh.source_platform ?? null,
        stageId: fresh.stage_id,
        stageUpdatedAt: new Date(stage.updatedAt).toISOString(),
        rating: fresh.rating ?? null,
        industry: fresh.industry ?? null,
        employeeCount: fresh.employee_count ?? null,
      },
      identityReview,
      categories: {
        channels: full
          ? {
              disclosure: "full",
              value: {
                primaryEmail: fresh.email_display,
                secondaryEmail: fresh.secondary_email_display ?? null,
                officePhone: fresh.phone ?? null,
                mobilePhone: fresh.mobile_phone_display ?? null,
                fax: fresh.fax_display ?? null,
                website: fresh.website_url ?? null,
                twitterHandle: fresh.twitter_handle ?? null,
              },
            }
          : {
              disclosure: "masked",
              value: {
                primaryEmail: mask(fresh.email_display),
                secondaryEmail: null,
                officePhone: null,
                mobilePhone: null,
                fax: null,
                website: null,
                twitterHandle: null,
              },
            },
        address: full
          ? { disclosure: "full", value: address }
          : { disclosure: "withheld" },
        revenue: full
          ? { disclosure: "full", value: money }
          : { disclosure: "withheld" },
        consent: full
          ? {
              disclosure: "full",
              value:
                fresh.promotional_email_opt_out === null
                  ? null
                  : {
                      promotionalEmailOptOut:
                        fresh.promotional_email_opt_out,
                      recordedAt: new Date(
                        String(fresh.promotional_email_opt_out_recorded_at),
                      ).toISOString(),
                      source: fresh.promotional_email_opt_out_source,
                    },
            }
          : { disclosure: "withheld" },
        hierarchy: full
          ? {
              disclosure: "full",
              value: {
                company: {
                  id: companyId,
                  label: String(fresh.company),
              version: company.version,
                },
              },
            }
          : { disclosure: "withheld" },
      },
      assignment: full
        ? { disclosure: "full", value: assignment }
        : { disclosure: "withheld" },
      capabilities: {
        canEdit: full,
        canManageAssignment: full,
        canWriteSensitiveProfile: full,
      },
      requestId,
    });
  });
}

export async function createLeadScreenV2(
  pool: Pool,
  input: {
    actor: TrustedActor;
    command: LeadScreenCreateCommandV2;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!manager(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "lead-screen-create.v2",
      input.key,
      input.command,
      async (operationId) => {
        const p = input.command.profile;
        await reconcileLeadSelections(tx, actor, input.command);
        const teams = await assignment(tx, actor, input.command.assignment),
          company = await lockExplicitScreenCompany(tx, actor, {
            companyId: p.company.companyId,
            expectedVersion: p.company.companyVersion,
            snapshotName: p.company.snapshotName,
          }),
          contactCandidates = await evaluateAndLockScreenContactCandidates(
            tx,
            actor,
            {
              emailNormalized: p.primaryEmail.toLowerCase(),
              phoneNormalized: phone(p.officePhone),
            },
          ),
          stage = (
            await tx.query<{ id: string; updatedAt: string }>(
              `select id,updated_at::text "updatedAt" from pipeline_stages where workspace_id=$1 and id=$2 and status='active' for no key update`,
              [actor.workspaceId, p.stageId],
            )
          ).rows[0];
        if (!stage) fail("authority_conflict", 409);
        const revenue = p.annualRevenue
            ? [p.annualRevenue.amountMinor, p.annualRevenue.currencyCode, 2]
            : [null, null, null],
          office = phone(p.officePhone),
          mobile = phone(p.mobilePhone),
          fax = phone(p.fax),
          row = (
            await tx.query<{ id: string; version: number; reviewStatus: string }>(
              `insert into leads(workspace_id,display_name,person_name_normalized,first_name,last_name,salutation,job_title,email_normalized,email_display,secondary_email_normalized,secondary_email_display,company,company_id,phone,phone_normalized,phone_country_code_used,mobile_phone_display,mobile_phone_normalized,mobile_phone_country_code_used,fax_display,fax_normalized,fax_country_code_used,website_url,twitter_handle,promotional_email_opt_out,promotional_email_opt_out_recorded_at,promotional_email_opt_out_source,rating,industry,annual_revenue_minor,annual_revenue_currency_code,annual_revenue_currency_exponent,employee_count,street,city,state_province,postal_code,country,normalization_version,source,original_source_category,original_source_medium,attribution_contract_version,intake_channel,received_at,status,lifecycle_definition_id,identity_review_status,stage_id,owner_membership_id,responsible_team_id,visibility,authority_contract_version,governing_operation_id,created_by_membership_id,updated_by_membership_id,source_platform,original_source_platform) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,case when $23::boolean is null then null else now() end,case when $23::boolean is null then null else 'manual' end,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,'p1a-identity-v2',$35,$35,'unknown','p1a-attribution-v1','manual',now(),'open',(select id from lead_lifecycle_definitions where code='new' and status='active'),$42,$36,$37,$38,$39,'p1a-lead-v1',$40,$41,$41,$43,$43) returning id,version,identity_review_status "reviewStatus"`,
              [
                actor.workspaceId,
                `${p.firstName} ${p.lastName}`,
                normalize(`${p.firstName} ${p.lastName}`),
                p.firstName,
                p.lastName,
                p.salutation,
                p.jobTitle,
                p.primaryEmail.toLowerCase(),
                p.secondaryEmail?.toLowerCase() ?? null,
                p.company.snapshotName,
                p.company.companyId,
                p.officePhone,
                office,
                phoneCountry(office),
                p.mobilePhone,
                mobile,
                phoneCountry(mobile),
                p.fax,
                fax,
                phoneCountry(fax),
                p.website,
                p.twitterHandle,
                p.promotionalEmailOptOut,
                p.rating,
                p.industry,
                ...revenue,
                p.employeeCount,
                p.address.street,
                p.address.city,
                p.address.stateProvince,
                p.address.postalCode,
                p.address.country,
                p.source,
                p.stageId,
                input.command.assignment.responsibleMembershipId,
                input.command.assignment.responsibleTeamId,
                input.command.assignment.visibility,
                operationId,
                actor.membershipId,
                contactCandidates.length ? "pending" : "resolved",
                p.sourcePlatform ?? null,
              ],
            )
          ).rows[0];
        for (const teamId of teams)
          await tx.query(
            `insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)`,
            [actor.workspaceId, row.id, teamId],
          );
        const intake = (
            await tx.query<{ id: string }>(
              `insert into lead_intakes(workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,contract_version,normalization_version,attribution_contract_version,source_category,source_medium,state,lead_id,outcome,source_platform) values($1,'manual',$2,$3,$4,'lead-inquiry-intake.v1','p1a-identity-v2','p1a-attribution-v1',$5,'unknown','committed',$6,'{}',$7) returning id`,
              [
                actor.workspaceId,
                `screen-${input.key}`.slice(0, 128),
                actor.membershipId,
                canonicalRequestHash(input.command),
                p.source,
                row.id,
                p.sourcePlatform ?? null,
              ],
            )
          ).rows[0],
          reviewId = randomUUID();
        await identityReviewTransactionParticipant(
          tx,
        ).openExplicitCompanyScreenReview({
          workspaceId: actor.workspaceId,
          intakeId: intake.id,
          leadId: row.id,
          reviewId,
          company,
          contacts: contactCandidates,
          actorMembershipId: actor.membershipId,
          idempotencyKey: `screen-decision-${input.key}`.slice(0, 128),
          requestHash: canonicalRequestHash({
            companyId: company.id,
            companyVersion: company.version,
            contactDisposition: input.command.contactDisposition,
          }),
          requestId: input.requestId,
          correlationId: operationId,
          normalizationVersion: "p1a-identity-v2",
        });
        const final = await revalidateActiveActor(tx, actor);
        if (!manager(final)) fail("resource_not_found", 404);
        const identityReview = await identityReviewTransactionParticipant(
          tx,
        ).screenReviewSummary(
          final.workspaceId,
          row.id,
          row.reviewStatus,
          company.id,
          true,
        );
        if (!identityReview) fail("authority_conflict", 409);
        await evidence(tx, {
          actor: final,
          leadId: row.id,
          version: row.version,
          requestId: input.requestId,
          operationId,
          operation: "lead-screen-create.v2",
          action: "crm.lead.profile_created",
          fields: ["created", "profile", "assignment"],
        });
        return screenProfileResultV1Schema.parse({
          contractVersion: "screen-profile-result.v1",
          kind: "lead",
          recordId: row.id,
          version: row.version,
          replayed: false,
          requestId: input.requestId,
          identityReview,
        });
      },
    );
  });
}

export async function editLeadScreenV2(
  pool: Pool,
  input: {
    actor: TrustedActor;
    leadId: string;
    command: LeadScreenEditCommandV2;
    key: string;
    requestId: string;
  },
) {
  return runModuleTransaction(pool, async (tx) => {
    const actor = await lookupActiveActor(tx, input.actor);
    if (!manager(actor)) fail("resource_not_found", 404);
    return replay(
      tx,
      actor,
      "lead-screen-edit.v2",
      input.key,
      { leadId: input.leadId, command: input.command },
      async (operationId) => {
        const p = input.command.profile,
          old = (
            await tx.query<{ version: number; companyId: string | null; reviewStatus: string }>(
              `select version,company_id "companyId",identity_review_status "reviewStatus" from leads where workspace_id=$1 and id=$2 for update`,
              [actor.workspaceId, input.leadId],
            )
          ).rows[0];
        if (!old) fail("resource_not_found", 404);
        if (old.version !== input.command.expectedVersion)
          fail("stale_version", 409);
        if (old.companyId !== p.company.companyId)
          selectionFailure({
            field: "profile.company",
            optionKind: "company",
            id: p.company.companyId,
            submittedTarget: {
              kind: "version",
              version: p.company.companyVersion,
            },
            currentTarget: null,
          });
        await reconcileLeadSelections(tx, actor, input.command);
        const teams = await assignment(tx, actor, input.command.assignment),
          company = await lockExplicitScreenCompany(tx, actor, {
            companyId: p.company.companyId,
            expectedVersion: p.company.companyVersion,
            snapshotName: p.company.snapshotName,
          }),
          stage = (
            await tx.query<{ id: string; updatedAt: string }>(
              `select id,updated_at::text "updatedAt" from pipeline_stages where workspace_id=$1 and id=$2 and status='active' for no key update`,
              [actor.workspaceId, p.stageId],
            )
          ).rows[0];
        if (!company || !stage) fail("authority_conflict", 409);
        const revenue = p.annualRevenue
            ? [p.annualRevenue.amountMinor, p.annualRevenue.currencyCode, 2]
            : [null, null, null],
          office = phone(p.officePhone),
          mobile = phone(p.mobilePhone),
          fax = phone(p.fax),
          updated = (
            await tx.query<{ version: number }>(
              `update leads set display_name=$3,person_name_normalized=$4,first_name=$5,last_name=$6,salutation=$7,job_title=$8,email_normalized=$9,email_display=$9,secondary_email_normalized=$10,secondary_email_display=$10,company=$11,phone=$12,phone_normalized=$13,phone_country_code_used=$14,mobile_phone_display=$15,mobile_phone_normalized=$16,mobile_phone_country_code_used=$17,fax_display=$18,fax_normalized=$19,fax_country_code_used=$20,website_url=$21,twitter_handle=$22,promotional_email_opt_out_recorded_at=case when $23::boolean is null then null when promotional_email_opt_out is distinct from $23 then now() else promotional_email_opt_out_recorded_at end,promotional_email_opt_out_source=case when $23::boolean is null then null when promotional_email_opt_out is distinct from $23 then 'manual' else promotional_email_opt_out_source end,promotional_email_opt_out=$23,source=$24,source_platform=$43,rating=$25,industry=$26,annual_revenue_minor=$27,annual_revenue_currency_code=$28,annual_revenue_currency_exponent=$29,employee_count=$30,street=$31,city=$32,state_province=$33,postal_code=$34,country=$35,stage_id=$36,owner_membership_id=$37,responsible_team_id=$38,visibility=$39,governing_operation_id=$40,updated_by_membership_id=$41,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$42 returning version`,
              [
                actor.workspaceId,
                input.leadId,
                `${p.firstName} ${p.lastName}`,
                normalize(`${p.firstName} ${p.lastName}`),
                p.firstName,
                p.lastName,
                p.salutation,
                p.jobTitle,
                p.primaryEmail.toLowerCase(),
                p.secondaryEmail?.toLowerCase() ?? null,
                p.company.snapshotName,
                p.officePhone,
                office,
                phoneCountry(office),
                p.mobilePhone,
                mobile,
                phoneCountry(mobile),
                p.fax,
                fax,
                phoneCountry(fax),
                p.website,
                p.twitterHandle,
                p.promotionalEmailOptOut,
                p.source,
                p.rating,
                p.industry,
                ...revenue,
                p.employeeCount,
                p.address.street,
                p.address.city,
                p.address.stateProvince,
                p.address.postalCode,
                p.address.country,
                p.stageId,
                input.command.assignment.responsibleMembershipId,
                input.command.assignment.responsibleTeamId,
                input.command.assignment.visibility,
                operationId,
                actor.membershipId,
                input.command.expectedVersion,
                p.sourcePlatform ?? null,
              ],
            )
          ).rows[0];
        await tx.query(
          `delete from lead_visible_teams where workspace_id=$1 and lead_id=$2`,
          [actor.workspaceId, input.leadId],
        );
        for (const teamId of teams)
          await tx.query(
            `insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)`,
            [actor.workspaceId, input.leadId, teamId],
          );
        const final = await revalidateActiveActor(tx, actor);
        if (!manager(final)) fail("resource_not_found", 404);
        const identityReview = await identityReviewTransactionParticipant(
          tx,
        ).screenReviewSummary(final.workspaceId, input.leadId, old.reviewStatus, old.companyId, true);
        if (!identityReview) fail("authority_conflict", 409);
        await evidence(tx, {
          actor: final,
          leadId: input.leadId,
          version: updated.version,
          requestId: input.requestId,
          operationId,
          operation: "lead-screen-edit.v2",
          action: "crm.lead.profile_updated",
          fields: ["profile", "assignment", "stage"],
        });
        return screenProfileResultV1Schema.parse({
          contractVersion: "screen-profile-result.v1",
          kind: "lead",
          recordId: input.leadId,
          version: updated.version,
          replayed: false,
          requestId: input.requestId,
          identityReview,
        });
      },
    );
  });
}
