import { describe, expect, it } from "vitest";
import { activityLabel, activityPreview, CrmHomeError, parseCrmHomeFilters } from "../src/server/crm/home";
import { crmHomeQuery, crmLeadHref, hasCrmHomeFilters } from "../src/server/crm/home-links";
import { CRM_HOME_DEMO_PREVIEW } from "../src/app/crm/home/demo";
import { readFileSync } from "node:fs";

const defaults={status:"all",stage:"all",owner:"all",team:"all",period:"all"} as const;

describe("CRM home provider-independent behavior",()=>{
  it("keeps dashboard copy separate from discoverable Tailwind utilities",()=>{
    const source=readFileSync("src/app/crm/home/page.tsx","utf8");
    expect(source).not.toMatch(/Review bg-accent-soft|first bg-accent-soft|live-badge|welcome-stat|kpi-card|kpi-grid|coming-label|recent-card/);
    expect(source).toContain('className="grid gap-1 rounded-card border border-line bg-surface p-4 hover:border-accent"');
    expect(source).toContain('className="flex items-center justify-between gap-3"');
    expect(source).toContain("Review follow-up across your visible work.");
    expect(source).toContain("Current leads in the first Pipeline stage.");
  });
  it("allowlists, defaults, and canonicalizes dashboard filters",()=>{
    expect(parseCrmHomeFilters({})).toEqual(defaults);
    expect(parseCrmHomeFilters({status:"won",owner:"mine",period:"30d"})).toEqual({...defaults,status:"won",owner:"mine",period:"30d"});
    for(const raw of [{status:"pending"},{stage:"not-a-uuid"},{team:["all","all"]}])expect(()=>parseCrmHomeFilters(raw)).toThrowError(CrmHomeError);
  });
  it("ignores unrecognized query params instead of failing the dashboard closed",()=>{
    // UAT-WALK-FINDINGS-2026-08-29.md #4: /crm/home?r=2 used to render "Review the
    // dashboard filters and try again" for a param the filter form never sends. A utm_*
    // tag on any shared link would do the same.
    expect(parseCrmHomeFilters({other:"x"})).toEqual(defaults);
    expect(parseCrmHomeFilters({utm_source:"newsletter",r:"2",status:"won"})).toEqual({...defaults,status:"won"});
    expect(parseCrmHomeFilters({utm_source:["a","b"]})).toEqual(defaults);
  });
  it("builds only fixed local lead links with normalized fields",()=>{
    const filters={...defaults,status:"open" as const,period:"7d" as const};
    expect(crmHomeQuery(filters)).toBe("?status=open&period=7d");
    expect(crmLeadHref(filters,{status:"won"})).toBe("/crm?status=won&period=7d");
    expect(hasCrmHomeFilters(defaults)).toBe(false);
    expect(hasCrmHomeFilters(filters)).toBe(true);
  });
  it("bounds activity previews and maps unknown kinds safely",()=>{
    expect(activityPreview(`  A\n\t${"b".repeat(200)}`)).toHaveLength(160);
    expect(activityPreview("hello\nworld")).toBe("hello world");
    expect(activityLabel("note")).toBe("Note");
    expect(activityLabel("future_internal_kind")).toBe("Activity");
  });
  it("keeps every immutable future module visibly isolated as demo data",()=>{
    expect(CRM_HOME_DEMO_PREVIEW.source).toBe("demo");
    expect(CRM_HOME_DEMO_PREVIEW.notice).toBe("Sample values only — this feature is not connected to workspace data.");
    expect(CRM_HOME_DEMO_PREVIEW.cards.map(card=>card.title)).toEqual(["Deals","Conversion","Projects","Delivery","Reporting"]);
    expect(Object.isFrozen(CRM_HOME_DEMO_PREVIEW)).toBe(true);
    expect(Object.isFrozen(CRM_HOME_DEMO_PREVIEW.cards)).toBe(true);
  });
});
