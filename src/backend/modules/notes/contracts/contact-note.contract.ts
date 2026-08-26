import { z } from "zod";

export const CONTACT_INTERNAL_NOTE_ADD_V1 = "contact-internal-note-add.v1" as const;
const uuid = z.string().uuid();
const plainBody = z.string().trim().min(1).max(4000).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "plain_text_required",
);

export const contactInternalNoteAddCommandV1Schema = z.object({
  contractVersion: z.literal(CONTACT_INTERNAL_NOTE_ADD_V1),
  expectedContactVersion: z.number().int().positive(),
  body: plainBody,
}).strict();

export const contactInternalNoteV1Schema = z.object({
  noteId: uuid,
  version: z.number().int().positive(),
  body: plainBody,
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export const contactInternalNoteResultV1Schema = z.object({
  contractVersion: z.literal("contact-internal-note-result.v1"),
  contactId: uuid,
  noteId: uuid,
  noteVersion: z.number().int().positive(),
  replayed: z.boolean(),
  requestId: uuid,
}).strict();

export const contactInternalNoteListQueryV1Schema = z.object({
  cursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.number().int().min(1).max(50).default(25),
}).strict();

export const contactInternalNoteListV1Schema = z.object({
  contractVersion: z.literal("contact-internal-note-list.v1"),
  contactId: uuid,
  items: z.array(contactInternalNoteV1Schema).max(50),
  nextCursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).nullable(),
  requestId: uuid,
}).strict();

export const contactInternalNoteErrorV1Schema = z.object({
  error: z.object({
    code: z.enum(["authentication_required", "permission_required", "resource_not_found", "validation_failed", "unsupported_contract_version", "stale_version", "idempotency_conflict", "notes_unavailable", "unexpected_error"]),
    message: z.string().trim().min(1).max(200),
    retryable: z.boolean(),
    reconciliation: z.object({
      required: z.boolean(),
      action: z.enum(["none", "new_request", "retry_same_request", "clear_protected_state", "refetch_contact"]),
    }).strict(),
    zeroPartialEffects: z.literal(true),
  }).strict(),
  requestId: uuid,
}).strict().superRefine((value, context) => {
  const combinations = {
    authentication_required: [false, "clear_protected_state"],
    permission_required: [false, "clear_protected_state"],
    resource_not_found: [false, "clear_protected_state"],
    validation_failed: [false, "none"],
    unsupported_contract_version: [false, "none"],
    stale_version: [false, "refetch_contact"],
    idempotency_conflict: [false, "new_request"],
    notes_unavailable: [true, "retry_same_request"],
    unexpected_error: [true, "retry_same_request"],
  } as const;
  const expected = combinations[value.error.code];
  if (value.error.retryable !== expected[0] || value.error.reconciliation.action !== expected[1] ||
      value.error.reconciliation.required !== (expected[1] !== "none"))
    context.addIssue({ code: "custom", message: "invalid_note_error_reconciliation", path: ["error"] });
});

export type ContactInternalNoteAddCommandV1 = z.infer<typeof contactInternalNoteAddCommandV1Schema>;
export type ContactInternalNoteResultV1 = z.infer<typeof contactInternalNoteResultV1Schema>;
export type ContactInternalNoteListQueryV1 = z.infer<typeof contactInternalNoteListQueryV1Schema>;
