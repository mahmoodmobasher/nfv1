import { describe, expect, it, vi } from "vitest";
import {
  contactInternalNoteAddCommandV1Schema,
  contactInternalNoteErrorV1Schema,
  contactInternalNoteListV1Schema,
  contactInternalNoteListQueryV1Schema,
  contactInternalNoteResultV1Schema,
  contactNoteFailure,
  parseContactNoteListSearchParams,
} from "../src/backend/modules/notes";
import { contactNoteTargetParticipant } from "../src/backend/modules/customer-graph";

const id = () => crypto.randomUUID();

describe("Contact Internal Notes transport and participant", () => {
  it("accepts bounded plain text while preserving intentional newlines", () => {
    expect(contactInternalNoteAddCommandV1Schema.parse({
      contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 1, body: "First line\nSecond line",
    }).body).toBe("First line\nSecond line");
    expect(contactInternalNoteAddCommandV1Schema.safeParse({
      contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 1, body: "x".repeat(4001),
    }).success).toBe(false);
    expect(contactInternalNoteAddCommandV1Schema.safeParse({
      contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 1, body: "unsafe\u0000value",
    }).success).toBe(false);
    expect(contactInternalNoteAddCommandV1Schema.safeParse({
      contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 0, body: "body",
    }).success).toBe(false);
  });

  it("rejects unknown and duplicate list query parameters", () => {
    expect(parseContactNoteListSearchParams(new URLSearchParams("limit=10"))).toEqual({ limit: 10 });
    for (const query of ["unknown=value", "limit=10&limit=20", "cursor=a&cursor=b"])
      expect(() => parseContactNoteListSearchParams(new URLSearchParams(query))).toThrow("validation_failed");
  });

  it("keeps add results and bounded lists strict", () => {
    const result = { contractVersion: "contact-internal-note-result.v1" as const, contactId: id(),
      noteId: id(), noteVersion: 1, replayed: false, requestId: id() };
    expect(contactInternalNoteResultV1Schema.parse(result)).toEqual(result);
    expect(contactInternalNoteResultV1Schema.safeParse({ ...result, body: "must not enter receipt" }).success).toBe(false);
    expect(contactInternalNoteListQueryV1Schema.parse({})).toEqual({ limit: 25 });
    expect(contactInternalNoteListQueryV1Schema.safeParse({ limit: 51 }).success).toBe(false);
    expect(contactInternalNoteListV1Schema.safeParse({ contractVersion: "contact-internal-note-list.v1",
      contactId: result.contactId, items: Array.from({ length: 51 }, () => ({ noteId: id(), version: 1,
        body: "bounded", createdAt: new Date().toISOString() })), nextCursor: null, requestId: id() }).success).toBe(false);
  });

  it("uses a Workspace-qualified active Customer Graph editability fence", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: id(), version: 3 }] });
    const actor = { workspaceId: id(), membershipId: id(), role: "owner" as const };
    await expect(contactNoteTargetParticipant({ query } as never).lockAndRequireEditable(actor as never, id()))
      .resolves.toMatchObject({ version: 3 });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("c.workspace_id=$1");
    expect(sql).toContain("c.status='active'");
    expect(sql).toContain("authority_contract_version='customer-graph-v1'");
    expect(values[0]).toBe(actor.workspaceId);
  });

  it("fails closed without echoing note content and only retries availability failures", async () => {
    const response = contactNoteFailure(Object.assign(new Error("secret note body"), {
      code: "resource_not_found", status: 404,
    }), id());
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("cookie");
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("secret note body");
    expect(contactInternalNoteErrorV1Schema.parse(body).error).toMatchObject({
      code: "resource_not_found", retryable: false,
      reconciliation: { action: "clear_protected_state" }, zeroPartialEffects: true,
    });
    expect(contactInternalNoteErrorV1Schema.safeParse({
      ...body,
      error: { ...body.error, retryable: true, reconciliation: { required: true, action: "retry_same_request" } },
    }).success).toBe(false);
    const stale = await contactNoteFailure({ code: "stale_version", status: 409 }, id()).json();
    expect(contactInternalNoteErrorV1Schema.parse(stale).error).toMatchObject({
      code: "stale_version", retryable: false,
      reconciliation: { required: true, action: "refetch_contact" }, zeroPartialEffects: true,
    });
  });
});
