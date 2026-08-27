import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerGraphListPage } from "@/frontend/features/customer-graph";

describe("Contact Nexa Spectrum migration", () => {
  it("composes the Contact directory from shared page-header and list-toolbar primitives", () => {
    const markup = renderToStaticMarkup(
      <CustomerGraphListPage
        workspaceId="30000000-0000-4000-8000-000000000001"
        kind="contact"
      />,
    );

    expect(markup).toContain("ds-page-header");
    expect(markup).toContain("ds-page-header__marker");
    expect(markup).toContain(">CT<");
    expect(markup).toContain("<h1>Contacts</h1>");
    expect(markup).toContain("cg-directory-tools ds-list-toolbar");
    expect(markup).toContain('aria-label="Contacts filters"');
    expect(markup).toContain("Loading active contacts");
  });
});
