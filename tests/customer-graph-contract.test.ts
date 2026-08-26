import { describe,expect,it,vi } from "vitest";
import { companyCreateCommandV1Schema, contactCreateCommandV1Schema,customerGraphListQueryV1Schema,customerGraphListViewV1Schema } from "../src/backend/modules/customer-graph";
import { writeCustomerGraphEvidence } from "../src/backend/platform/audit";

describe("CUSTOMER-GRAPH-01 contracts",()=>{
  it("rejects ambiguous visibility and unknown transport fields",()=>{
    expect(companyCreateCommandV1Schema.safeParse({contractVersion:"company-create.v1",displayName:"Acme",domain:null,
      responsibleMembershipId:null,responsibleTeamId:null,visibility:"teams",visibleTeamIds:[]}).success).toBe(false);
    expect(contactCreateCommandV1Schema.safeParse({contractVersion:"contact-create.v1",firstName:"Ada",lastName:null,email:"ada@example.test",phone:null,
      affiliation:null,responsibleMembershipId:null,responsibleTeamId:null,visibility:"workspace",visibleTeamIds:[],companyId:"not-authority"}).success).toBe(false);
  });
  it("allows the categorical domain change code but never disclosure values in Platform evidence",async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]}),actor={workspaceId:crypto.randomUUID(),membershipId:crypto.randomUUID(),userId:crypto.randomUUID(),sessionId:crypto.randomUUID(),role:"owner" as const};
    await writeCustomerGraphEvidence({query} as never,{actor,operation:"company-edit.v1",action:"crm.company.updated",kind:"company",id:crypto.randomUUID(),version:2,requestId:crypto.randomUUID(),operationId:crypto.randomUUID(),changeFields:["domain"]});
    expect(query).toHaveBeenCalledTimes(2);expect(JSON.stringify(query.mock.calls)).not.toContain("example.com");
  });
  it("freezes a PII-free create-capability bootstrap envelope",()=>{expect(customerGraphListQueryV1Schema.parse({bootstrap:true})).toMatchObject({bootstrap:true});expect(customerGraphListViewV1Schema.parse({contractVersion:"customer-graph-list.v1",kind:"company",capabilities:{canCreate:true},items:[],nextCursor:null,requestId:crypto.randomUUID()})).toMatchObject({capabilities:{canCreate:true},items:[]});expect(customerGraphListQueryV1Schema.safeParse({bootstrap:true,cursor:"opaque"}).success).toBe(false)});
});
