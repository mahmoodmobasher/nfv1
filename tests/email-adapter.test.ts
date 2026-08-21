import { describe, expect, it } from "vitest";
import { ResendEmailAdapter } from "../src/server/email/resend";

const message={to:"recipient@example.test",subject:"Synthetic message",text:"Synthetic transactional content.",idempotencyKey:"outbox-00000000-0000-4000-8000-000000000001"};

describe("Resend transactional email adapter",()=>{
  it("uses the official server API contract without exposing configuration in its result",async()=>{
    let call:{input:RequestInfo|URL;init?:RequestInit}|undefined,calls=0;
    const request:typeof fetch=async(input,init)=>{calls+=1;call={input,init};return new Response(JSON.stringify({id:"provider-message-1"}),{status:200,headers:{"content-type":"application/json"}})};
    const adapter=new ResendEmailAdapter({apiKey:"not-a-real-resend-credential",from:"NexaFlow accounts <accounts@mail.nexaflowsystems.com>",request});
    await expect(adapter.send(message)).resolves.toEqual({messageId:"provider-message-1"});
    expect(calls).toBe(1);
    expect(call?.input).toBe("https://api.resend.com/emails");
    const init=call?.init;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({authorization:"Bearer not-a-real-resend-credential","content-type":"application/json","idempotency-key":message.idempotencyKey});
    expect(JSON.parse(String(init?.body))).toEqual({from:"NexaFlow accounts <accounts@mail.nexaflowsystems.com>",to:[message.to],subject:message.subject,text:message.text});
  });

  it("passes only an approved reply-to when configured",async()=>{
    let captured:RequestInit|undefined;
    const request:typeof fetch=async(_input,init)=>{captured=init;return new Response(JSON.stringify({id:"provider-message-2"}),{status:200})};
    const adapter=new ResendEmailAdapter({apiKey:"not-a-real-resend-credential",from:"accounts@mail.nexaflowsystems.com",replyTo:"support@nexaflowsystems.com",request});
    await adapter.send(message);
    expect(JSON.parse(String(captured?.body)).reply_to).toBe("support@nexaflowsystems.com");
  });

  it.each([[422,"delivery_rejected"],[429,"delivery_unavailable"],[503,"delivery_unavailable"]])("maps HTTP %s to a safe retry classification",async(status,code)=>{
    const adapter=new ResendEmailAdapter({apiKey:"not-a-real-resend-credential",from:"accounts@mail.nexaflowsystems.com",request:(async()=>new Response("provider body must not escape",{status})) as typeof fetch});
    await expect(adapter.send(message)).rejects.toThrow(code);
  });

  it("treats transport and malformed-success failures as unavailable without leaking details",async()=>{
    const transport=new ResendEmailAdapter({apiKey:"not-a-real-resend-credential",from:"accounts@mail.nexaflowsystems.com",request:(async()=>{throw new Error("credential and body detail")}) as typeof fetch});
    await expect(transport.send(message)).rejects.toThrow("delivery_unavailable");
    const malformed=new ResendEmailAdapter({apiKey:"not-a-real-resend-credential",from:"accounts@mail.nexaflowsystems.com",request:(async()=>new Response("{}",{status:200})) as typeof fetch});
    await expect(malformed.send(message)).rejects.toThrow("delivery_unavailable");
  });

  it("reuses the durable idempotency key so a response-loss retry is one provider send",async()=>{
    const accepted=new Map<string,string>();let calls=0;
    const request=async(_input:RequestInfo|URL,init?:RequestInit)=>{calls+=1;const key=(init?.headers as Record<string,string>)["idempotency-key"];if(!accepted.has(key))accepted.set(key,"provider-idempotent-1");if(calls===1)throw new Error("response lost after acceptance");return new Response(JSON.stringify({id:accepted.get(key)}),{status:200})};
    const adapter=new ResendEmailAdapter({apiKey:"not-a-real-resend-credential",from:"accounts@mail.nexaflowsystems.com",request:request as typeof fetch});
    await expect(adapter.send(message)).rejects.toThrow("delivery_unavailable");
    await expect(adapter.send(message)).resolves.toEqual({messageId:"provider-idempotent-1"});
    expect(accepted.size).toBe(1);
    expect(calls).toBe(2);
  });
});
