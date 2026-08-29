-- Every workspace needs a Deal pipeline before a Lead can be converted. Provisioning did
-- not create one and no other surface does, so existing workspaces cannot convert at all.
-- Backfill one default pipeline per workspace that has none, attributed to that
-- workspace's owner membership. Workspaces with no active owner are skipped rather than
-- given an invalid attribution; provisioning covers every workspace created from now on.
DO $$
DECLARE target record; pipeline_id uuid; operation_id uuid;
BEGIN
  FOR target IN
    SELECT w.id AS workspace_id, (
      SELECT m.id FROM workspace_memberships m
        JOIN roles r ON r.workspace_id = m.workspace_id AND r.id = m.role_id
       WHERE m.workspace_id = w.id AND m.status = 'active' AND r.code = 'owner'
       ORDER BY m.created_at, m.id LIMIT 1) AS owner_membership_id
      FROM workspaces w
     WHERE NOT EXISTS (SELECT 1 FROM sales_pipelines p WHERE p.workspace_id = w.id)
  LOOP
    CONTINUE WHEN target.owner_membership_id IS NULL;
    pipeline_id := gen_random_uuid();
    operation_id := gen_random_uuid();
    INSERT INTO sales_pipelines(id,workspace_id,code,label,is_default,governing_operation_id,
        created_by_membership_id,updated_by_membership_id)
      VALUES (pipeline_id,target.workspace_id,'sales.default','Sales pipeline',true,operation_id,
        target.owner_membership_id,target.owner_membership_id);
    INSERT INTO deal_stage_definitions(workspace_id,pipeline_id,code,label,outcome_class,sort_key,
        default_probability_bps,governing_operation_id,created_by_membership_id,updated_by_membership_id)
      VALUES
        (target.workspace_id,pipeline_id,'sales.discovery','Discovery','open',1000,1000,operation_id,target.owner_membership_id,target.owner_membership_id),
        (target.workspace_id,pipeline_id,'sales.proposal','Proposal','open',2000,4000,operation_id,target.owner_membership_id,target.owner_membership_id),
        (target.workspace_id,pipeline_id,'sales.negotiation','Negotiation','open',3000,7000,operation_id,target.owner_membership_id,target.owner_membership_id),
        (target.workspace_id,pipeline_id,'sales.won','Won','won',9000,10000,operation_id,target.owner_membership_id,target.owner_membership_id),
        (target.workspace_id,pipeline_id,'sales.lost','Lost','lost',9500,0,operation_id,target.owner_membership_id,target.owner_membership_id);
  END LOOP;
END $$;
