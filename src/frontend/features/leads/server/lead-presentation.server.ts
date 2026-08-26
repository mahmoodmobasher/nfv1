import "server-only";
import type { Pool } from "pg";
import type { TrustedActor } from "@/backend/platform/authorization/authorization-facts";
import { getLeadDetailV1, getLeadOperationalEditV1, listLeadPipelineStagesV1, listLeadSummariesV1 } from "@/backend/modules/leads";
import {
  leadDetailViewSchema,
  leadOperationalEditViewSchema,
  leadPipelineStagesViewSchema,
  leadSummariesViewSchema,
  type LeadDetailView,
  type LeadOperationalEditView,
  type LeadPipelineStagesView,
  type LeadSummariesView,
} from "@/frontend/shared/contracts/p1a-transport";

export type LeadListFilters = { q: string; stageId?: string; cursor?: string; limit: number };

export async function loadLeadSummaries(pool: Pool, actor: TrustedActor, filters: LeadListFilters): Promise<LeadSummariesView> {
  return leadSummariesViewSchema.parse(await listLeadSummariesV1(pool, actor, filters));
}

export async function loadLeadPipelineStages(pool: Pool, actor: TrustedActor): Promise<LeadPipelineStagesView> {
  return leadPipelineStagesViewSchema.parse(await listLeadPipelineStagesV1(pool, actor));
}

export async function loadLeadDetail(pool: Pool, actor: TrustedActor, leadId: string): Promise<LeadDetailView> {
  return leadDetailViewSchema.parse(await getLeadDetailV1(pool, actor, leadId));
}

export async function loadLeadOperationalEdit(pool: Pool, actor: TrustedActor, leadId: string): Promise<LeadOperationalEditView> {
  return leadOperationalEditViewSchema.parse(await getLeadOperationalEditV1(pool, actor, leadId));
}

export function isLeadNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "resource_not_found";
}
