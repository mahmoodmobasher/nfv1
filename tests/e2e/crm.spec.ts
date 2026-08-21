import { expect, test } from "playwright/test";
import { Pool } from "pg";
import { keyedHash } from "../../src/server/security/crypto";

const database=new Pool({connectionString:process.env.DATABASE_URL??"postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow"}),secret="local-only-session-secret-change-me-32chars";
test.afterAll(async()=>database.end());

test("creates, searches, moves, edits, and records activity for a persistent lead",async({page})=>{
  const suffix=`${Date.now()}-${Math.floor(Math.random()*10000)}`,email=`crm-owner-${suffix}@example.test`;
  const user=(await database.query(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)values($1,$1,'CRM Browser Owner','active',now())returning id`,[email])).rows[0];
  const workspace=(await database.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)values('CRM Browser',$1,'active','growth','monthly',$2)returning id`,[`crm-browser-${suffix}`,user.id])).rows[0];
  const roles=(await database.query(`insert into roles(workspace_id,code,permissions,is_system)values($1,'owner','{}',true),($1,'admin','{}',true),($1,'member','{}',true)returning id,code`,[workspace.id])).rows,ownerRole=roles.find(row=>row.code==="owner").id;
  const membership=(await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status)values($1,$2,$3,'active')returning id`,[workspace.id,user.id,ownerRole])).rows[0];
  await database.query(`insert into pipeline_stages(workspace_id,name,position)values($1,'New',0),($1,'Qualified',1)`,[workspace.id]);
  const token=`crm-browser-${crypto.randomUUID()}`;
  await database.query(`insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,[user.id,keyedHash(token,secret)]);
  await page.context().addCookies([{name:"nexaflow_session",value:token,url:"http://127.0.0.1:3000"}]);

  await page.goto("/crm/leads/new");
  await page.getByRole("button",{name:"Save lead"}).click();
  await expect(page.locator("#lead-errors")).toBeFocused();
  await expect(page.getByLabel("Work email")).toHaveAttribute("aria-invalid","true");
  await page.getByLabel("First name").fill("Jordan");await page.getByLabel("Last name").fill("Lee");await page.getByLabel("Work email").fill("jordan@example.test");await page.getByLabel("Company").fill("Acme North");await page.getByLabel("First note").fill("Asked for a proposal");
  await page.getByLabel("Lead source").selectOption("website");
  await page.getByRole("button",{name:"Save lead"}).click();
  await expect(page.getByRole("heading",{name:"Jordan Lee"})).toBeVisible();
  await page.getByLabel("Company").fill("Acme draft value");
  await page.route("**/api/workspaces/*/leads/*",async route=>{if(route.request().method()!=="PATCH")return route.continue();await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({error:{code:"stale_version"}})})},{times:1});
  await page.getByLabel("Pipeline stage").selectOption({label:"Qualified"});await page.getByRole("button",{name:"Save changes"}).click();await expect(page.getByText("Saving stage…")).toBeVisible();await expect(page.getByText("This lead changed while you were editing.")).toBeVisible();await expect(page.getByRole("button",{name:"Reload latest"})).toBeVisible();await page.getByRole("button",{name:"Reload latest"}).click();await expect(page.getByText(/Latest lead loaded/)).toBeVisible();await expect(page.getByLabel("Company")).toHaveValue("Acme draft value");await expect(page.getByLabel("Pipeline stage")).toHaveValue(await database.query(`select id from pipeline_stages where workspace_id=$1 and name='New'`,[workspace.id]).then(result=>result.rows[0].id));
  await page.getByLabel("Pipeline stage").selectOption({label:"Qualified"});await page.getByLabel("Status").selectOption("won");await page.getByRole("button",{name:"Save changes"}).click();
  const dialog=page.getByRole("alertdialog",{name:"Mark Jordan Lee as Won?"});await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Cancel"})).toBeFocused();await page.keyboard.press("Escape");await expect(dialog).toBeHidden();await expect(page.getByRole("button",{name:"Save changes"})).toBeFocused();await page.getByRole("button",{name:"Save changes"}).click();await dialog.getByRole("button",{name:"Move to Won"}).click();
  await expect(page.getByText("Stage updated to Qualified.")).toBeVisible();
  await page.route("**/api/workspaces/*/leads/*/activities",route=>route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:{code:"unexpected_error"}})}),{times:1});await page.getByLabel("Add a note").fill("Contract signed");await page.getByRole("button",{name:"Add note"}).click();await expect(page.getByText("We couldn’t add that note. Your note is still here. Try again.")).toBeVisible();await expect(page.getByLabel("Add a note")).toHaveValue("Contract signed");await page.getByRole("button",{name:"Try again"}).click();
  await expect(page.getByText("Note added.")).toBeVisible();
  await expect(page.getByRole("list",{name:"Lead activity timeline"}).getByText("Contract signed")).toBeVisible();
  await page.goto("/crm?q=acme");await expect(page.getByRole("link",{name:"Jordan Lee"})).toBeVisible();
  await page.goto("/crm/pipeline");await expect(page.getByRole("heading",{name:"Pipeline"})).toBeVisible();await expect(page.getByRole("link",{name:"Jordan Lee"})).toBeVisible();
  await page.goto("/crm/home");await expect(page.getByRole("heading",{name:"CRM home"})).toBeVisible();await expect(page.getByText("Live workspace data").first()).toBeVisible();await expect(page.locator(".kpi-card").filter({hasText:"Visible leads"}).getByText("1",{exact:true})).toBeVisible();await expect(page.locator(".kpi-card").filter({hasText:"Won"}).getByText("1",{exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Jordan Lee"}).first()).toBeVisible();await expect(page.locator(".demo-region")).toContainText("Sample values only — this feature is not connected to workspace data.");await expect(page.locator(".demo-region a")).toHaveCount(0);await expect(page.locator(".demo-grid article")).toHaveCount(5);
  await page.getByLabel("Status").selectOption("lost");await page.getByRole("button",{name:"Apply filters"}).click();await expect(page).toHaveURL(/status=lost/);await expect(page.getByText("No leads match these filters.")).toBeVisible();await page.reload();await expect(page.getByText("No leads match these filters.")).toBeVisible();const clearDashboard=page.getByRole("link",{name:"Clear filters"}).first();await expect(clearDashboard).toHaveAttribute("href","/crm/home");await page.goto("/crm/home");await expect(page).toHaveURL(/\/crm\/home$/);await expect(page.locator(".kpi-card").filter({hasText:"Visible leads"}).getByText("1",{exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:700});await page.goto("/crm");const menu=page.getByRole("button",{name:"Open CRM navigation"});await expect(menu).toBeVisible();expect((await menu.boundingBox())?.width).toBeGreaterThanOrEqual(44);await menu.click();await page.locator("#crm-menu").getByRole("link",{name:"Pipeline"}).click();await expect(page).toHaveURL(/\/crm\/pipeline/);await expect(page.getByRole("heading",{name:"Pipeline"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await menu.click();await page.locator("#crm-menu").getByRole("link",{name:"Home"}).click();await expect(page).toHaveURL(/\/crm\/home/);await expect(page.getByRole("heading",{name:"CRM home"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await database.query(`select l.status,l.version,ps.name stage,(select count(*)::int from lead_activities where lead_id=l.id) activities from leads l join pipeline_stages ps on ps.id=l.stage_id where l.workspace_id=$1`,[workspace.id])).rows[0]).toMatchObject({status:"won",version:2,stage:"Qualified",activities:4});expect(membership.id).toBeTruthy();
});
