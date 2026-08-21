ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_role_id_roles_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "roles_workspace_id_id_uq" ON "roles" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "membership_workspace_role_fk" FOREIGN KEY ("workspace_id","role_id") REFERENCES "public"."roles"("workspace_id","id") ON DELETE no action ON UPDATE no action;
