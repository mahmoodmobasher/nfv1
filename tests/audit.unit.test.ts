import {describe,expect,it,vi} from "vitest";
import {auditCorrelation,writeAudit} from "../src/server/security/audit";

describe("audit contract",()=>{
  it("hashes caller correlation material deterministically",()=>{
    const key="caller-idempotency-key-which-must-not-be-stored";
    const value=auditCorrelation("member_change",key);
    expect(value).toBe(auditCorrelation("member_change",key));
    expect(value).not.toContain(key);
  });

  it("normalizes legacy actions and adds safe state plus correlation",async()=>{
    const query=vi.fn().mockResolvedValue({rowCount:1});
    await writeAudit({query} as never,{
      actorUserId:"11111111-1111-4111-8111-111111111111",
      workspaceId:"22222222-2222-4222-8222-222222222222",
      actorMembershipId:"33333333-3333-4333-8333-333333333333",
      action:"workspace.membership_role_changed",targetType:"membership",
      targetId:"44444444-4444-4444-8444-444444444444",outcome:"success",
      metadata:{assigned_role:"admin",expected_version:1,result_version:2},
    });
    const values=query.mock.calls[0][1] as unknown[];
    expect(values[5]).toBe("workspace.membership_changed");
    expect(values[11]).toMatch(/^workspace\.membership_changed:[a-f0-9]{64}$/);
    expect(JSON.parse(values[12] as string)).toEqual({version:1});
    expect(JSON.parse(values[13] as string)).toEqual({version:2,role:"admin"});
  });

  it("rejects non-allowlisted metadata and state before persistence",async()=>{
    const query=vi.fn();
    await expect(writeAudit({query} as never,{action:"workspace.membership_changed",targetType:"membership",outcome:"success",metadata:{email:"private@test.local"}})).rejects.toThrow("non-allowlisted");
    await expect(writeAudit({query} as never,{action:"workspace.membership_changed",targetType:"membership",outcome:"success",before:{token:"secret"}})).rejects.toThrow("non-allowlisted");
    expect(query).not.toHaveBeenCalled();
  });
});
