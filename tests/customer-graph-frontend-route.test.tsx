import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contactChannelPresentation, customerGraphErrorDisposition, CustomerGraphDetailPage, CustomerGraphFormPage, CustomerGraphListPage } from "@/frontend/features/customer-graph";

const routes = [
  ["src/app/crm/companies/page.tsx", "Companies | NexaFlow", "kind=\"company\""],
  ["src/app/crm/contacts/page.tsx", "Contacts | NexaFlow", "kind=\"contact\""],
  ["src/app/crm/companies/new/page.tsx", "Add company | NexaFlow", "CustomerGraphFormPage"],
  ["src/app/crm/contacts/new/page.tsx", "Add contact | NexaFlow", "CustomerGraphFormPage"],
  ["src/app/crm/companies/[companyId]/page.tsx", "Company details | NexaFlow", "CustomerGraphDetailPage"],
  ["src/app/crm/contacts/[contactId]/page.tsx", "Contact details | NexaFlow", "CustomerGraphDetailPage"],
  ["src/app/crm/companies/[companyId]/edit/page.tsx", "Edit company | NexaFlow", "CustomerGraphFormPage"],
  ["src/app/crm/contacts/[contactId]/edit/page.tsx", "Edit contact | NexaFlow", "CustomerGraphFormPage"],
] as const;

describe("CUSTOMER-GRAPH-01 frontend routes and initial interactions", () => {
  it.each(routes)("locks %s to dynamic Workspace context and the public feature entry", (path, pageTitle, component) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain('dynamic = "force-dynamic"'); expect(source).toContain(pageTitle); expect(source).toContain(component);
    expect(source).toContain("crmPageContext("); expect(source).toContain("await pool.end()");
    expect(source).not.toMatch(/@\/frontend\/features\/customer-graph\//);
  });
  it("announces list and detail loading without exposing placeholder customer data", () => {
    const list = renderToStaticMarkup(<CustomerGraphListPage workspaceId="30000000-0000-4000-8000-000000000001" kind="company"/>),
      detail = renderToStaticMarkup(<CustomerGraphDetailPage workspaceId="30000000-0000-4000-8000-000000000001" kind="contact" id="30000000-0000-4000-8000-000000000002"/>),
      directNew = renderToStaticMarkup(<CustomerGraphFormPage workspaceId="30000000-0000-4000-8000-000000000001" kind="contact"/>);
    expect(list).toContain("Loading active companies"); expect(detail).toContain("Loading contact");
    expect(directNew).toContain("Checking permission to add contact"); expect(directNew).not.toContain("<form"); expect(directNew).not.toContain('name="email"');
    expect(`${list}${detail}${directNew}`).not.toMatch(/Acme|example@example|555-\d{4}/i);
  });
  it("keeps stable mutation mechanics, reconciliation, and accessible confirmation in the client source", () => {
    const source = readFileSync("src/frontend/features/customer-graph/components/customer-graph.tsx", "utf8");
    expect(source).toContain('"idempotency-key": request.current.key'); expect(source).toContain("expectedVersion");
    expect(source).toContain("stale_version"); expect(source).toContain("Reload the latest record");
    expect(source).toContain("request.current = { body: \"\", key: crypto.randomUUID() }");
    expect(source).toContain("result.replayed"); expect(source).toContain("already applied");
    expect(source).toContain("<dialog"); expect(source).toContain("showModal()"); expect(source).toContain("onCancel");
    expect(source).toContain("restore.current()"); expect(source).toContain("Cancel"); expect(source).not.toContain("window.confirm");
    expect(source).toContain("aria-describedby={described(\"domain\", true)}");
    expect(source).toContain("aria-describedby={described(\"firstName\")}");
    expect(source).toContain("aria-describedby={described(\"email\")}");
    expect(source).toContain("aria-describedby={described(\"phone\", true)}");
  });
  it("classifies every protected authority loss and stale response deterministically", () => {
    const error = (code: string, action: "none" | "refetch_record" | "refetch_options" | "retry_same_request" = "none") => ({ code, message: "Safe message", retryable: false, reconciliation: { required: action !== "none", action } }) as never;
    for (const code of ["authentication_required", "permission_required", "resource_not_found", "authority_conflict"])
      expect(customerGraphErrorDisposition(error(code)), code).toBe("authority_loss");
    expect(customerGraphErrorDisposition(error("stale_version", "refetch_record"))).toBe("stale");
    expect(customerGraphErrorDisposition(error("customer_graph_unavailable", "retry_same_request"))).toBe("retry_same_request");
  });
  it("uses truthful full, masked, and unavailable Contact channel presentations", () => {
    expect(contactChannelPresentation({ email: "full@example.test", phone: "+14165550123", maskedEmail: "f***@example.test", maskedPhone: "***0123", disclosure: { channels: "full" } })).toMatchObject({ mode: "full", values: [["Email", "full@example.test"], ["Phone", "+14165550123"]] });
    expect(contactChannelPresentation({ email: null, phone: null, maskedEmail: "m***@example.test", maskedPhone: null, disclosure: { channels: "masked" } })).toMatchObject({ mode: "masked", values: [["Email", "m***@example.test"]] });
    expect(contactChannelPresentation({ email: null, phone: null, maskedEmail: null, maskedPhone: null, disclosure: { channels: "masked" } })).toMatchObject({ mode: "unavailable", values: [] });
  });
});
