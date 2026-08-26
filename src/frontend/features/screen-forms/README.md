# Screen forms frontend

Public entry: `index.ts`

SCREEN-FORMS-01 renders Company, Contact, and Lead create/edit forms from the strict bootstrap, options, protected-detail, result, error, and Contact Notes contracts. Direct-new routes mount protected fields only after the capability-only bootstrap succeeds. Edit routes fail closed when any required category is masked or withheld, and all relationship, stage, and assignment choices come from current versioned server options.

Contact internal notes are a separate Notes-owned post-save operation with their own version fence and idempotency key. Lead Company selection is explicit and server-authorized, consent preserves nullable unknown, and Identity Review outcomes are displayed only from the persisted server result. The feature never infers authority, customer identity, lifecycle, review status, or AI behavior.
