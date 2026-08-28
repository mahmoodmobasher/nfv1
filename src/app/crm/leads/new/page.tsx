import { CrmShell } from "../../crm-shell";
import { crmPageContext } from "@/server/crm/page";
import { ScreenProfileForm } from "@/frontend/features/screen-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add lead | NexaFlow" };
export default async function Page() {
  const { pool, workspace, context } = await crmPageContext("/crm/leads/new");
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="mx-auto grid w-full max-w-[1400px] gap-5 py-5">
          <ScreenProfileForm workspaceId={workspace.id} kind="lead" />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
