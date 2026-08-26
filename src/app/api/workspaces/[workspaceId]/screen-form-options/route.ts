import { listScreenFormOptionsV1, screenFormOptionsQueryV1Schema } from "@/backend/modules/screen-forms";
import { screenFormsRoute } from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const{workspaceId}=await params;
  return screenFormsRoute(request,workspaceId,({pool,actor,requestId})=>{
    const values=new URL(request.url).searchParams,allowed=new Set(["kind","optionKind","query","cursor","limit","excludeRecordId"]);
    if([...values.keys()].some(key=>!allowed.has(key)||values.getAll(key).length!==1))throw Object.assign(new Error("validation_failed"),{code:"validation_failed",status:400});
    const parsed=screenFormOptionsQueryV1Schema.safeParse({
      kind:values.get("kind")??undefined,
      optionKind:values.get("optionKind")??undefined,
      query:values.get("query")??undefined,
      cursor:values.get("cursor")??undefined,
      limit:values.has("limit")?Number(values.get("limit")):undefined,
      excludeRecordId:values.get("excludeRecordId")??undefined,
    });
    if(!parsed.success)throw Object.assign(new Error("validation_failed"),{code:"validation_failed",status:400,fields:parsed.error.issues.map(issue=>issue.path.map(String).join(".")).filter(Boolean)});
    return listScreenFormOptionsV1(pool,actor,parsed.data,requestId);
  });
}
