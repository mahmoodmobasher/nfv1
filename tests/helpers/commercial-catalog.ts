import type { Pool } from "pg";

export async function seedCanonicalCommercialCatalog(pool: Pool) {
  await pool.query("delete from plan_catalog_entries");
  await pool.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,currency_code,billing_unit,monthly_price_cents,annual_monthly_equivalent_price_cents,feature_flags,trial_days,effective_from,effective_to)
    values ('essentials','2026-08-commercial-v1','Essentials','active','["monthly","annual"]',1,'USD','workspace_subscription',6999,2400,'{"crm":true}',14,'2026-08-24T00:00:00Z',null),
           ('growth','2026-08-commercial-v1','Growth','active','["monthly","annual"]',5,'USD','workspace_subscription',8999,5700,'{"crm":true,"automation":true}',14,'2026-08-24T00:00:00Z',null),
           ('scale','2026-08-commercial-v1','Scale','active','["monthly","annual"]',15,'USD','workspace_subscription',11999,10700,'{"crm":true,"automation":true,"advanced_roles":true}',14,'2026-08-24T00:00:00Z',null)`);
}
