import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

async function fixture() {
  const user = (await pool.query<{ id: string }>("insert into users(display_name,status) values('Screen Forms','active') returning id")).rows[0].id;
  const workspace = (await pool.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Screen Forms',$1,'active','growth','monthly',$2) returning id`, [`screen-${randomUUID()}`, user])).rows[0].id;
  const role = (await pool.query<{ id: string }>("insert into roles(workspace_id,code) values($1,'owner') returning id", [workspace])).rows[0].id;
  const member = (await pool.query<{ id: string }>("insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id", [workspace, user, role])).rows[0].id;
  return { workspace, member };
}

suite("SCREEN-FORMS-01 additive profile persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("keeps legacy writers compatible and distinguishes unknown revenue from zero", async () => {
    const f = await fixture();
    const company = (await pool.query<{ id: string }>(`insert into companies(workspace_id,display_name,name_normalized) values($1,'Acme','acme') returning id`, [f.workspace])).rows[0].id;
    expect((await pool.query("select annual_revenue_minor from companies where id=$1", [company])).rows[0].annual_revenue_minor).toBeNull();
    await pool.query("update companies set annual_revenue_minor='0',annual_revenue_currency_code='CAD',annual_revenue_currency_exponent=2 where id=$1", [company]);
    expect((await pool.query("select annual_revenue_minor::text value from companies where id=$1", [company])).rows[0].value).toBe("0");
    await expect(pool.query("update companies set annual_revenue_minor='1',annual_revenue_currency_code=null where id=$1", [company])).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces Workspace-qualified parent retention and rejects self-parent", async () => {
    const a = await fixture();
    const b = await fixture();
    const parent = (await pool.query<{ id: string }>("insert into companies(workspace_id,display_name,name_normalized) values($1,'Parent','parent') returning id", [a.workspace])).rows[0].id;
    const child = (await pool.query<{ id: string }>("insert into companies(workspace_id,display_name,name_normalized,parent_company_id) values($1,'Child','child',$2) returning id", [a.workspace, parent])).rows[0].id;
    await expect(pool.query("delete from companies where id=$1", [parent])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("update companies set parent_company_id=id where id=$1", [child])).rejects.toMatchObject({ code: "23514" });
    const foreign = (await pool.query<{ id: string }>("insert into companies(workspace_id,display_name,name_normalized) values($1,'Foreign','foreign') returning id", [b.workspace])).rows[0].id;
    await expect(pool.query("update companies set parent_company_id=$1 where id=$2", [foreign, child])).rejects.toMatchObject({ code: "23503" });
  });

  it("constrains Contact channel purposes without changing legacy null-purpose points", async () => {
    const f = await fixture();
    const contact = (await pool.query<{ id: string }>("insert into contacts(workspace_id,display_name,person_name_normalized) values($1,'Ada Lovelace','ada lovelace') returning id", [f.workspace])).rows[0].id;
    const base = [f.workspace, contact, randomUUID(), f.member];
    await pool.query(`insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,'email','ada@example.test','ada@example.test','v1',false,'manual',$3,$4)`, base);
    await pool.query(`insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,phone_country_code_used,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,'phone','phone_mobile','+1 416 555 0100','+14165550100','CA','v1',false,'manual',$3,$4)`, base);
    await expect(pool.query(`insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,'email','phone_mobile','other@example.test','other@example.test','v1',false,'manual',$3,$4)`, base)).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(`insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,phone_country_code_used,normalization_version,is_primary,source,governing_operation_id,created_by_membership_id) values($1,$2,'phone','phone_mobile','+1 416 555 0101','+14165550101','CA','v1',false,'manual',$3,$4)`, base)).rejects.toMatchObject({ code: "23505" });
  });

  it("retains Lead stage authority and validates consent evidence and protected bounds", async () => {
    const columns = (await pool.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='leads'")).rows.map((r) => r.column_name);
    expect(columns).toContain("promotional_email_opt_out");
    expect(columns).not.toContain("engagement_status");
    const ratingConstraint = (await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) definition from pg_constraint where conname='leads_rating_check'`,
    )).rows[0].definition;
    expect(ratingConstraint).toContain("'hot'::text, 'warm'::text, 'cold'::text");
    for (const rejected of ["acquired", "active", "shutdown"]) expect(ratingConstraint).not.toContain(`'${rejected}'::text`);
    const indexedSensitive = (await pool.query<{ indexdef: string }>("select indexdef from pg_indexes where tablename in ('companies','contacts','leads')")).rows.map((r) => r.indexdef).join(" ");
    for (const name of ["street", "postal_code", "secondary_email_normalized", "mobile_phone_normalized", "fax_normalized"]) expect(indexedSensitive).not.toContain(name);
  });
});
