import type { PoolClient } from "pg";
import {
  lookupActiveActor,
  revalidateActiveActor,
  type TrustedActor,
} from "@/backend/platform/authorization";
import { screenProfileDetailV1Schema } from "@/backend/modules/screen-forms/contracts/screen-forms.contract";

type Kind = "company" | "contact";
const manager = (actor: TrustedActor) =>
  actor.role === "owner" || actor.role === "admin";
const fail = (): never => {
  throw Object.assign(new Error("resource_not_found"), {
    code: "resource_not_found",
    status: 404,
  });
};
const maskedEmail = (value: unknown) =>
  typeof value === "string" && value.includes("@")
    ? `${value[0]}***@${value.split("@")[1]}`
    : null;
const maskedPhone = (value: unknown) =>
  typeof value === "string" && value.length >= 4
    ? `***${value.slice(-4)}`
    : null;
const config = {
  company: {
    root: "companies",
    visible: "company_visible_teams",
    fk: "company_id",
    responsible: "responsible_membership_id",
  },
  contact: {
    root: "contacts",
    visible: "contact_visible_teams",
    fk: "contact_id",
    responsible: "responsible_membership_id",
  },
} as const;

function rootSql(kind: Kind) {
  const c = config[kind];
  return `select r.* from ${c.root} r where r.workspace_id=$1 and r.id=$2 and ($3::text<>'member' or r.visibility='workspace' or r.${c.responsible}=$4 or exists(select 1 from ${c.visible} v join team_memberships tm on tm.workspace_id=v.workspace_id and tm.team_id=v.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where v.workspace_id=r.workspace_id and v.${c.fk}=r.id and tm.workspace_membership_id=$4)) for share of r`;
}

async function assignment(
  tx: PoolClient,
  actor: TrustedActor,
  kind: Kind,
  id: string,
  row: Record<string, unknown>,
  authorized: boolean,
) {
  if (!authorized) return { disclosure: "withheld" as const };
  const c = config[kind],
    membershipId = row.responsible_membership_id as string | null,
    teamId = row.responsible_team_id as string | null,
    [membership, team, visibleTeams] = await Promise.all([
      membershipId
        ? tx.query<{ version: number }>(
            `select version from workspace_memberships where workspace_id=$1 and id=$2 and status='active' for share`,
            [actor.workspaceId, membershipId],
          )
        : Promise.resolve({ rows: [] }),
      teamId
        ? tx.query<{ version: number }>(
            `select version from teams where workspace_id=$1 and id=$2 and status='active' for share`,
            [actor.workspaceId, teamId],
          )
        : Promise.resolve({ rows: [] }),
      tx.query<{ id: string; version: number }>(
        `select t.id,t.version from ${c.visible} v join teams t on t.workspace_id=v.workspace_id and t.id=v.team_id and t.status='active' where v.workspace_id=$1 and v.${c.fk}=$2 order by t.id for share of t`,
        [actor.workspaceId, id],
      ),
    ]);
  if ((membershipId && !membership.rows[0]) || (teamId && !team.rows[0]))
    fail();
  return {
    disclosure: "full" as const,
    value: {
      responsibleMembershipId: membershipId,
      responsibleMembershipVersion: membership.rows[0]?.version ?? null,
      responsibleTeamId: teamId,
      responsibleTeamVersion: team.rows[0]?.version ?? null,
      visibility: row.visibility,
      visibleTeams: visibleTeams.rows,
    },
  };
}

