import"server-only";
import type{Pool}from"pg";
import{getIdentityReviewDetailV1,listIdentityReviewQueueV1}from"@/backend/modules/leads";
import{reviewDetailSchema,reviewQueueSchema}from"../contracts/identity-review.contracts";
type Actor={userId:string;sessionId:string;workspaceId:string;membershipId:string;role:"owner"|"admin"|"member"};
export async function loadIdentityReviewQueue(pool:Pool,actor:Actor,filters:{assignment:"all"|"mine"|"unassigned";evidence:"any"|"email"|"phone"|"name_company";limit:number;cursor?:string}){return reviewQueueSchema.parse(await listIdentityReviewQueueV1(pool,actor,filters))}
export async function loadIdentityReviewDetail(pool:Pool,actor:Actor,leadId:string){return reviewDetailSchema.parse(await getIdentityReviewDetailV1(pool,actor,leadId))}
