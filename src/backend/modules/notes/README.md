# Notes

Notes is the sole writer for `note_records`, append-only `note_revisions`, and `note_record_references`.
`addContactInternalNoteV1` owns the version-bound idempotent add operation and consumes only the public Customer Graph Contact target participant. `listContactInternalNotesV1` is a bounded protected projection whose authorized item DTO intentionally includes the note body. Note bodies never enter Audit, Outbox, receipts, errors, or Customer Graph roots.
