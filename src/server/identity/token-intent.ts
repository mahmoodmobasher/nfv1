import { decryptEnvelope, encryptEnvelope } from "@/server/security/crypto";
import { parseCookies } from "@/server/security/request";

export type IdentityTokenIntentPurpose="email_verification"|"password_reset";

export const IDENTITY_TOKEN_INTENT_MAX_AGE_SECONDS=15*60;

const settings={
  email_verification:{cookie:"nexaflow_email_verification_intent",path:"/verify-email"},
  password_reset:{cookie:"nexaflow_password_reset_intent",path:"/reset-password"},
} as const;

export type IdentityTokenIntent={token:string;continuation:"/workspace/invitations/accept"|null};
type IdentityTokenIntentEnvelope={purpose:IdentityTokenIntentPurpose;token:string;expiresAt:number;continuation?:"/workspace/invitations/accept"};

const validToken=(value:string)=>value.length>=20&&value.length<=200;

export function identityTokenIntentSettings(purpose:IdentityTokenIntentPurpose){return settings[purpose]}

export function sealIdentityTokenIntent(purpose:IdentityTokenIntentPurpose,token:string,secret:string,now=Date.now(),continuation?:"/workspace/invitations/accept"):string{
  if(!validToken(token))throw new Error("invalid_identity_token_intent");
  return encryptEnvelope({purpose,token,expiresAt:now+IDENTITY_TOKEN_INTENT_MAX_AGE_SECONDS*1000,...(continuation?{continuation}:{})} satisfies IdentityTokenIntentEnvelope,secret);
}

export function readIdentityTokenIntent(purpose:IdentityTokenIntentPurpose,value:string|undefined,secret:string,now=Date.now()):IdentityTokenIntent|null{
  if(!value)return null;
  try{const intent=decryptEnvelope<IdentityTokenIntentEnvelope>(value,secret);return intent.purpose===purpose&&validToken(intent.token)&&intent.expiresAt>now?{token:intent.token,continuation:intent.continuation==="/workspace/invitations/accept"?intent.continuation:null}:null}catch{return null}
}

export function openIdentityTokenIntent(purpose:IdentityTokenIntentPurpose,value:string|undefined,secret:string,now=Date.now()):string|null{return readIdentityTokenIntent(purpose,value,secret,now)?.token??null}

export function identityTokenIntentFromRequest(request:Request,purpose:IdentityTokenIntentPurpose,secret:string):string|null{
  const {cookie}=settings[purpose];
  return openIdentityTokenIntent(purpose,parseCookies(request.headers.get("cookie"))[cookie],secret);
}

export function identityTokenIntentCookie(purpose:IdentityTokenIntentPurpose,value:string,secure:boolean,maxAge=IDENTITY_TOKEN_INTENT_MAX_AGE_SECONDS):string{
  const {cookie,path}=settings[purpose];
  return `${cookie}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?"; Secure":""}`;
}

export function clearIdentityTokenIntentCookie(purpose:IdentityTokenIntentPurpose,secure:boolean):string{return identityTokenIntentCookie(purpose,"",secure,0)}
