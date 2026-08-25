import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { leadDetailViewV1Schema, leadPipelineStagesViewV1Schema, leadSummariesViewV1Schema,
  optionalPersonPhoneV2, PersonPhoneValidationError } from "../src/backend/modules/leads";
import { leadDetailSuccessEnvelopeSchema, leadDetailViewSchema, leadPipelineStagesSuccessEnvelopeSchema,
  leadPipelineStagesViewSchema, leadSummariesSuccessEnvelopeSchema, leadSummariesViewSchema } from
  "../src/frontend/shared/contracts/p1a-transport";
import { leadCreationFieldPathControls, leadDetailFixture, leadSummariesFixture, pendingReviewLeadFixture, phoneAcceptanceMatrix,
  pipelineStagesFixture, safeLeadSummaryFixture } from "../src/frontend/features/leads/testing/lead-presentation.fixtures";

function canonicalSchema(schema:ZodType):unknown{const normalize=(value:unknown):unknown=>{
  if(Array.isArray(value))return value.map(normalize).sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if(!value||typeof value!=="object")return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>key!=="$schema").sort(([left],[right])=>left.localeCompare(right))
    .map(([key,child])=>[key,normalize(child)]));
};return normalize(toJSONSchema(schema))}

describe("P1A Lead presentation transport contract",()=>{
  it("keeps transport-only Lead and Pipeline schemas in exact backend parity",()=>{
    for(const[frontend,backend]of[[leadSummariesViewSchema,leadSummariesViewV1Schema],
      [leadDetailViewSchema,leadDetailViewV1Schema],[leadPipelineStagesViewSchema,leadPipelineStagesViewV1Schema]]as const)
      expect(canonicalSchema(frontend)).toEqual(canonicalSchema(backend));
  });

  it("accepts safe fixtures and strict success envelopes",()=>{
    expect(leadSummariesSuccessEnvelopeSchema.parse({data:leadSummariesFixture}).data).toEqual(leadSummariesFixture);
    expect(leadDetailSuccessEnvelopeSchema.parse({data:leadDetailFixture}).data).toEqual(leadDetailFixture);
    expect(leadPipelineStagesSuccessEnvelopeSchema.parse({data:pipelineStagesFixture}).data).toEqual(pipelineStagesFixture);
  });

  it("rejects raw PII, private fields, invalid masks, and capability/navigation drift at runtime",()=>{
    for(const contact of [{...safeLeadSummaryFixture.contact,maskedEmail:"taylor@example.test"},
      {...safeLeadSummaryFixture.contact,maskedPhone:"+14165551234"},
      {...safeLeadSummaryFixture.contact,emailNormalized:"taylor@example.test"}])
      expect(leadDetailViewSchema.safeParse({...leadDetailFixture,lead:{...safeLeadSummaryFixture,contact}}).success).toBe(false);
    expect(leadDetailViewSchema.safeParse({...leadDetailFixture,lead:{...pendingReviewLeadFixture,
      capabilities:{...pendingReviewLeadFixture.capabilities,canReview:false}}}).success).toBe(false);
    expect(leadDetailViewSchema.safeParse({...leadDetailFixture,lead:{...safeLeadSummaryFixture,
      nextView:{kind:"lead_detail",leadId:"40000000-0000-4000-8000-000000000099"}}}).success).toBe(false);
    expect(leadPipelineStagesViewSchema.safeParse({...pipelineStagesFixture,items:[...pipelineStagesFixture.items].reverse()}).success).toBe(false);
  });

  it("locks the shared phone acceptance and ordered safe field-error matrix",()=>{
    for(const testCase of phoneAcceptanceMatrix){
      try{const parsed=optionalPersonPhoneV2(testCase.phone,"country"in testCase?testCase.country:undefined);
        expect(testCase.accepted,testCase.label).toBe(true);
        if(testCase.phone.trim()){expect(parsed,testCase.label).not.toBeNull();if("normalized"in testCase){
          expect(parsed?.normalized,testCase.label).toBe(testCase.normalized);expect(parsed?.callingCode,testCase.label).toBe(testCase.callingCode);}}
        else expect(parsed,testCase.label).toBeNull();
      }catch(error){expect(testCase.accepted,testCase.label).toBe(false);expect(error).toBeInstanceOf(PersonPhoneValidationError);
        if(!testCase.accepted&&"fields"in testCase)expect((error as PersonPhoneValidationError).fields).toEqual(testCase.fields);}
    }
    expect(leadCreationFieldPathControls["person.phone"]).toBe("phone");
    expect(leadCreationFieldPathControls["person.phoneCountryOverride"]).toBe("phoneCountry");
  });
});
