import{describe,expect,it}from"vitest";import{POST}from"../src/app/api/workspaces/switch/route";
describe("workspace switch route guard",()=>{
 it("rejects missing CSRF before database work",async()=>{const response=await POST(new Request("http://127.0.0.1:3000/api/workspaces/switch",{method:"POST",body:"{}"}));expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:"request_rejected"})});
 it("rejects a cross-origin request even with matching CSRF values",async()=>{const response=await POST(new Request("http://127.0.0.1:3000/api/workspaces/switch",{method:"POST",headers:{origin:"https://attacker.invalid","content-type":"application/json","x-csrf-token":"same",cookie:"nexaflow_csrf=same"},body:"{}"}));expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:"request_rejected"})});
});
