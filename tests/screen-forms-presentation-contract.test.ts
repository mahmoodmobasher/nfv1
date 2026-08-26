import { describe, expect, it } from "vitest";
import { screenProfileDetailV1Schema } from "../src/backend/modules/screen-forms";

const id=()=>crypto.randomUUID();
const base={contractVersion:"screen-profile-detail.v1" as const,recordId:id(),version:1,capabilities:{canEdit:false,canManageAssignment:false,canWriteSensitiveProfile:false},assignment:{disclosure:"withheld" as const},requestId:id()};

describe("SCREEN-FORMS-01 detail presentation",()=>{
  it("keeps safe Company fields separate from independently withheld categories",()=>{
    const value={...base,kind:"company" as const,base:{name:"Acme",industry:null,sizeBand:null,employeeCount:null},categories:{channels:{disclosure:"withheld" as const},address:{disclosure:"withheld" as const},revenue:{disclosure:"withheld" as const},hierarchy:{disclosure:"withheld" as const}}};
    expect(screenProfileDetailV1Schema.parse(value)).toEqual(value);
    expect(screenProfileDetailV1Schema.safeParse({...value,categories:{...value.categories,channels:{disclosure:"withheld",value:{phone:"+1 555"}}}}).success).toBe(false);
  });

  it("allows masked channel display without treating it as command input",()=>{
    const workspaceId=id(),contactId=id();
    const value={...base,recordId:contactId,kind:"contact" as const,base:{salutation:null,firstName:"Ada",lastName:"Lovelace",jobTitle:null,department:null,lifecycleStage:"lead" as const},categories:{channels:{disclosure:"masked" as const,value:{primaryEmail:"a***@example.test",secondaryEmail:null,directPhone:"***-***-0100",mobilePhone:null,linkedinUrl:null}},address:{disclosure:"withheld" as const},notes:{disclosure:"full" as const,value:{listRoute:`/api/workspaces/${workspaceId}/contacts/${contactId}/notes`}},hierarchy:{disclosure:"withheld" as const}}};
    expect(screenProfileDetailV1Schema.parse(value)).toEqual(value);
    expect(JSON.stringify(value)).not.toContain("body");
  });

  it("requires an explicit Lead consent envelope and withholds assignment facts independently",()=>{
    const value={...base,kind:"lead" as const,identityReview:{companyDimension:"resolved" as const,contactDimension:"resolved" as const},base:{salutation:null,firstName:"Grace",lastName:"Hopper",jobTitle:null,source:"manual" as const,stageId:id(),rating:"hot" as const,industry:null,employeeCount:null},categories:{channels:{disclosure:"withheld" as const},address:{disclosure:"withheld" as const},revenue:{disclosure:"withheld" as const},consent:{disclosure:"full" as const,value:{promotionalEmailOptOut:true,recordedAt:new Date().toISOString(),source:"manual" as const}},hierarchy:{disclosure:"masked" as const,value:{display:"A***"}}}};
    expect(screenProfileDetailV1Schema.parse(value)).toEqual(value);
    expect(screenProfileDetailV1Schema.safeParse({...value,assignment:{disclosure:"withheld",value:{responsibleMembershipId:id()}}}).success).toBe(false);
    expect(screenProfileDetailV1Schema.parse({...value,categories:{...value.categories,consent:{disclosure:"full",value:null}}})).toMatchObject({categories:{consent:{disclosure:"full",value:null}}});
  });
});
