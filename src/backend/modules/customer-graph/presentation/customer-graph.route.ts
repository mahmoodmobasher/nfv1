import { isTrustedMutationBody, localDatabase, mutationGuard, type TrustedMutationBody } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";
import { CustomerGraphError } from "../contracts/customer-graph.contract";
import { customerGraphFailure, customerGraphJson } from "./customer-graph.http";

export async function graphRoute(request:Request,workspaceId:string,work:(input:{pool:ReturnType<typeof localDatabase>["pool"];actor:Awaited<ReturnType<typeof tenant>>;requestId:string;key:string;body:unknown})=>Promise<unknown>,status=200,mutation=false,prepared?:TrustedMutationBody){
  const trusted=isTrustedMutationBody(request,prepared),requestId=crypto.randomUUID();if(mutation&&!trusted&&mutationGuard(request))return customerGraphFailure(new CustomerGraphError("permission_required",403),requestId);
  const{pool}=localDatabase();try{const actor=await tenant(pool,request,workspaceId),body=trusted?prepared.body:mutation?await request.json().catch(()=>null):null,key=request.headers.get("idempotency-key")??"";return customerGraphJson(await work({pool,actor,requestId,key,body}),status)}catch(error){return customerGraphFailure(error,requestId)}finally{await pool.end()}}
export function parsed<T>(schema:{safeParse(value:unknown):{success:true;data:T}|{success:false;error:{issues:Array<{path:PropertyKey[]}>}}},body:unknown,version:string):T{
  if(!body||typeof body!=="object"||(body as {contractVersion?:unknown}).contractVersion!==version)throw new CustomerGraphError("unsupported_contract_version",400);
  const result=schema.safeParse(body);if(!result.success)throw new CustomerGraphError("validation_failed",400,{fields:result.error.issues.map(issue=>String(issue.path[0]??"")).filter(Boolean)});return result.data}
