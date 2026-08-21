import { describe, expect, it } from "vitest";
import { activityLabel, activityPreview, CrmHomeError, parseCrmHomeFilters } from "../src/server/crm/home";
import { crmHomeQuery, crmLeadHref, hasCrmHomeFilters } from "../src/server/crm/home-links";
import { CRM_HOME_DEMO_PREVIEW } from "../src/app/crm/home/demo";

const defaults={status:"all",stage:"all",owner:"all",team:"all",period:"all"} as const;

describe("CRM home provider-independent behavior",()=>{
  it("allowlists, defaults, and canonicalizes dashboard filters",()=>{
    expect(parseCrmHomeFilters({})).toEqual(defaults);
    expect(parseCrmHomeFilters({status:"won",owner:"mine",period:"30d"})).toEqual({...defaults,status:"won",owner:"mine",period:"30d"});
    for(const raw of [{other:"x"},{status:"pending"},{stage:"not-a-uuid"},{team:["all","all"]}])expect(()=>parseCrmHomeFilters(raw)).toThrowError(CrmHomeError);
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