export async function getCustomerGraphScreenProfileV1(
  tx: PoolClient,
  actor: TrustedActor,
  kind: Kind,
  id: string,
  requestId: string,
) {
  const current = await lookupActiveActor(tx, actor),
    sql = rootSql(kind),
    row = (
      await tx.query<Record<string, unknown>>(sql, [
        current.workspaceId,
        id,
        current.role,
        current.membershipId,
      ])
    ).rows[0];
  if (!row) fail();
  const isManager = manager(current);
  let presentation: Record<string, unknown>;
  if (kind === "company") {
    let hierarchy: unknown = { disclosure: "withheld" };
    const parentId = row.parent_company_id as string | null;
    if (isManager) {
      const parent = parentId
        ? (
            await tx.query<{ id: string; label: string; version: number }>(
              `select id,display_name label,version from companies where workspace_id=$1 and id=$2 and status='active' for share`,
              [current.workspaceId, parentId],
            )
          ).rows[0]
        : null;
      if (parentId && !parent) fail();
      hierarchy = { disclosure: "full", value: { parent } };
    }
    presentation = {
      base: {
        name: row.display_name,
        industry: row.industry,
        sizeBand: row.size_band,
        employeeCount: row.employee_count,
      },
      categories: {
        channels: isManager
          ? {
              disclosure: "full",
              value: {
                domain: row.domain_normalized,
                website: row.website_url,
                phone: row.phone_display,
              },
            }
          : { disclosure: "withheld" },
        address: isManager
          ? {
              disclosure: "full",
              value: {
                street: row.street,
                city: row.city,
                stateProvince: row.state_province,
                postalCode: row.postal_code,
                country: row.country,
              },
            }
          : { disclosure: "withheld" },
        revenue: isManager
          ? {
              disclosure: "full",
              value:
                row.annual_revenue_minor === null
                  ? null
                  : {
                      amountMinor: String(row.annual_revenue_minor),
                      currencyCode: row.annual_revenue_currency_code,
                      currencyExponent: row.annual_revenue_currency_exponent,
                    },
            }
          : { disclosure: "withheld" },
        hierarchy,
      },
    };
  } else {
    const points = (
        await tx.query<{ channelUsage: string; displayValue: string }>(
          `select channel_usage "channelUsage",display_value "displayValue" from contact_identity_points where workspace_id=$1 and contact_id=$2 and lifecycle='active' and channel_usage is not null order by channel_usage for share`,
          [current.workspaceId, id],
        )
      ).rows,
      point = (usage: string) =>
        points.find((value) => value.channelUsage === usage)?.displayValue ??
        null;
    let hierarchy: unknown = { disclosure: "withheld" };
    if (isManager) {
      const affiliation =
        (
          await tx.query<{
            id: string;
            label: string;
            version: number;
            roleCode:
              | "employee"
              | "owner"
              | "executive"
              | "decision_maker"
              | "billing"
              | "technical"
              | "advisor"
              | "contractor"
              | "other";
            isPrimary: boolean;
          }>(
            `select c.id,c.display_name label,c.version,a.role_code "roleCode",a.is_primary "isPrimary" from contact_company_affiliations a join companies c on c.workspace_id=a.workspace_id and c.id=a.company_id and c.status='active' where a.workspace_id=$1 and a.contact_id=$2 and a.lifecycle='active' and a.is_primary=true order by c.id for share of a,c`,
            [current.workspaceId, id],
          )
        ).rows[0] ?? null;
      hierarchy = { disclosure: "full", value: { company: affiliation } };
    }
    const primaryEmail = point("email_primary") ?? row.email_display,
      directPhone = point("phone_direct") ?? row.phone_display,
      maskedPrimaryEmail = maskedEmail(primaryEmail);
    presentation = {
      base: {
        salutation: row.salutation,
        firstName: row.first_name,
        lastName: row.last_name,
        jobTitle: row.job_title,
        department: row.department,
        lifecycleStage: row.lifecycle_stage,
      },
      categories: {
        channels: isManager
          ? {
              disclosure: "full",
              value: {
                primaryEmail,
                secondaryEmail: point("email_secondary"),
                directPhone,
                mobilePhone: point("phone_mobile"),
                linkedinUrl: row.linkedin_url,
              },
            }
          : maskedPrimaryEmail
            ? {
                disclosure: "masked",
                value: {
                  primaryEmail: maskedPrimaryEmail,
                  secondaryEmail: maskedEmail(point("email_secondary")),
                  directPhone: maskedPhone(directPhone),
                  mobilePhone: maskedPhone(point("phone_mobile")),
                  linkedinUrl: null,
                },
              }
            : { disclosure: "withheld" },
        address: isManager
          ? {
              disclosure: "full",
              value: {
                street: row.street,
                city: row.city,
                stateProvince: row.state_province,
                postalCode: row.postal_code,
                country: row.country,
              },
            }
          : { disclosure: "withheld" },
        notes: isManager
          ? {
              disclosure: "full",
              value: {
                listRoute: `/api/workspaces/${current.workspaceId}/contacts/${id}/notes`,
              },
            }
          : { disclosure: "withheld" },
        hierarchy,
      },
    };
  }
  const finalActor = await revalidateActiveActor(tx, current),
    fresh = (
      await tx.query<Record<string, unknown>>(sql, [
        finalActor.workspaceId,
        id,
        finalActor.role,
        finalActor.membershipId,
      ])
    ).rows[0];
  if (
    !fresh ||
    fresh.version !== row.version ||
    finalActor.role !== current.role
  )
    fail();
  const canMutate = manager(finalActor) && fresh.status === "active" &&
    fresh.authority_contract_version === "customer-graph-v1";
  return screenProfileDetailV1Schema.parse({
    contractVersion: "screen-profile-detail.v1",
    kind,
    recordId: id,
    version: row.version,
    ...presentation,
    assignment: await assignment(tx, finalActor, kind, id, fresh, canMutate),
    capabilities: {
      canEdit: canMutate,
      canManageAssignment: canMutate,
      canWriteSensitiveProfile: canMutate,
    },
    requestId,
  });
}
