import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LeadActivityPanel, activityMatchesFilter, compareActivityDescending, mergeActivityItems } from "@/frontend/features/leads";
import { leadActivityFixture } from "@/frontend/features/leads/testing/lead-activity.fixtures";

const component = readFileSync("src/frontend/features/leads/components/lead-activity.tsx", "utf8");
const styles = readFileSync("src/frontend/design-system/components.css", "utf8");

describe("ACTIVITY-01A frontend states and boundaries", () => {
  it("mounts a truthful protected loading state before capabilities resolve", () => {
    const html = renderToStaticMarkup(<LeadActivityPanel workspaceId="70000000-0000-4000-8000-000000000071" leadId="10000000-0000-4000-8000-000000000011" onAuthorityLoss={() => undefined}/>);
    expect(html).toContain("Loading Lead activity"); expect(html).not.toContain("Log activity</button>"); expect(html).not.toContain("Qualification call");
  });

  it("uses accepted no-store routes, server capability and opaque load-older state", () => {
    expect(component).toContain("cache: \"no-store\""); expect(component).toContain("view.lead.capabilities.canCreateActivity");
    expect(component).toContain("view.hasMore && view.nextCursor"); expect(component).toContain("Load older activity");
    expect(component).not.toMatch(/role\s*===|totalCount|[?&]page=|\boffset\b/i);
  });

  it("clears protected state and preserves safe drafts only for recoverable failures", () => {
    for (const state of ["setView(null)", "setDraft(emptyDraft())", "setErrors({})", "setNotice(\"\")", "setError(null)", "request.current = { body: \"\", key: crypto.randomUUID() }"]) expect(component).toContain(state);
    expect(component).toContain("Your safe draft is still here"); expect(component).toContain("retry with the same request");
    expect(component).toContain("This activity was already logged. No duplicate was created.");
    expect(component).toContain("Load latest Lead and activity"); expect(component).not.toContain("setStale(false); }\n  async function submit");
    expect(component).toContain('if (!stale) { setNotice(""); setError(null); }');
  });

  it("provides linked validation, focus recovery, pending state and duplicate-submit protection", () => {
    expect(component).toContain("Correct the linked fields"); expect(component).toContain("summary.current?.focus()");
    expect(component).toContain("setTimeout(() => summary.current?.focus())");
    expect(component).toContain("document.getElementById(`activity-${field}`)?.focus()");
    expect(component).toContain("if (!view?.lead.capabilities.canCreateActivity || busy || stale) return");
    expect(component).toContain("Logging activity…"); expect(component).toContain('aria-live={feedbackKind === "validation" || feedbackKind === "error" || feedbackKind === "conflict" ? "assertive" : "polite"}');
  });

  it("keeps email truthful and excludes deferred donor scope", () => {
    expect(component).toContain("It does not send an email."); expect(component).toContain("NexaFlow did not send it.");
    expect(component).not.toMatch(/followUpTitle|createFollowUp|archive\(|edit\(|global timeline|participants|deliveryProvider/);
  });

  it("orders by occurredAt then activityId descending and removes cursor duplicates", () => {
    const base = leadActivityFixture.items[0], item = (activityId: string, occurredAt: string) => ({ ...base, activityId, occurredAt, subject: activityId });
    const older = item("20000000-0000-4000-8000-000000000099", "2026-08-26T14:00:00.000Z"),
      equalLow = item("20000000-0000-4000-8000-000000000021", "2026-08-27T14:00:00.000Z"),
      equalHigh = item("20000000-0000-4000-8000-000000000023", "2026-08-27T14:00:00.000Z");
    expect([older, equalLow, equalHigh].sort(compareActivityDescending).map(value => value.activityId)).toEqual([equalHigh.activityId, equalLow.activityId, older.activityId]);
    expect(mergeActivityItems([equalLow, older], [equalHigh, equalLow]).map(value => value.activityId)).toEqual([equalHigh.activityId, equalLow.activityId, older.activityId]);
  });

  it("reconciles creates only inside the confirmed filter", () => {
    const call = leadActivityFixture.items[0], note = { ...call, kind: "note" as const };
    expect(activityMatchesFilter(call, "call")).toBe(true); expect(activityMatchesFilter(note, "call")).toBe(false); expect(activityMatchesFilter(note, "")).toBe(true);
    expect(component).toContain("confirmedKindRef.current"); expect(component).toContain("firstPageGeneration.current");
    expect(component).toContain("generation !== firstPageGeneration.current");
    expect(component).toContain("setRequestedKind(confirmedAtRequest)");
  });

  it("distinguishes pending, validation, errors, replay and success semantics", () => {
    for (const kind of ['setFeedbackKind("pending")', 'setFeedbackKind("validation")', 'setFeedbackKind("conflict")', 'setFeedbackKind(saved.replayed ? "replay" : "success")']) expect(component).toContain(kind);
    expect(component).toContain('data-feedback-kind={feedbackKind}'); expect(component).toContain('feedbackKind === "validation" || feedbackKind === "error" || feedbackKind === "conflict" ? "alert" : "status"');
  });

  it("inherits Nexa Spectrum responsive, forced-colour and reduced-motion boundaries", () => {
    expect(styles).toContain("grid-template-columns: repeat(auto-fit,minmax(min(300px,100%),1fr))");
    expect(styles).toContain(".lead-activity-layout { grid-template-columns: 1fr; }"); expect(styles).toContain("overflow-anchor: none");
    expect(styles).toContain("@media (forced-colors: active)"); expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("min-height: 44px");
  });

  it("integrates through the Lead public entry without adding routes or global navigation", () => {
    const route = readFileSync("src/app/crm/leads/[leadId]/page.tsx", "utf8"), wrapper = readFileSync("src/frontend/features/leads/components/lead-conversion.tsx", "utf8");
    expect(route).toContain('from "@/frontend/features/leads"'); expect(wrapper).toContain("<LeadActivityPanel");
    expect(readFileSync("src/frontend/features/leads/index.ts", "utf8")).toContain('from"./components/lead-activity"');
  });
});
