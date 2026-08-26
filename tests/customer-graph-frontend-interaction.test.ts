import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/frontend/features/customer-graph/components/customer-graph.tsx", "utf8");
const styles = readFileSync("src/frontend/design-system/components.css", "utf8");

describe("CUSTOMER-GRAPH-01 protected interactions", () => {
  it("fails closed before collecting create-route PII and clears protected mutation state", () => {
    expect(component).toContain("?bootstrap=true");
    expect(component).toContain("if (!parsed.data.data.capabilities.canCreate)");
    expect(component.indexOf("if (loading) return <CustomerGraphLoading")).toBeLessThan(component.indexOf("<form ref={form}"));
    for (const operation of ["form.current?.reset()", "setDetail(null)", "setCanCreate(false)", "setErrors({})", "setSaved(null)", "setAuthorityError(error)"])
      expect(component, operation).toContain(operation);
  });

  it("requires explicit stale reconciliation and announces replayed results", () => {
    expect(component).toContain("Reload latest");
    expect(component).toContain("disabled={busy || stale}");
    expect(component).toContain('request.current = { body: "", key: crypto.randomUUID() }');
    expect(component).toContain("result.data.data.replayed");
    expect(component).toContain("was already applied");
    expect(component).toContain("No automatic navigation occurred before the announcement.");
  });

  it("uses the accepted keyboard dialog and linked error-summary patterns", () => {
    expect(component).toContain("node.showModal()");
    expect(component).toContain("onCancel={event =>");
    expect(component).toContain("restore.current()");
    expect(component.indexOf(">Cancel</Button>")).toBeLessThan(component.indexOf("Archive record"));
    for (const field of ["displayName", "domain", "firstName", "lastName", "email", "phone", "responsibleMembershipId", "responsibleTeamId"])
      expect(component, field).toContain(`${field}-error`);
    expect(component).toContain('href={`#${name}`}');
  });

  it("retains responsive, high-contrast, and reduced-motion protections", () => {
    expect(styles).toContain("@media (max-width: 520px)");
    expect(styles).toContain(".ds-page-actions,.ds-page-actions>* { width: 100%; }");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".lead-management-dialog");
  });
});
