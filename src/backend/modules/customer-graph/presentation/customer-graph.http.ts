import { CustomerGraphError, type CustomerGraphErrorCode } from "../contracts/customer-graph.contract";

const headers = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "cookie" };
export function customerGraphJson(data: unknown, status=200) { return Response.json({ data }, { status, headers }); }
const errors: Record<CustomerGraphErrorCode,[string,number,string]> = {
  authentication_required:["Authentication is required.",401,"none"], permission_required:["This action is not available.",403,"none"],
  resource_not_found:["The requested resource is unavailable.",404,"none"], validation_failed:["The request is invalid.",400,"none"],
  unsupported_contract_version:["The contract version is not supported.",400,"none"], idempotency_conflict:["The idempotency key conflicts with a prior request.",409,"none"],
  stale_version:["The record has changed.",409,"refetch_record"], assignment_unavailable:["The selected responsibility is unavailable.",409,"refetch_options"],
  authority_conflict:["The record is not available for this operation.",409,"refetch_record"], customer_graph_unavailable:["Customer records are temporarily unavailable.",503,"retry_same_request"],
  unexpected_error:["The request could not be completed.",500,"retry_same_request"] };
export function customerGraphFailure(error: unknown, requestId: string) {
  const known = error instanceof CustomerGraphError ? error : error && typeof error === "object" && "code" in error && "status" in error
    ? new CustomerGraphError((error as {code:CustomerGraphErrorCode}).code, Number((error as {status:number}).status)) : new CustomerGraphError("unexpected_error",500);
  const entry = errors[known.code] ?? errors.unexpected_error;
  const safe = entry[1] === known.status ? known : new CustomerGraphError("unexpected_error",500), stable=errors[safe.code];
  return Response.json({ error:{ code:safe.code,message:stable[0],retryable:stable[1]>=500,reconciliation:{required:stable[2]!=="none",action:stable[2]} },requestId },
    {status:stable[1],headers});
}
