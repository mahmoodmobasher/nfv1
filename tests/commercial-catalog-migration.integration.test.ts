import {readFileSync} from "node:fs";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {Pool} from "pg";

const suite=process.env.RUN_DB_INTEGRATION==="1"?describe:describe.skip;
const pool=new Pool({connectionString:process.env.DATABASE_URL??"postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow"});
const migration=readFileSync(new URL("../src/server/db/migrations/0012_commercial_catalog_authority.sql",import.meta.url),"utf8");

suite("commercial catalog migration conflict rollback",()=>{
  beforeAll(async()=>pool.query("select 1"));
  afterAll(async()=>pool.end());

  it.each([
    {label:"name",name:"Growth Plus",cadences:["monthly","annual"],features:{crm:true,automation:true},trial:14,effectiveFrom:"2026-08-24T00:00:00Z"},
    {label:"cadence",name:"Growth",cadences:["monthly"],features:{crm:true,automation:true},trial:14,effectiveFrom:"2026-08-24T00:00:00Z"},
    {label:"features",name:"Growth",cadences:["monthly","annual"],features:{crm:true},trial:14,effectiveFrom:"2026-08-24T00:00:00Z"},
    {label:"trial",name:"Growth",cadences:["monthly","annual"],features:{crm:true,automation:true},trial:30,effectiveFrom:"2026-08-24T00:00:00Z"},
    {label:"future effective date",name:"Growth",cadences:["monthly","annual"],features:{crm:true,automation:true},trial:14,effectiveFrom:"2026-08-25T00:00:00Z"},
  ])("aborts atomically for a conflicting $label row",async conflict=>{
    const schema=`catalog_conflict_${crypto.randomUUID().replaceAll("-","")}`;
    const client=await pool.connect();
    try{
      await client.query(`create schema "${schema}"`);
      await client.query(`create table "${schema}".plan_catalog_entries(
        id uuid primary key default gen_random_uuid(),code text not null,catalog_version text not null,name text not null,status text not null,
        allowed_cadences jsonb not null,included_active_seats integer not null,feature_flags jsonb not null,trial_days integer not null,
        effective_from timestamptz not null,effective_to timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
        unique(code,catalog_version))`);
      await client.query(`insert into "${schema}".plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from)
        values('essentials','legacy','Essentials','active','["monthly","annual"]',1,'{"crm":true}',14,'2026-08-01T00:00:00Z'),
              ('growth','legacy','Growth','active','["monthly","annual"]',5,'{"crm":true,"automation":true}',14,'2026-08-01T00:00:00Z'),
              ('scale','legacy','Scale','active','["monthly","annual"]',15,'{"crm":true,"automation":true,"advanced_roles":true}',14,'2026-08-01T00:00:00Z')`);
      await client.query(`insert into "${schema}".plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from)
        values('growth','2026-08-commercial-v1',$1,'active',$2,5,$3,$4,$5)`,[conflict.name,JSON.stringify(conflict.cadences),JSON.stringify(conflict.features),conflict.trial,conflict.effectiveFrom]);
      await client.query("begin");
      await client.query(`set local search_path to "${schema}"`);
      await expect(client.query(migration)).rejects.toThrow("conflicts with Product authority");
      await client.query("rollback");

      expect((await client.query(`select code,status,effective_to from "${schema}".plan_catalog_entries where catalog_version='legacy' order by code`)).rows).toEqual([
        {code:"essentials",status:"active",effective_to:null},
        {code:"growth",status:"active",effective_to:null},
        {code:"scale",status:"active",effective_to:null},
      ]);
      expect((await client.query(`select count(*)::int count from "${schema}".plan_catalog_entries`)).rows[0].count).toBe(4);
      expect((await client.query(`select count(*)::int count from information_schema.columns where table_schema=$1 and table_name='plan_catalog_entries' and column_name='currency_code'`,[schema])).rows[0].count).toBe(0);
    }finally{
      await client.query("rollback").catch(()=>undefined);
      await client.query(`drop schema if exists "${schema}" cascade`);
      client.release();
    }
  });
});
