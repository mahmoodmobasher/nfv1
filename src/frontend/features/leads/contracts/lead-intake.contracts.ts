export { errorEnvelopeSchema, intakeResultSchema, intakeSuccessEnvelopeSchema, leadInquiryIntakeCommandV1Schema,
  type ErrorEnvelope, type IntakeResult, type LeadInquiryIntakeCommandV1, type P1AError, type SocialPlatform,
  type SourceCategory, type SourceMedium } from "@/frontend/shared/contracts/p1a-transport";
import type { SocialPlatform, SourceCategory } from "@/frontend/shared/contracts/p1a-transport";
export function createManualIntakeBootstrap(now:()=>Date=()=>new Date()){return{intakeChannel:"manual"as const,receivedAt:now().toISOString()}}
export const sourceCategories:[SourceCategory,string][]=[["website","Website"],["referral","Referral"],["outbound","Outbound"],["event","Event"],["partner","Partner"],["social_media","Social media"],["import","Import"],["manual","Manual"],["other","Other"]];
export const socialPlatforms:[SocialPlatform,string][]=[["tiktok","TikTok"],["instagram","Instagram"],["facebook","Facebook"],["linkedin","LinkedIn"],["x","X"],["youtube","YouTube"],["other_social","Other social"]];
