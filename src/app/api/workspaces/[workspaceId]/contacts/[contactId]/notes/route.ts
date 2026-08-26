import { addContactInternalNoteV1, CONTACT_INTERNAL_NOTE_ADD_V1, contactInternalNoteAddCommandV1Schema, contactInternalNoteListQueryV1Schema, contactNoteFailure, contactNoteJson, listContactInternalNotesV1, parseContactNoteListSearchParams } from "@/backend/modules/notes";
import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

async function context(request: Request, workspaceId: string) {
  const requestId = crypto.randomUUID(), { pool } = localDatabase();
  try { return { requestId, pool, actor: await tenant(pool, request, workspaceId) }; }
  catch (error) { await pool.end(); return { requestId, response: contactNoteFailure(error, requestId) }; }
}

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; contactId: string }> }) {
  const { workspaceId, contactId } = await params, value = await context(request, workspaceId);
  if ("response" in value) return value.response;
  try {
    const url = new URL(request.url), parsed = contactInternalNoteListQueryV1Schema.safeParse(
      parseContactNoteListSearchParams(url.searchParams),
    );
    if (!parsed.success) throw Object.assign(new Error("validation_failed"), { code: "validation_failed", status: 400 });
    return contactNoteJson(await listContactInternalNotesV1(value.pool, value.actor, contactId, parsed.data, value.requestId));
  }
  catch (error) { return contactNoteFailure(error, value.requestId); }
  finally { await value.pool.end(); }
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string; contactId: string }> }) {
  const requestId = crypto.randomUUID();
  if (mutationGuard(request)) return contactNoteFailure({ code: "permission_required", status: 403 }, requestId);
  const { workspaceId, contactId } = await params, value = await context(request, workspaceId);
  if ("response" in value) return value.response;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || (body as { contractVersion?: unknown }).contractVersion !== CONTACT_INTERNAL_NOTE_ADD_V1)
      throw Object.assign(new Error("unsupported_contract_version"), { code: "unsupported_contract_version", status: 400 });
    const parsed = contactInternalNoteAddCommandV1Schema.safeParse(body);
    if (!parsed.success) throw Object.assign(new Error("validation_failed"), { code: "validation_failed", status: 400 });
    return contactNoteJson(await addContactInternalNoteV1(value.pool, { actor: value.actor, contactId, command: parsed.data,
      key: request.headers.get("idempotency-key") ?? "", requestId: value.requestId }), 201);
  } catch (error) { return contactNoteFailure(error, value.requestId); }
  finally { await value.pool.end(); }
}
