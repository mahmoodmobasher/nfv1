import { Pool } from "pg";
import { getScreenProfileV1 } from "@/backend/modules/leads/application/orchestrators/screen-forms.owner";

async function main() {
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const facts = (await pool.query(
    `select u.id "userId",s.id "sessionId",m.workspace_id "workspaceId",m.id "membershipId",r.code role
       from users u
       join workspace_memberships m on m.user_id=u.id and m.status='active'
       join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
       join workspaces w on w.id=m.workspace_id and w.name='def' and w.status='active'
       join sessions s on s.user_id=u.id and s.active_workspace_id=m.workspace_id
        and s.revoked_at is null and s.idle_expires_at>now() and s.absolute_expires_at>now()
      where u.primary_email_normalized='mahmoodmobasher@gmail.com'
      order by s.created_at desc limit 1`,
  )).rows[0];
  if (!facts) throw new Error("active_actor_not_found");
  const result = await getScreenProfileV1(
    pool,
    facts,
    "lead",
    "83a19537-58a0-48cf-b5d2-e53262219c83",
    crypto.randomUUID(),
  );
  console.log(JSON.stringify({
    kind: result.kind,
    recordId: result.recordId,
    version: result.version,
    capabilities: result.capabilities,
  }));
} catch (error) {
  console.log(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error && "code" in error ? error.code : null,
    status: typeof error === "object" && error && "status" in error ? error.status : null,
  }));
} finally {
  await pool.end();
}
}

void main();
