import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

async function workspaceFixture() {
  const user = (await pool.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name)
     values($1,$1,'P1A Owner') returning id`,
    [`${randomUUID()}@example.test`],
  )).rows[0];
  const workspace = (await pool.query<{ id: string }>(
    `insert into workspaces(name,slug,plan_code,billing_cadence,created_by_user_id)
     values('P1A Workspace',$1,'essentials','monthly',$2) returning id`,
    [`p1a-${randomUUID()}`, user.id],
  )).rows[0];
  const role = (await pool.query<{ id: string }>(
    `insert into roles(workspace_id,code) values($1,'owner') returning id`,
    [workspace.id],
  )).rows[0];
  const membership = (await pool.query<{ id: string }>(
    `insert into workspace_memberships(workspace_id,user_id,role_id) values($1,$2,$3) returning id`,
    [workspace.id, user.id, role.id],
  )).rows[0];
  const stage = (await pool.query<{ id: string }>(
    `insert into pipeline_stages(workspace_id,name,position) values($1,'New',0) returning id`,
    [workspace.id],
  )).rows[0];
  return { userId: user.id, workspaceId: workspace.id, membershipId: membership.id, stageId: stage.id };
}

async function createLeadAndIntake(fixture: Awaited<ReturnType<typeof workspaceFixture>>, sourcePlatform: string | null = null) {
  const sourceCategory = sourcePlatform ? "social_media" : "manual";
  const intake = (await pool.query<{ id: string }>(
    `insert into lead_intakes(
       workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,contract_version,normalization_version,
       attribution_contract_version,source_category,source_platform,source_medium,state)
     values($1,'manual',$2,$3,$4,'lead-inquiry-intake.v1','p1a-identity-v1','p1a-attribution-v1',$5,$6,'unknown','pending')
     returning id`,
    [fixture.workspaceId, randomUUID(), fixture.membershipId, "a".repeat(64), sourceCategory, sourcePlatform],
  )).rows[0];
  const lead = (await pool.query<{ id: string; lifecycle_definition_id: string }>(
    `insert into leads(
       workspace_id,display_name,first_name,last_name,email_normalized,email_display,company,source,
       original_source_category,original_source_platform,original_source_medium,intake_channel,
       source_platform,status,stage_id,owner_membership_id,visibility)
     values($1,'Casey Morgan','Casey','Morgan','casey@example.test','casey@example.test',null,$2,$2,$3,'unknown','manual',$3,'open',$4,null,'workspace')
     returning id,lifecycle_definition_id`,
    [fixture.workspaceId, sourceCategory, sourcePlatform, fixture.stageId],
  )).rows[0];
  await pool.query(
    `update lead_intakes set state='committed',lead_id=$3,outcome=$4,version=version+1,updated_at=now()
     where workspace_id=$1 and id=$2`,
    [fixture.workspaceId, intake.id, lead.id, JSON.stringify({ leadId: lead.id })],
  );
  return { intakeId: intake.id, leadId: lead.id, lifecycleDefinitionId: lead.lifecycle_definition_id };
}

suite("P1A lead intake schema", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => {
    await pool.query("truncate users cascade");
  });
  afterAll(async () => { await pool.end(); });

  it("seeds immutable lifecycle identities without treating converted as a legacy alias", async () => {
    const rows = (await pool.query<{ code: string; id: string }>(
      "select code,id from lead_lifecycle_definitions order by display_order",
    )).rows;
    expect(rows.map((row) => row.code)).toEqual(["new", "working", "qualified", "disqualified", "converted"]);
    await expect(pool.query(
      "update lead_lifecycle_definitions set code='renamed' where code='converted'",
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("stores immutable social attribution separately from manual intake channel", async () => {
    const fixture = await workspaceFixture();
    const result = await createLeadAndIntake(fixture, "instagram");
    const lead = (await pool.query(
      `select original_source_category,original_source_platform,original_source_medium,intake_channel
       from leads where workspace_id=$1 and id=$2`,
      [fixture.workspaceId, result.leadId],
    )).rows[0];
    expect(lead).toEqual({
      original_source_category: "social_media",
      original_source_platform: "instagram",
      original_source_medium: "unknown",
      intake_channel: "manual",
    });
    await expect(pool.query(
      "update leads set original_source_platform='facebook' where workspace_id=$1 and id=$2",
      [fixture.workspaceId, result.leadId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "insert into lead_intakes(workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,contract_version,normalization_version,attribution_contract_version,source_category,source_medium) values($1,'manual',$2,$3,$4,'v1','v1','v1','social_media','unknown')",
      [fixture.workspaceId, randomUUID(), fixture.membershipId, "b".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces durable idempotency and exact committed attribution", async () => {
    const fixture = await workspaceFixture();
    const key = randomUUID();
    const statement = `insert into lead_intakes(
      workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,contract_version,normalization_version,
      attribution_contract_version,source_category,source_medium)
      values($1,'manual',$2,$3,$4,'lead-inquiry-intake.v1','p1a-identity-v1','p1a-attribution-v1','manual','unknown')`;
    await pool.query(statement, [fixture.workspaceId, key, fixture.membershipId, "c".repeat(64)]);
    await expect(pool.query(statement, [fixture.workspaceId, key, fixture.membershipId, "d".repeat(64)])).rejects.toMatchObject({ code: "23505" });
    const csvStatement = `insert into lead_intakes(
      workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,contract_version,normalization_version,
      attribution_contract_version,source_category,source_medium)
      values($1,'csv',$2,$3,$4,'lead-inquiry-intake.v1','p1a-identity-v1','p1a-attribution-v1','import','unknown')`;
    await pool.query(csvStatement, [fixture.workspaceId, key, fixture.membershipId, "e".repeat(64)]);
    await expect(pool.query(csvStatement, [fixture.workspaceId, key, fixture.membershipId, "f".repeat(64)]))
      .rejects.toMatchObject({ code: "23505" });

    const result = await createLeadAndIntake(fixture);
    await expect(pool.query(
      "update lead_intakes set source_category='referral' where workspace_id=$1 and id=$2",
      [fixture.workspaceId, result.intakeId],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects cross-workspace identity links and permits duplicate evidence values", async () => {
    const first = await workspaceFixture();
    const second = await workspaceFixture();
    const company = (await pool.query<{ id: string }>(
      "insert into companies(workspace_id,display_name,name_normalized) values($1,'Acme','acme') returning id",
      [first.workspaceId],
    )).rows[0];
    await pool.query(
      `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized,phone_display,phone_normalized,phone_country_code_used)
       values($1,'Shared One','shared one','shared@example.test','shared@example.test','4165550100','+14165550100','CA'),
             ($1,'Shared Two','shared two','shared@example.test','shared@example.test','4165550100','+14165550100','CA')`,
      [first.workspaceId],
    );
    await expect(pool.query(
      "insert into contacts(workspace_id,display_name,person_name_normalized,company_id) values($1,'Cross Tenant','cross tenant',$2)",
      [second.workspaceId, company.id],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces one pending review and one effective complete decision per intake", async () => {
    const fixture = await workspaceFixture();
    const result = await createLeadAndIntake(fixture);
    const review = (await pool.query<{ id: string }>(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3) returning id",
      [fixture.workspaceId, result.intakeId, result.leadId],
    )).rows[0];
    await expect(pool.query(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3)",
      [fixture.workspaceId, result.intakeId, result.leadId],
    )).rejects.toMatchObject({ code: "23505" });

    await expect(pool.query(
      `insert into lead_identity_decisions(
        workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,governing_outcome,contact_action,company_action,actor_membership_id,
        expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'hold','dismiss','dismiss',$8,1,1,2,1,1,'p1a-review.v1','p1a-identity-v1')`,
      [fixture.workspaceId, result.intakeId, review.id, randomUUID(), "e".repeat(64), randomUUID(), randomUUID(), fixture.membershipId],
    )).rejects.toMatchObject({ code: "23514" });

    const decision = (await pool.query<{ id: string }>(
      `insert into lead_identity_decisions(
        workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,governing_outcome,actor_membership_id,
        expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'hold',$8,1,1,2,1,1,'p1a-review.v1','p1a-identity-v1') returning id`,
      [fixture.workspaceId, result.intakeId, review.id, randomUUID(), "f".repeat(64), randomUUID(), randomUUID(), fixture.membershipId],
    )).rows[0];
    await pool.query(
      "insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)",
      [fixture.workspaceId, result.intakeId, decision.id],
    );
    await expect(pool.query(
      "update lead_identity_reviews set state='resolved',version=2,resolved_at=now(),resolved_by_membership_id=$3 where workspace_id=$1 and id=$2",
      [fixture.workspaceId, review.id, fixture.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)",
      [fixture.workspaceId, result.intakeId, decision.id],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "update lead_identity_decisions set reason_code='changed' where id=$1",
      [decision.id],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("requires an effective complete resolve decision and accepts every two-dimension action permutation", async () => {
    const fixture = await workspaceFixture();
    const actions = ["create", "link", "dismiss"] as const;
    let resolvedReviewId = "";
    for (const contactAction of actions) for (const companyAction of actions) {
      const result = await createLeadAndIntake(fixture);
      const review = (await pool.query<{ id: string }>(
        "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3) returning id",
        [fixture.workspaceId, result.intakeId, result.leadId],
      )).rows[0];
      await expect(pool.query(
        "update lead_identity_reviews set state='resolved',version=2,resolved_at=now(),resolved_by_membership_id=$3 where workspace_id=$1 and id=$2",
        [fixture.workspaceId, review.id, fixture.membershipId],
      )).rejects.toMatchObject({ code: "23514" });

      const contact = contactAction === "dismiss" ? null : (await pool.query<{ id: string }>(
        `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
         values($1,$2,$3,$4,$4) returning id`,
        [fixture.workspaceId, `Contact ${randomUUID()}`, `contact ${randomUUID()}`, `${randomUUID()}@example.test`],
      )).rows[0].id;
      const company = companyAction === "dismiss" ? null : (await pool.query<{ id: string }>(
        "insert into companies(workspace_id,display_name,name_normalized) values($1,$2,$3) returning id",
        [fixture.workspaceId, `Company ${randomUUID()}`, `company ${randomUUID()}`],
      )).rows[0].id;
      const contactCandidate = contactAction === "link" ? (await pool.query<{ id: string }>(
        `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,normalization_version,target_version)
         values($1,$2,$3,'email','strong','p1a-identity-v1',1) returning id`,
        [fixture.workspaceId, review.id, contact],
      )).rows[0].id : null;
      const companyCandidate = companyAction === "link" ? (await pool.query<{ id: string }>(
        `insert into lead_identity_candidates(workspace_id,review_id,company_id,evidence_kind,evidence_strength,normalization_version,target_version)
         values($1,$2,$3,'name_company','probable','p1a-identity-v1',1) returning id`,
        [fixture.workspaceId, review.id, company],
      )).rows[0].id : null;
      const decision = (await pool.query<{ id: string }>(
        `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,
         governing_outcome,contact_action,company_action,contact_id,company_id,contact_candidate_id,company_candidate_id,
         contact_target_version,company_target_version,actor_membership_id,expected_lead_version,expected_review_version,
         expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
         values($1,$2,$3,$4,$5,$6,$7,'resolve',$8,$9,$10,$11,$12,$13,$14,$15,$16,1,1,2,1,2,'p1a-review.v1','p1a-identity-v1') returning id`,
        [fixture.workspaceId, result.intakeId, review.id, randomUUID(), "7".repeat(64), randomUUID(), randomUUID(),
          contactAction, companyAction, contact, company, contactCandidate, companyCandidate,
          contactAction === "dismiss" ? null : 1, companyAction === "dismiss" ? null : 1, fixture.membershipId],
      )).rows[0];
      await pool.query(
        "insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)",
        [fixture.workspaceId, result.intakeId, decision.id],
      );
      await pool.query(
        "update lead_identity_reviews set state='resolved',version=2,resolved_at=now(),resolved_by_membership_id=$3 where workspace_id=$1 and id=$2",
        [fixture.workspaceId, review.id, fixture.membershipId],
      );
      resolvedReviewId = review.id;
      if (contactCandidate) await expect(pool.query(
        "update lead_identity_candidates set target_version=2 where id=$1", [contactCandidate],
      )).rejects.toMatchObject({ code: "23514" });
    }
    await expect(pool.query(
      "update lead_identity_reviews set state='pending',version=3,resolved_at=null,resolved_by_membership_id=null where id=$1",
      [resolvedReviewId],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("allows a required outbox event set but rejects duplicate event identity", async () => {
    const fixture = await workspaceFixture();
    const result = await createLeadAndIntake(fixture);
    const operationId = randomUUID();
    const insert = `insert into outbox_messages(
      workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
      values($1,$2,'lead',$3,$4,1,'{}')`;
    await pool.query(insert, [fixture.workspaceId, "crm.inquiry.created.v1", result.leadId, operationId]);
    await pool.query(insert, [fixture.workspaceId, "crm.inquiry.review_required.v1", result.leadId, operationId]);
    await expect(pool.query(insert, [fixture.workspaceId, "crm.inquiry.created.v1", result.leadId, operationId])).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects stale selected target versions and stale resolution versions", async () => {
    const fixture = await workspaceFixture();
    const result = await createLeadAndIntake(fixture);
    const review = (await pool.query<{ id: string }>(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3) returning id",
      [fixture.workspaceId, result.intakeId, result.leadId],
    )).rows[0];
    const contact = (await pool.query<{ id: string }>(
      `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
       values($1,'Candidate','candidate','candidate@example.test','candidate@example.test') returning id`,
      [fixture.workspaceId],
    )).rows[0];
    const candidate = (await pool.query<{ id: string }>(
      `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,normalization_version,target_version)
       values($1,$2,$3,'email','strong','p1a-identity-v1',1) returning id`,
      [fixture.workspaceId, review.id, contact.id],
    )).rows[0];
    await pool.query("update contacts set version=2 where workspace_id=$1 and id=$2", [fixture.workspaceId, contact.id]);
    await expect(pool.query(
      `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,
       governing_outcome,contact_action,company_action,contact_id,contact_candidate_id,contact_target_version,actor_membership_id,
       expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'resolve','link','dismiss',$8,$9,1,$10,1,1,2,1,2,'p1a-review.v1','p1a-identity-v1')`,
      [fixture.workspaceId, result.intakeId, review.id, randomUUID(), "8".repeat(64), randomUUID(), randomUUID(), contact.id, candidate.id, fixture.membershipId],
    )).rejects.toMatchObject({ code: "23514" });

    const staleDecision = (await pool.query<{ id: string }>(
      `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,
       governing_outcome,contact_action,company_action,actor_membership_id,expected_lead_version,expected_review_version,
       expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'resolve','dismiss','dismiss',$8,1,1,2,1,3,'p1a-review.v1','p1a-identity-v1') returning id`,
      [fixture.workspaceId, result.intakeId, review.id, randomUUID(), "9".repeat(64), randomUUID(), randomUUID(), fixture.membershipId],
    )).rows[0];
    await pool.query("insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)",
      [fixture.workspaceId, result.intakeId, staleDecision.id]);
    await expect(pool.query(
      "update lead_identity_reviews set state='resolved',version=2,resolved_at=now(),resolved_by_membership_id=$3 where workspace_id=$1 and id=$2",
      [fixture.workspaceId, review.id, fixture.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts display-name-only P1A Leads with either email or complete phone evidence", async () => {
    const fixture = await workspaceFixture();
    const emailLead = (await pool.query<{ lifecycle_definition_id: string }>(
      `insert into leads(workspace_id,display_name,email_display,email_normalized,source,original_source_category,
       intake_channel,status,stage_id,visibility) values($1,'Email Only','email@example.test','email@example.test',
       'manual','manual','manual','open',$2,'workspace') returning lifecycle_definition_id`,
      [fixture.workspaceId, fixture.stageId],
    )).rows[0];
    expect(emailLead.lifecycle_definition_id).toBe("00000000-0000-4000-8000-000000000001");
    await pool.query(
      `insert into leads(workspace_id,display_name,phone,phone_normalized,phone_country_code_used,source,
       original_source_category,intake_channel,status,stage_id,visibility)
       values($1,'Phone Only','416 555 0100','+14165550100','CA','manual','manual','manual','open',$2,'workspace')`,
      [fixture.workspaceId, fixture.stageId],
    );
    await expect(pool.query(
      `insert into leads(workspace_id,display_name,phone_normalized,source,original_source_category,intake_channel,status,stage_id,visibility)
       values($1,'Incomplete Phone','+14165550101','manual','manual','manual','open',$2,'workspace')`,
      [fixture.workspaceId, fixture.stageId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "update leads set lifecycle_definition_id=null where workspace_id=$1 and display_name='Email Only'",
      [fixture.workspaceId],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces social registry fallback context and channel-neutral operation identity", async () => {
    const fixture = await workspaceFixture();
    for (const platform of ["tiktok", "instagram", "facebook", "linkedin", "x", "youtube"]) {
      await pool.query(
        `insert into lead_intakes(workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,
         contract_version,normalization_version,attribution_contract_version,source_category,source_platform,source_medium)
         values($1,'manual',$2,$3,$4,'lead-inquiry-intake.v1','p1a-identity-v1','p1a-attribution-v1','social_media',$5,'unknown')`,
        [fixture.workspaceId, randomUUID(), fixture.membershipId, randomUUID().replaceAll("-", ""), platform],
      );
    }
    await expect(pool.query(
      `insert into lead_intakes(workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,
       contract_version,normalization_version,attribution_contract_version,source_category,source_platform,source_medium)
       values($1,'manual',$2,$3,$4,'v1','v1','v1','social_media','other_social','unknown')`,
      [fixture.workspaceId, randomUUID(), fixture.membershipId, "1".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });
    for (const channel of ["csv", "spreadsheet"]) {
      await expect(pool.query(
        `insert into lead_intakes(workspace_id,intake_channel,idempotency_key,request_hash,contract_version,
         normalization_version,attribution_contract_version,source_category,source_medium)
         values($1,$2,$3,$4,'v1','v1','v1','import','unknown')`,
        [fixture.workspaceId, channel, randomUUID(), "0".repeat(64)],
      )).rejects.toMatchObject({ code: "23514" });
    }
    await pool.query(
      `insert into lead_intakes(workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,
       contract_version,normalization_version,attribution_contract_version,source_category,source_platform,source_medium,source_detail)
       values($1,'spreadsheet',$2,$3,$4,'v1','v1','v1','social_media','other_social','unknown','{"platform_context":"community forum"}')`,
      [fixture.workspaceId, randomUUID(), fixture.membershipId, "2".repeat(64)],
    );
    const operations = (await pool.query<{ operation: string }>("select distinct operation from lead_intakes")).rows;
    expect(operations).toEqual([{ operation: "lead-inquiry-intake.v1" }]);
  });

  it("tenant-qualifies assignment, intake actor, Lead identity links, and review lineage", async () => {
    const first = await workspaceFixture();
    const second = await workspaceFixture();
    const result = await createLeadAndIntake(first);
    const contact = (await pool.query<{ id: string }>(
      "insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized) values($1,'Other','other','other@example.test','other@example.test') returning id",
      [second.workspaceId],
    )).rows[0];
    const company = (await pool.query<{ id: string }>(
      "insert into companies(workspace_id,display_name,name_normalized) values($1,'Other Co','other co') returning id",
      [second.workspaceId],
    )).rows[0];
    const team = (await pool.query<{ id: string }>(
      "insert into teams(workspace_id,name,name_normalized,created_by_membership_id) values($1,'Other Team','other team',$2) returning id",
      [second.workspaceId, second.membershipId],
    )).rows[0];
    for (const [column, value] of [["contact_id", contact.id], ["company_id", company.id], ["owner_membership_id", second.membershipId], ["responsible_team_id", team.id]] as const) {
      await expect(pool.query(`update leads set ${column}=$3 where workspace_id=$1 and id=$2`, [first.workspaceId, result.leadId, value]))
        .rejects.toMatchObject({ code: "23503" });
    }
    await expect(pool.query(
      `insert into lead_intakes(workspace_id,intake_channel,idempotency_key,actor_membership_id,request_hash,contract_version,
       normalization_version,attribution_contract_version,source_category,source_medium)
       values($1,'manual',$2,$3,$4,'v1','v1','v1','manual','unknown')`,
      [first.workspaceId, randomUUID(), second.membershipId, "3".repeat(64)],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3)",
      [first.workspaceId, result.intakeId, randomUUID()],
    )).rejects.toMatchObject({ code: "23514" });
    const otherResult = await createLeadAndIntake(first);
    await expect(pool.query(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3)",
      [first.workspaceId, result.intakeId, otherResult.leadId],
    )).rejects.toMatchObject({ code: "23514" });
    const review = (await pool.query<{ id: string }>(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3) returning id",
      [first.workspaceId, result.intakeId, result.leadId],
    )).rows[0];
    await expect(pool.query(
      `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,
       normalization_version,target_version) values($1,$2,$3,'email','strong','p1a-identity-v1',1)`,
      [first.workspaceId, review.id, contact.id],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query(
      `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,
       correlation_id,governing_outcome,actor_membership_id,expected_lead_version,expected_review_version,
       expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'hold',$8,1,1,2,1,1,'p1a-review.v1','p1a-identity-v1')`,
      [first.workspaceId, result.intakeId, review.id, randomUUID(), "4".repeat(64), randomUUID(), randomUUID(), second.membershipId],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query(
      `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,
       correlation_id,governing_outcome,contact_action,company_action,contact_id,company_id,contact_target_version,
       company_target_version,actor_membership_id,expected_lead_version,expected_review_version,expected_intake_version,
       result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'resolve','create','create',$8,$9,1,1,$10,1,1,2,1,2,'p1a-review.v1','p1a-identity-v1')`,
      [first.workspaceId, result.intakeId, review.id, randomUUID(), "5".repeat(64), randomUUID(), randomUUID(), contact.id, company.id, first.membershipId],
    )).rejects.toMatchObject({ code: "23503" });

    const secondResult = await createLeadAndIntake(second);
    const secondReview = (await pool.query<{ id: string }>(
      "insert into lead_identity_reviews(workspace_id,intake_id,lead_id) values($1,$2,$3) returning id",
      [second.workspaceId, secondResult.intakeId, secondResult.leadId],
    )).rows[0];
    const secondDecision = (await pool.query<{ id: string }>(
      `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,
       correlation_id,governing_outcome,actor_membership_id,expected_lead_version,expected_review_version,
       expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,'hold',$8,1,1,2,1,1,'p1a-review.v1','p1a-identity-v1') returning id`,
      [second.workspaceId, secondResult.intakeId, secondReview.id, randomUUID(), "6".repeat(64), randomUUID(), randomUUID(), second.membershipId],
    )).rows[0];
    await expect(pool.query(
      `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,
       correlation_id,supersedes_decision_id,governing_outcome,actor_membership_id,expected_lead_version,
       expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version)
       values($1,$2,$3,$4,$5,$6,$7,$8,'hold',$9,1,1,2,1,1,'p1a-review.v1','p1a-identity-v1')`,
      [first.workspaceId, result.intakeId, review.id, randomUUID(), "a".repeat(64), randomUUID(), randomUUID(), secondDecision.id, first.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
  });
});
