import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

async function leadFixture() {
  const user = (await pool.query<{ id: string }>("insert into users(display_name,status) values('Source Owner','active') returning id")).rows[0].id;
  const workspace = (await pool.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Source',$1,'active','growth','monthly',$2) returning id`, [`source-${randomUUID()}`, user])).rows[0].id;
  const stage = (await pool.query<{ id: string }>("insert into pipeline_stages(workspace_id,name,position) values($1,'New',0) returning id", [workspace])).rows[0].id;
  const lead = (await pool.query<{ id: string }>(`insert into leads(workspace_id,display_name,person_name_normalized,email_display,email_normalized,source,original_source_category,original_source_platform,stage_id) values($1,'Ada Lead','ada lead','ada@example.test','ada@example.test','manual','social_media','linkedin',$2) returning id`, [workspace, stage])).rows[0].id;
  return lead;
}

suite("DB-01B current Lead source platform", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("enforces the exact mutable current tuple while preserving original provenance", async () => {
    const lead = await leadFixture();
    await expect(pool.query("update leads set source='social_media' where id=$1", [lead])).rejects.toMatchObject({ code: "23514" });
    await pool.query("update leads set source='social_media',source_platform='x' where id=$1", [lead]);
    await expect(pool.query("update leads set source_platform='myspace' where id=$1", [lead])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("update leads set source='referral' where id=$1", [lead])).rejects.toMatchObject({ code: "23514" });
    await pool.query("update leads set source='referral',source_platform=null where id=$1", [lead]);
    const row = (await pool.query("select source,source_platform,original_source_category,original_source_platform from leads where id=$1", [lead])).rows[0];
    expect(row).toEqual({ source: "referral", source_platform: null, original_source_category: "social_media", original_source_platform: "linkedin" });
  });

  it("keeps the catalog on current Leads only and fully valid", async () => {
    const constraint = (await pool.query<{ definition: string; validated: boolean }>(`select pg_get_constraintdef(oid) definition,convalidated validated from pg_constraint where conname='leads_current_source_platform_check'`)).rows[0];
    expect(constraint.validated).toBe(true);
    for (const platform of ["tiktok", "instagram", "facebook", "linkedin", "x", "youtube", "other_social"]) expect(constraint.definition).toContain(`'${platform}'::text`);
    expect((await pool.query(`select is_nullable from information_schema.columns where table_schema='public' and table_name='lead_intakes' and column_name='source_platform'`)).rows[0].is_nullable).toBe("YES");
  });
});
