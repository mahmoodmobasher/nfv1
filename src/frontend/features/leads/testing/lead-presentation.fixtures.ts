import type { LeadDetailView, LeadPipelineStagesView, LeadSummariesView } from "@/frontend/shared/contracts/p1a-transport";

const leadId="40000000-0000-4000-8000-000000000001",requestId="40000000-0000-4000-8000-000000000002";
export const safeLeadSummaryFixture:LeadSummariesView["items"][number]={
  leadId,displayName:"Taylor Example",structuredName:{firstName:null,lastName:null},
  contact:{contactId:null,maskedEmail:"t***@example.test",maskedPhone:"***1234"},
  company:{companyId:null,displayName:null},assignment:{responsibleMembershipId:null,responsibleMembershipLabel:null,
    responsibleTeamId:null,responsibleTeamLabel:null,isUnassigned:true},
  lifecycle:{code:"new",label:"New",status:"open"},
  stage:{id:"40000000-0000-4000-8000-000000000003",name:"New",status:"active"},version:1,
  identityReviewStatus:"not_required",visibility:"workspace",receivedAt:"2026-08-25T12:00:00.000Z",
  updatedAt:"2026-08-25T12:00:00.000Z",originalAttribution:{sourceCategory:"manual",sourcePlatform:null,
    sourceMedium:"unknown",sourceDetail:{operator_context:"sales desk"},campaignContext:{},
    attributionContractVersion:"p1a-attribution-v1",intakeChannel:"manual"},
  capabilities:{canView:true,canEdit:false,canEditLead:true,canMoveStage:true,canReview:false},nextView:{kind:"lead_detail",leadId},
};
export const pendingReviewLeadFixture:LeadSummariesView["items"][number]={...safeLeadSummaryFixture,
  identityReviewStatus:"pending",capabilities:{canView:true,canEdit:false,canEditLead:true,canMoveStage:true,canReview:true},
  nextView:{kind:"identity_review_detail",leadId}};
export const leadSummariesFixture:LeadSummariesView={contractVersion:"listLeadSummaries.v1",requestId,
  items:[safeLeadSummaryFixture],nextCursor:null};
export const leadDetailFixture:LeadDetailView={contractVersion:"getLeadDetail.v1",requestId,lead:safeLeadSummaryFixture};
export const pipelineStagesFixture:LeadPipelineStagesView={contractVersion:"listLeadPipelineStages.v1",requestId,items:[
  {stageId:"40000000-0000-4000-8000-000000000003",name:"New",position:0,status:"active"},
  {stageId:"40000000-0000-4000-8000-000000000004",name:"Working",position:1,status:"active"},
]};

export const leadCreationFieldPathControls={
  "person.displayName":"displayName","person.email":"email","person.phone":"phone",
  "person.phoneCountryOverride":"phoneCountry","organization.name":"organizationName",
  "organization.domain":"organizationDomain","inquiry.subject":"subject","inquiry.message":"message",
  "source.sourceCategory":"sourceCategory","source.sourcePlatform":"sourcePlatform",
  "source.sourceMedium":"sourceMedium","source.sourceDetail":"platformDetail",
} as const;

export const phoneAcceptanceMatrix=[
  {label:"plain CA",phone:"6473894802",country:"CA" as const,accepted:true,normalized:"+16473894802",callingCode:"+1"},
  {label:"formatted CA",phone:"(647) 389-4802",country:"CA" as const,accepted:true,normalized:"+16473894802",callingCode:"+1"},
  {label:"dotted US selection",phone:"647.389.4802",country:"US" as const,accepted:true,normalized:"+16473894802",callingCode:"+1"},
  {label:"leading one",phone:"16473894802",country:"CA" as const,accepted:true,normalized:"+16473894802",callingCode:"+1"},
  {label:"formatted leading one",phone:"1 (647) 389-4802",country:"US" as const,accepted:true,normalized:"+16473894802",callingCode:"+1"},
  {label:"explicit NANP",phone:"+1 647 389 4802",country:"CA" as const,accepted:true,normalized:"+16473894802",callingCode:"+1"},
  {label:"explicit international",phone:"+44 20 7946 0958",country:"US" as const,accepted:true,normalized:"+442079460958",callingCode:"+44"},
  {label:"email with blank phone",phone:"   ",email:"taylor@example.test",accepted:true},
  {label:"seven digit local",phone:"5551234",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"non-leading-one eleven digit",phone:"26473894802",country:"CA" as const,accepted:false,fields:["person.phone","person.phoneCountryOverride"]},
  {label:"international without plus",phone:"442079460958",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"vanity",phone:"1-800-FLOWERS",country:"US" as const,accepted:false,fields:["person.phone"]},
  {label:"x extension",phone:"6473894802 x123",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"ext extension",phone:"6473894802 ext 123",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"hash extension",phone:"6473894802#123",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"comma extension",phone:"6473894802,123",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"semicolon extension",phone:"6473894802;123",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"multiple plus",phone:"++16473894802",accepted:false,fields:["person.phone"]},
  {label:"middle plus",phone:"647+3894802",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"zero width",phone:"647\u200b3894802",country:"CA" as const,accepted:false,fields:["person.phone"]},
  {label:"national missing country",phone:"6473894802",accepted:false,fields:["person.phone","person.phoneCountryOverride"]},
] as const;
