CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_record_type" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"field_type" text NOT NULL,
	"lifecycle" text DEFAULT 'draft' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"searchable" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"sortable" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL,
	"normalization_version" text DEFAULT 'custom-field-normalization-v1' NOT NULL,
	"default_text_value" text,
	"default_integer_value" bigint,
	"default_decimal_value" numeric(18, 6),
	"default_boolean_value" boolean,
	"default_date_value" date,
	"default_timestamp_value" timestamp with time zone,
	"default_option_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_definitions_target_check" CHECK ("custom_field_definitions"."target_record_type" in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')),
	CONSTRAINT "custom_field_definitions_code_check" CHECK ("custom_field_definitions"."code" ~ '^[a-z][a-z0-9_]{1,63}$'),
	CONSTRAINT "custom_field_definitions_label_check" CHECK ("custom_field_definitions"."label"=btrim("custom_field_definitions"."label") and char_length("custom_field_definitions"."label") between 1 and 80 and "custom_field_definitions"."label" !~ '[[:cntrl:]]'),
	CONSTRAINT "custom_field_definitions_description_check" CHECK ("custom_field_definitions"."description" is null or ("custom_field_definitions"."description"=btrim("custom_field_definitions"."description") and char_length("custom_field_definitions"."description") between 1 and 500 and "custom_field_definitions"."description" !~ '[[:cntrl:]]')),
	CONSTRAINT "custom_field_definitions_type_check" CHECK ("custom_field_definitions"."field_type" in ('short_text','long_text','integer','decimal','boolean','date','timestamp','single_select','multi_select')),
	CONSTRAINT "custom_field_definitions_lifecycle_check" CHECK ("custom_field_definitions"."lifecycle" in ('draft','active','archived')),
	CONSTRAINT "custom_field_definitions_order_version_check" CHECK ("custom_field_definitions"."display_order" between 0 and 9999 and "custom_field_definitions"."version">0),
	CONSTRAINT "custom_field_definitions_normalization_check" CHECK ("custom_field_definitions"."normalization_version"='custom-field-normalization-v1'),
	CONSTRAINT "custom_field_definitions_archive_check" CHECK (("custom_field_definitions"."lifecycle"='archived' and "custom_field_definitions"."archived_at" is not null and "custom_field_definitions"."archived_by_membership_id" is not null) or ("custom_field_definitions"."lifecycle"<>'archived' and "custom_field_definitions"."archived_at" is null and "custom_field_definitions"."archived_by_membership_id" is null)),
	CONSTRAINT "custom_field_definitions_capabilities_check" CHECK ((not "custom_field_definitions"."searchable" or "custom_field_definitions"."field_type" in ('short_text','single_select')) and (not "custom_field_definitions"."filterable" or "custom_field_definitions"."field_type" in ('short_text','integer','decimal','boolean','date','timestamp','single_select','multi_select')) and (not "custom_field_definitions"."sortable" or "custom_field_definitions"."field_type" in ('short_text','integer','decimal','boolean','date','timestamp','single_select')) and ("custom_field_definitions"."field_type"<>'long_text' or (not "custom_field_definitions"."searchable" and not "custom_field_definitions"."filterable" and not "custom_field_definitions"."sortable"))),
	CONSTRAINT "custom_field_definitions_default_count_check" CHECK (num_nonnulls("custom_field_definitions"."default_text_value","custom_field_definitions"."default_integer_value","custom_field_definitions"."default_decimal_value","custom_field_definitions"."default_boolean_value","custom_field_definitions"."default_date_value","custom_field_definitions"."default_timestamp_value","custom_field_definitions"."default_option_id")<=1),
	CONSTRAINT "custom_field_definitions_default_shape_check" CHECK (coalesce((
      ("custom_field_definitions"."default_text_value" is null and "custom_field_definitions"."default_integer_value" is null and "custom_field_definitions"."default_decimal_value" is null and "custom_field_definitions"."default_boolean_value" is null and "custom_field_definitions"."default_date_value" is null and "custom_field_definitions"."default_timestamp_value" is null and "custom_field_definitions"."default_option_id" is null)
      or ("custom_field_definitions"."field_type"='short_text' and "custom_field_definitions"."default_text_value"=btrim("custom_field_definitions"."default_text_value") and char_length("custom_field_definitions"."default_text_value") between 1 and 500 and "custom_field_definitions"."default_text_value" !~ '[[:cntrl:]]')
      or ("custom_field_definitions"."field_type"='long_text' and "custom_field_definitions"."default_text_value"=btrim("custom_field_definitions"."default_text_value") and char_length("custom_field_definitions"."default_text_value") between 1 and 10000 and "custom_field_definitions"."default_text_value" !~ '[[:cntrl:]]')
      or ("custom_field_definitions"."field_type"='integer' and "custom_field_definitions"."default_integer_value" between -9007199254740991 and 9007199254740991)
      or ("custom_field_definitions"."field_type"='decimal' and "custom_field_definitions"."default_decimal_value" between -999999999999.999999 and 999999999999.999999)
      or ("custom_field_definitions"."field_type"='boolean' and "custom_field_definitions"."default_boolean_value" is not null)
      or ("custom_field_definitions"."field_type"='date' and "custom_field_definitions"."default_date_value" is not null)
      or ("custom_field_definitions"."field_type"='timestamp' and "custom_field_definitions"."default_timestamp_value" is not null)
      or ("custom_field_definitions"."field_type"='single_select' and "custom_field_definitions"."default_option_id" is not null)),false)),
	CONSTRAINT "custom_field_definitions_multi_default_check" CHECK ("custom_field_definitions"."field_type"<>'multi_select' or num_nonnulls("custom_field_definitions"."default_text_value","custom_field_definitions"."default_integer_value","custom_field_definitions"."default_decimal_value","custom_field_definitions"."default_boolean_value","custom_field_definitions"."default_date_value","custom_field_definitions"."default_timestamp_value","custom_field_definitions"."default_option_id")=0)
);
--> statement-breakpoint
CREATE TABLE "custom_field_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_options_code_check" CHECK ("custom_field_options"."code" ~ '^[a-z][a-z0-9_]{1,63}$'),
	CONSTRAINT "custom_field_options_label_check" CHECK ("custom_field_options"."label"=btrim("custom_field_options"."label") and char_length("custom_field_options"."label") between 1 and 80 and "custom_field_options"."label" !~ '[[:cntrl:]]'),
	CONSTRAINT "custom_field_options_order_check" CHECK ("custom_field_options"."display_order" between 0 and 999),
	CONSTRAINT "custom_field_options_lifecycle_check" CHECK ("custom_field_options"."lifecycle" in ('active','archived')),
	CONSTRAINT "custom_field_options_version_check" CHECK ("custom_field_options"."version">0),
	CONSTRAINT "custom_field_options_archive_check" CHECK (("custom_field_options"."lifecycle"='archived' and "custom_field_options"."archived_at" is not null and "custom_field_options"."archived_by_membership_id" is not null) or ("custom_field_options"."lifecycle"='active' and "custom_field_options"."archived_at" is null and "custom_field_options"."archived_by_membership_id" is null))
);
--> statement-breakpoint
CREATE TABLE "custom_field_value_options" (
	"workspace_id" uuid NOT NULL,
	"value_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_value_options_pk" PRIMARY KEY("workspace_id","value_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"target_record_type" text NOT NULL,
	"target_record_id" uuid NOT NULL,
	"field_type" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"text_value" text,
	"text_normalized" text,
	"integer_value" bigint,
	"decimal_value" numeric(18, 6),
	"boolean_value" boolean,
	"date_value" date,
	"timestamp_value" timestamp with time zone,
	"redaction_marker" text,
	"normalization_version" text DEFAULT 'custom-field-normalization-v1' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"redacted_at" timestamp with time zone,
	"redacted_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_values_target_check" CHECK ("custom_field_values"."target_record_type" in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')),
	CONSTRAINT "custom_field_values_type_check" CHECK ("custom_field_values"."field_type" in ('short_text','long_text','integer','decimal','boolean','date','timestamp','single_select','multi_select')),
	CONSTRAINT "custom_field_values_lifecycle_check" CHECK ("custom_field_values"."lifecycle" in ('active','archived','redacted')),
	CONSTRAINT "custom_field_values_version_normalization_check" CHECK ("custom_field_values"."version">0 and "custom_field_values"."normalization_version"='custom-field-normalization-v1'),
	CONSTRAINT "custom_field_values_metadata_check" CHECK (
      ("custom_field_values"."lifecycle"='active' and "custom_field_values"."archived_at" is null and "custom_field_values"."archived_by_membership_id" is null and "custom_field_values"."redacted_at" is null and "custom_field_values"."redacted_by_membership_id" is null)
      or ("custom_field_values"."lifecycle"='archived' and "custom_field_values"."archived_at" is not null and "custom_field_values"."archived_by_membership_id" is not null and "custom_field_values"."redacted_at" is null and "custom_field_values"."redacted_by_membership_id" is null)
      or ("custom_field_values"."lifecycle"='redacted' and "custom_field_values"."redacted_at" is not null and "custom_field_values"."redacted_by_membership_id" is not null and (("custom_field_values"."archived_at" is null and "custom_field_values"."archived_by_membership_id" is null) or ("custom_field_values"."archived_at" is not null and "custom_field_values"."archived_by_membership_id" is not null)))),
	CONSTRAINT "custom_field_values_shape_check" CHECK (coalesce((
      ("custom_field_values"."lifecycle"='redacted' and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0 and "custom_field_values"."redaction_marker"='content_redacted')
      or ("custom_field_values"."lifecycle"<>'redacted' and "custom_field_values"."redaction_marker" is null and (
        ("custom_field_values"."field_type"='short_text' and "custom_field_values"."text_value"=btrim("custom_field_values"."text_value") and char_length("custom_field_values"."text_value") between 1 and 500 and "custom_field_values"."text_value" !~ '[[:cntrl:]]' and "custom_field_values"."text_normalized"=lower(btrim("custom_field_values"."text_normalized")) and "custom_field_values"."text_normalized"=lower(btrim("custom_field_values"."text_value")) and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized")=2 and num_nonnulls("custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0)
        or ("custom_field_values"."field_type"='long_text' and "custom_field_values"."text_value"=btrim("custom_field_values"."text_value") and char_length("custom_field_values"."text_value") between 1 and 10000 and "custom_field_values"."text_value" !~ '[[:cntrl:]]' and "custom_field_values"."text_normalized" is null and num_nonnulls("custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0)
        or ("custom_field_values"."field_type"='integer' and "custom_field_values"."integer_value" between -9007199254740991 and 9007199254740991 and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0)
        or ("custom_field_values"."field_type"='decimal' and "custom_field_values"."decimal_value" between -999999999999.999999 and 999999999999.999999 and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."integer_value","custom_field_values"."boolean_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0)
        or ("custom_field_values"."field_type"='boolean' and "custom_field_values"."boolean_value" is not null and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0)
        or ("custom_field_values"."field_type"='date' and "custom_field_values"."date_value" is not null and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."timestamp_value")=0)
        or ("custom_field_values"."field_type"='timestamp' and "custom_field_values"."timestamp_value" is not null and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."date_value")=0)
		or ("custom_field_values"."field_type" in ('single_select','multi_select') and num_nonnulls("custom_field_values"."text_value","custom_field_values"."text_normalized","custom_field_values"."integer_value","custom_field_values"."decimal_value","custom_field_values"."boolean_value","custom_field_values"."date_value","custom_field_values"."timestamp_value")=0)))),false))
);
--> statement-breakpoint
CREATE TABLE "customization_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"normalization_version" text DEFAULT 'tag-normalization-v1' NOT NULL,
	"color_code" text DEFAULT 'neutral' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customization_tags_code_check" CHECK ("customization_tags"."code" ~ '^[a-z][a-z0-9_]{1,63}$'),
	CONSTRAINT "customization_tags_label_check" CHECK ("customization_tags"."label"=btrim("customization_tags"."label") and char_length("customization_tags"."label") between 1 and 50 and "customization_tags"."label" !~ '[[:cntrl:]]' and "customization_tags"."normalized_label"=lower(btrim("customization_tags"."normalized_label")) and char_length("customization_tags"."normalized_label") between 1 and 50 and "customization_tags"."normalized_label"=lower(btrim("customization_tags"."label"))),
	CONSTRAINT "customization_tags_normalization_check" CHECK ("customization_tags"."normalization_version"='tag-normalization-v1'),
	CONSTRAINT "customization_tags_color_check" CHECK ("customization_tags"."color_code" in ('neutral','gray','red','orange','amber','green','teal','blue','indigo','violet','pink')),
	CONSTRAINT "customization_tags_lifecycle_check" CHECK ("customization_tags"."lifecycle" in ('active','archived') and "customization_tags"."version">0),
	CONSTRAINT "customization_tags_archive_check" CHECK (("customization_tags"."lifecycle"='archived' and "customization_tags"."archived_at" is not null and "customization_tags"."archived_by_membership_id" is not null) or ("customization_tags"."lifecycle"='active' and "customization_tags"."archived_at" is null and "customization_tags"."archived_by_membership_id" is null))
);
--> statement-breakpoint
CREATE TABLE "record_tag_assignments" (
	"workspace_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_tag_assignments_pk" PRIMARY KEY("workspace_id","tag_id","record_type","record_id"),
	CONSTRAINT "record_tag_assignments_type_check" CHECK ("record_tag_assignments"."record_type" in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project'))
);
--> statement-breakpoint
CREATE TABLE "saved_list_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"definition_version" integer NOT NULL,
	"contract_version" text DEFAULT 'saved-list-filter.v1' NOT NULL,
	"filter_ast" jsonb NOT NULL,
	"filter_ast_hash" char(64) NOT NULL,
	"sort_source" text NOT NULL,
	"sort_field_code" text,
	"sort_definition_id" uuid,
	"sort_direction" text DEFAULT 'asc' NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_list_versions_definition_check" CHECK ("saved_list_versions"."definition_version">0),
	CONSTRAINT "saved_list_versions_contract_check" CHECK ("saved_list_versions"."contract_version"='saved-list-filter.v1'),
	CONSTRAINT "saved_list_versions_ast_size_check" CHECK (jsonb_typeof("saved_list_versions"."filter_ast")='object' and octet_length("saved_list_versions"."filter_ast"::text)<=8192),
	CONSTRAINT "saved_list_versions_hash_check" CHECK ("saved_list_versions"."filter_ast_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "saved_list_versions_sort_check" CHECK ("saved_list_versions"."sort_direction" in ('asc','desc') and (("saved_list_versions"."sort_source"='system' and "saved_list_versions"."sort_field_code" is not null and "saved_list_versions"."sort_field_code"=btrim("saved_list_versions"."sort_field_code") and char_length("saved_list_versions"."sort_field_code") between 1 and 64 and "saved_list_versions"."sort_field_code" !~ '[[:cntrl:]]' and "saved_list_versions"."sort_definition_id" is null) or ("saved_list_versions"."sort_source"='custom' and "saved_list_versions"."sort_field_code" is null and "saved_list_versions"."sort_definition_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "saved_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_record_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_definition_version" integer DEFAULT 1 NOT NULL,
	"governing_operation_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_lists_target_check" CHECK ("saved_lists"."target_record_type" in ('crm.lead','crm.contact','crm.company','sales.deal','delivery.project')),
	CONSTRAINT "saved_lists_name_check" CHECK ("saved_lists"."name"=btrim("saved_lists"."name") and char_length("saved_lists"."name") between 1 and 100 and "saved_lists"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "saved_lists_description_check" CHECK ("saved_lists"."description" is null or ("saved_lists"."description"=btrim("saved_lists"."description") and char_length("saved_lists"."description") between 1 and 500 and "saved_lists"."description" !~ '[[:cntrl:]]')),
	CONSTRAINT "saved_lists_visibility_check" CHECK ("saved_lists"."visibility" in ('private','workspace')),
	CONSTRAINT "saved_lists_lifecycle_check" CHECK ("saved_lists"."lifecycle" in ('active','archived') and "saved_lists"."version">0 and "saved_lists"."current_definition_version">0),
	CONSTRAINT "saved_lists_archive_check" CHECK (("saved_lists"."lifecycle"='archived' and "saved_lists"."archived_at" is not null and "saved_lists"."archived_by_membership_id" is not null) or ("saved_lists"."lifecycle"='active' and "saved_lists"."archived_at" is null and "saved_lists"."archived_by_membership_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_workspace_id_id_uq" ON "custom_field_definitions" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_options_workspace_id_definition_uq" ON "custom_field_options" USING btree ("workspace_id","id","definition_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_workspace_id_definition_uq" ON "custom_field_values" USING btree ("workspace_id","id","definition_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customization_tags_workspace_id_id_uq" ON "customization_tags" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "saved_lists_workspace_id_id_uq" ON "saved_lists" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_default_option_fk" FOREIGN KEY ("workspace_id","default_option_id","id") REFERENCES "public"."custom_field_options"("workspace_id","id","definition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_definition_fk" FOREIGN KEY ("workspace_id","definition_id") REFERENCES "public"."custom_field_definitions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value_options" ADD CONSTRAINT "custom_field_value_options_value_fk" FOREIGN KEY ("workspace_id","value_id","definition_id") REFERENCES "public"."custom_field_values"("workspace_id","id","definition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value_options" ADD CONSTRAINT "custom_field_value_options_option_fk" FOREIGN KEY ("workspace_id","option_id","definition_id") REFERENCES "public"."custom_field_options"("workspace_id","id","definition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value_options" ADD CONSTRAINT "custom_field_value_options_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_definition_fk" FOREIGN KEY ("workspace_id","definition_id") REFERENCES "public"."custom_field_definitions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_redactor_fk" FOREIGN KEY ("workspace_id","redacted_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customization_tags" ADD CONSTRAINT "customization_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customization_tags" ADD CONSTRAINT "customization_tags_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customization_tags" ADD CONSTRAINT "customization_tags_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customization_tags" ADD CONSTRAINT "customization_tags_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_tag_assignments" ADD CONSTRAINT "record_tag_assignments_tag_fk" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "public"."customization_tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_tag_assignments" ADD CONSTRAINT "record_tag_assignments_assigner_fk" FOREIGN KEY ("workspace_id","assigned_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_list_versions" ADD CONSTRAINT "saved_list_versions_list_fk" FOREIGN KEY ("workspace_id","list_id") REFERENCES "public"."saved_lists"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_list_versions" ADD CONSTRAINT "saved_list_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_owner_fk" FOREIGN KEY ("workspace_id","owner_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_updater_fk" FOREIGN KEY ("workspace_id","updated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_archiver_fk" FOREIGN KEY ("workspace_id","archived_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_workspace_target_code_uq" ON "custom_field_definitions" USING btree ("workspace_id","target_record_type","code");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_active_order_uq" ON "custom_field_definitions" USING btree ("workspace_id","target_record_type","display_order") WHERE "custom_field_definitions"."lifecycle"<>'archived';--> statement-breakpoint
CREATE INDEX "custom_field_definitions_admin_idx" ON "custom_field_definitions" USING btree ("workspace_id","target_record_type","lifecycle","display_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_options_workspace_id_id_uq" ON "custom_field_options" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_options_definition_code_uq" ON "custom_field_options" USING btree ("workspace_id","definition_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_options_active_order_uq" ON "custom_field_options" USING btree ("workspace_id","definition_id","display_order") WHERE "custom_field_options"."lifecycle"='active';--> statement-breakpoint
CREATE INDEX "custom_field_options_admin_idx" ON "custom_field_options" USING btree ("workspace_id","definition_id","lifecycle","display_order","id");--> statement-breakpoint
CREATE INDEX "custom_field_value_options_lookup_idx" ON "custom_field_value_options" USING btree ("workspace_id","definition_id","option_id","value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_workspace_id_id_uq" ON "custom_field_values" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_target_definition_uq" ON "custom_field_values" USING btree ("workspace_id","definition_id","target_record_type","target_record_id");--> statement-breakpoint
CREATE INDEX "custom_field_values_text_idx" ON "custom_field_values" USING btree ("workspace_id","definition_id","text_normalized" text_pattern_ops,"target_record_type","target_record_id") WHERE "custom_field_values"."lifecycle"='active' and "custom_field_values"."text_normalized" is not null;--> statement-breakpoint
CREATE INDEX "custom_field_values_integer_idx" ON "custom_field_values" USING btree ("workspace_id","definition_id","integer_value","target_record_type","target_record_id") WHERE "custom_field_values"."lifecycle"='active' and "custom_field_values"."integer_value" is not null;--> statement-breakpoint
CREATE INDEX "custom_field_values_decimal_idx" ON "custom_field_values" USING btree ("workspace_id","definition_id","decimal_value","target_record_type","target_record_id") WHERE "custom_field_values"."lifecycle"='active' and "custom_field_values"."decimal_value" is not null;--> statement-breakpoint
CREATE INDEX "custom_field_values_boolean_idx" ON "custom_field_values" USING btree ("workspace_id","definition_id","boolean_value","target_record_type","target_record_id") WHERE "custom_field_values"."lifecycle"='active' and "custom_field_values"."boolean_value" is not null;--> statement-breakpoint
CREATE INDEX "custom_field_values_date_idx" ON "custom_field_values" USING btree ("workspace_id","definition_id","date_value","target_record_type","target_record_id") WHERE "custom_field_values"."lifecycle"='active' and "custom_field_values"."date_value" is not null;--> statement-breakpoint
CREATE INDEX "custom_field_values_timestamp_idx" ON "custom_field_values" USING btree ("workspace_id","definition_id","timestamp_value","target_record_type","target_record_id") WHERE "custom_field_values"."lifecycle"='active' and "custom_field_values"."timestamp_value" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customization_tags_workspace_code_uq" ON "customization_tags" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "customization_tags_workspace_label_uq" ON "customization_tags" USING btree ("workspace_id","normalized_label");--> statement-breakpoint
CREATE INDEX "customization_tags_admin_idx" ON "customization_tags" USING btree ("workspace_id","lifecycle","normalized_label","id");--> statement-breakpoint
CREATE INDEX "record_tag_assignments_target_idx" ON "record_tag_assignments" USING btree ("workspace_id","record_type","record_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_list_versions_workspace_id_id_uq" ON "saved_list_versions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_list_versions_workspace_list_version_uq" ON "saved_list_versions" USING btree ("workspace_id","list_id","definition_version");--> statement-breakpoint
CREATE INDEX "saved_list_versions_history_idx" ON "saved_list_versions" USING btree ("workspace_id","list_id","definition_version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_lists_owner_discovery_idx" ON "saved_lists" USING btree ("workspace_id","owner_membership_id","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_lists_workspace_discovery_idx" ON "saved_lists" USING btree ("workspace_id","visibility","lifecycle","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE FUNCTION custom_field_definition_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'custom_field_definition_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'draft' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'custom_field_definition_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.target_record_type<>OLD.target_record_type OR
     NEW.code<>OLD.code OR NEW.field_type<>OLD.field_type OR NEW.created_by_membership_id<>OLD.created_by_membership_id OR
     NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'custom_field_definition_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'custom_field_definition_version_invalid';
  END IF;
  IF NOT ((OLD.lifecycle='draft' AND NEW.lifecycle IN ('draft','active','archived')) OR
          (OLD.lifecycle='active' AND NEW.lifecycle IN ('active','archived')) OR
          (OLD.lifecycle='archived' AND NEW.lifecycle='archived')) THEN
    RAISE EXCEPTION 'custom_field_definition_transition_invalid';
  END IF;
  IF OLD.lifecycle='archived' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'custom_field_definition_archived_terminal';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER custom_field_definition_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON custom_field_definitions
FOR EACH ROW EXECUTE FUNCTION custom_field_definition_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION custom_field_option_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'custom_field_option_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'custom_field_option_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.definition_id<>OLD.definition_id OR
     NEW.code<>OLD.code OR NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'custom_field_option_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'custom_field_option_version_invalid';
  END IF;
  IF NOT ((OLD.lifecycle='active' AND NEW.lifecycle IN ('active','archived')) OR
          (OLD.lifecycle='archived' AND NEW.lifecycle='archived')) THEN
    RAISE EXCEPTION 'custom_field_option_transition_invalid';
  END IF;
  IF OLD.lifecycle='archived' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'custom_field_option_archived_terminal';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER custom_field_option_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON custom_field_options
FOR EACH ROW EXECUTE FUNCTION custom_field_option_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION custom_field_option_definition_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition_type text;
BEGIN
  SELECT field_type INTO definition_type FROM custom_field_definitions
  WHERE workspace_id=NEW.workspace_id AND id=NEW.definition_id;
  IF NOT FOUND OR definition_type NOT IN ('single_select','multi_select') THEN
    RAISE EXCEPTION 'custom_field_option_definition_invalid';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER custom_field_option_definition_pairing_v1
AFTER INSERT OR UPDATE ON custom_field_options DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION custom_field_option_definition_pairing_v1();
--> statement-breakpoint
CREATE FUNCTION custom_field_value_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'custom_field_value_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL OR
       NEW.redacted_at IS NOT NULL OR NEW.redacted_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'custom_field_value_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.definition_id<>OLD.definition_id OR
     NEW.target_record_type<>OLD.target_record_type OR NEW.target_record_id<>OLD.target_record_id OR
     NEW.field_type<>OLD.field_type OR NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'custom_field_value_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'custom_field_value_version_invalid';
  END IF;
  IF NOT ((OLD.lifecycle='active' AND NEW.lifecycle IN ('active','archived','redacted')) OR
          (OLD.lifecycle='archived' AND NEW.lifecycle IN ('archived','active','redacted')) OR
          (OLD.lifecycle='redacted' AND NEW.lifecycle='redacted')) THEN
    RAISE EXCEPTION 'custom_field_value_transition_invalid';
  END IF;
  IF OLD.lifecycle='redacted' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'custom_field_value_redacted_terminal';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER custom_field_value_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON custom_field_values
FOR EACH ROW EXECUTE FUNCTION custom_field_value_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION custom_field_value_definition_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition_target text; definition_type text; definition_lifecycle text;
BEGIN
  SELECT target_record_type,field_type,lifecycle INTO definition_target,definition_type,definition_lifecycle
  FROM custom_field_definitions WHERE workspace_id=NEW.workspace_id AND id=NEW.definition_id;
  IF NOT FOUND OR definition_target<>NEW.target_record_type OR definition_type<>NEW.field_type OR
     (NEW.lifecycle='active' AND definition_lifecycle<>'active') THEN
    RAISE EXCEPTION 'custom_field_value_definition_invalid';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER custom_field_value_definition_pairing_v1
AFTER INSERT OR UPDATE ON custom_field_values DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION custom_field_value_definition_pairing_v1();
--> statement-breakpoint
CREATE FUNCTION custom_field_value_options_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'custom_field_value_option_update_forbidden';
END $$;
--> statement-breakpoint
CREATE TRIGGER custom_field_value_options_enforce_v1 BEFORE UPDATE ON custom_field_value_options
FOR EACH ROW EXECUTE FUNCTION custom_field_value_options_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION custom_field_value_options_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace uuid; target_value uuid; value_type text; value_lifecycle text; option_count integer;
BEGIN
  IF TG_TABLE_NAME='custom_field_values' THEN
    target_workspace:=NEW.workspace_id; target_value:=NEW.id;
  ELSIF TG_OP='DELETE' THEN
    target_workspace:=OLD.workspace_id; target_value:=OLD.value_id;
  ELSE
    target_workspace:=NEW.workspace_id; target_value:=NEW.value_id;
  END IF;
  SELECT field_type,lifecycle INTO value_type,value_lifecycle FROM custom_field_values
  WHERE workspace_id=target_workspace AND id=target_value;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*)::integer INTO option_count FROM custom_field_value_options
  WHERE workspace_id=target_workspace AND value_id=target_value;
  IF value_lifecycle='redacted' AND option_count<>0 THEN
    RAISE EXCEPTION 'custom_field_value_redaction_links_remain';
  ELSIF value_lifecycle<>'redacted' AND value_type='single_select' AND option_count<>1 THEN
    RAISE EXCEPTION 'custom_field_single_select_cardinality_invalid';
  ELSIF value_lifecycle<>'redacted' AND value_type='multi_select' AND option_count NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'custom_field_multi_select_cardinality_invalid';
  ELSIF value_type NOT IN ('single_select','multi_select') AND option_count<>0 THEN
    RAISE EXCEPTION 'custom_field_scalar_option_link_invalid';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER custom_field_value_options_value_pairing_v1
AFTER INSERT OR UPDATE ON custom_field_values DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION custom_field_value_options_pairing_v1();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER custom_field_value_options_link_pairing_v1
AFTER INSERT OR UPDATE OR DELETE ON custom_field_value_options DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION custom_field_value_options_pairing_v1();
--> statement-breakpoint
CREATE FUNCTION customization_tag_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customization_tag_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'customization_tag_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.code<>OLD.code OR
     NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'customization_tag_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'customization_tag_version_invalid';
  END IF;
  IF NOT ((OLD.lifecycle='active' AND NEW.lifecycle IN ('active','archived')) OR
          (OLD.lifecycle='archived' AND NEW.lifecycle='archived')) THEN
    RAISE EXCEPTION 'customization_tag_transition_invalid';
  END IF;
  IF OLD.lifecycle='archived' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'customization_tag_archived_terminal';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customization_tag_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON customization_tags
FOR EACH ROW EXECUTE FUNCTION customization_tag_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION saved_lists_enforce_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'saved_list_delete_forbidden'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.lifecycle<>'active' OR NEW.version<>1 OR NEW.current_definition_version<>1 OR
       NEW.archived_at IS NOT NULL OR NEW.archived_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'saved_list_initial_state_invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.target_record_type<>OLD.target_record_type OR
     NEW.created_by_membership_id<>OLD.created_by_membership_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'saved_list_identity_immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW.governing_operation_id=OLD.governing_operation_id OR NEW.updated_at<OLD.updated_at OR
     NEW.current_definition_version NOT IN (OLD.current_definition_version,OLD.current_definition_version+1) THEN
    RAISE EXCEPTION 'saved_list_version_invalid';
  END IF;
  IF NOT ((OLD.lifecycle='active' AND NEW.lifecycle IN ('active','archived')) OR
          (OLD.lifecycle='archived' AND NEW.lifecycle='archived')) THEN
    RAISE EXCEPTION 'saved_list_transition_invalid';
  END IF;
  IF OLD.lifecycle='archived' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'saved_list_archived_terminal';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER saved_lists_enforce_v1 BEFORE INSERT OR UPDATE OR DELETE ON saved_lists
FOR EACH ROW EXECUTE FUNCTION saved_lists_enforce_v1();
--> statement-breakpoint
CREATE FUNCTION saved_list_filter_node_v1(node jsonb, node_depth integer, is_root boolean) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE node_kind text; node_operator text; node_field jsonb; node_value jsonb; child jsonb; count_nodes integer:=1;
DECLARE item jsonb; item_type text; first_type text;
BEGIN
  IF node_depth>4 OR jsonb_typeof(node)<>'object' OR NOT (node ? 'kind') THEN
    RAISE EXCEPTION 'saved_list_filter_node_invalid';
  END IF;
  node_kind:=node->>'kind';
  IF node_kind='all' THEN
    IF NOT is_root OR (node-ARRAY['kind'])<>'{}'::jsonb THEN RAISE EXCEPTION 'saved_list_filter_all_invalid'; END IF;
    RETURN 1;
  ELSIF node_kind='group' THEN
    IF NOT (node ?& ARRAY['kind','operator','children']) OR (node-ARRAY['kind','operator','children'])<>'{}'::jsonb OR
       node->>'operator' NOT IN ('and','or') OR jsonb_typeof(node->'children')<>'array' OR
       jsonb_array_length(node->'children') NOT BETWEEN 1 AND 10 THEN
      RAISE EXCEPTION 'saved_list_filter_group_invalid';
    END IF;
    FOR child IN SELECT value FROM jsonb_array_elements(node->'children') LOOP
      count_nodes:=count_nodes+saved_list_filter_node_v1(child,node_depth+1,false);
      IF count_nodes>25 THEN RAISE EXCEPTION 'saved_list_filter_nodes_exceeded'; END IF;
    END LOOP;
    RETURN count_nodes;
  ELSIF node_kind<>'predicate' THEN
    RAISE EXCEPTION 'saved_list_filter_kind_invalid';
  END IF;

  IF NOT (node ?& ARRAY['kind','field','operator']) THEN RAISE EXCEPTION 'saved_list_filter_predicate_invalid'; END IF;
  node_operator:=node->>'operator'; node_field:=node->'field';
  IF jsonb_typeof(node_field)<>'object' OR NOT (node_field ? 'source') THEN RAISE EXCEPTION 'saved_list_filter_field_invalid'; END IF;
  IF node_field->>'source'='system' THEN
    IF NOT (node_field ?& ARRAY['source','code']) OR (node_field-ARRAY['source','code'])<>'{}'::jsonb OR
       jsonb_typeof(node_field->'code')<>'string' OR node_field->>'code' !~ '^[a-z][a-z0-9_.]{0,63}$' OR
       node_field->>'code'<>btrim(node_field->>'code') THEN RAISE EXCEPTION 'saved_list_filter_system_field_invalid'; END IF;
  ELSIF node_field->>'source'='custom' THEN
    IF NOT (node_field ?& ARRAY['source','definitionId']) OR (node_field-ARRAY['source','definitionId'])<>'{}'::jsonb OR
       jsonb_typeof(node_field->'definitionId')<>'string' OR
       node_field->>'definitionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'saved_list_filter_custom_field_invalid';
    END IF;
  ELSIF node_field->>'source'='tags' THEN
    IF (node_field-ARRAY['source'])<>'{}'::jsonb THEN RAISE EXCEPTION 'saved_list_filter_tags_field_invalid'; END IF;
  ELSE RAISE EXCEPTION 'saved_list_filter_field_source_invalid'; END IF;

  IF node_operator IN ('is_empty','is_not_empty') THEN
    IF (node-ARRAY['kind','field','operator'])<>'{}'::jsonb THEN RAISE EXCEPTION 'saved_list_filter_no_value_invalid'; END IF;
    RETURN 1;
  END IF;
  IF NOT (node ? 'value') OR (node-ARRAY['kind','field','operator','value'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'saved_list_filter_value_shape_invalid';
  END IF;
  node_value:=node->'value';
  IF node_operator IN ('eq','neq','lt','lte','gt','gte','starts_with') THEN
    IF jsonb_typeof(node_value) NOT IN ('string','number','boolean') THEN RAISE EXCEPTION 'saved_list_filter_scalar_invalid'; END IF;
    IF jsonb_typeof(node_value)='string' AND (node_value#>>'{}'<>btrim(node_value#>>'{}') OR char_length(node_value#>>'{}') NOT BETWEEN 1 AND 500 OR node_value#>>'{}' ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'saved_list_filter_string_invalid';
    END IF;
  ELSIF node_operator='between' THEN
    IF jsonb_typeof(node_value)<>'array' OR jsonb_array_length(node_value)<>2 THEN RAISE EXCEPTION 'saved_list_filter_between_invalid'; END IF;
    first_type:=jsonb_typeof(node_value->0);
    IF first_type NOT IN ('string','number') OR jsonb_typeof(node_value->1)<>first_type THEN RAISE EXCEPTION 'saved_list_filter_between_types_invalid'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(node_value) LOOP
      IF jsonb_typeof(item)='string' AND
         (item#>>'{}'<>btrim(item#>>'{}') OR char_length(item#>>'{}') NOT BETWEEN 1 AND 500 OR item#>>'{}' ~ '[[:cntrl:]]') THEN
        RAISE EXCEPTION 'saved_list_filter_between_string_invalid';
      END IF;
    END LOOP;
  ELSIF node_operator IN ('any_of','none_of','all_of','has_any','has_none','has_all') THEN
    IF jsonb_typeof(node_value)<>'array' OR jsonb_array_length(node_value) NOT BETWEEN 1 AND 20 OR
       (SELECT count(*) FROM jsonb_array_elements(node_value))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(node_value)) THEN
      RAISE EXCEPTION 'saved_list_filter_set_invalid';
    END IF;
    first_type:=jsonb_typeof(node_value->0);
    FOR item IN SELECT value FROM jsonb_array_elements(node_value) LOOP
      item_type:=jsonb_typeof(item);
      IF item_type NOT IN ('string','number','boolean') OR item_type<>first_type OR
         (item_type='string' AND (item#>>'{}'<>btrim(item#>>'{}') OR char_length(item#>>'{}') NOT BETWEEN 1 AND 500 OR item#>>'{}' ~ '[[:cntrl:]]')) THEN
        RAISE EXCEPTION 'saved_list_filter_set_literal_invalid';
      END IF;
    END LOOP;
  ELSE RAISE EXCEPTION 'saved_list_filter_operator_invalid'; END IF;
  RETURN 1;
END $$;
--> statement-breakpoint
CREATE FUNCTION saved_list_filter_validate_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nodes integer;
BEGIN
  nodes:=saved_list_filter_node_v1(NEW.filter_ast,1,true);
  IF nodes>25 THEN RAISE EXCEPTION 'saved_list_filter_nodes_exceeded'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER saved_list_filter_validate_v1 BEFORE INSERT ON saved_list_versions
FOR EACH ROW EXECUTE FUNCTION saved_list_filter_validate_v1();
--> statement-breakpoint
CREATE FUNCTION saved_list_versions_append_only_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'saved_list_versions_append_only'; END $$;
--> statement-breakpoint
CREATE TRIGGER saved_list_versions_append_only_v1 BEFORE UPDATE OR DELETE ON saved_list_versions
FOR EACH ROW EXECUTE FUNCTION saved_list_versions_append_only_v1();
--> statement-breakpoint
CREATE FUNCTION saved_list_versions_pairing_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_workspace uuid; root_version integer; root_operation uuid;
BEGIN
  SELECT workspace_id,current_definition_version,governing_operation_id INTO root_workspace,root_version,root_operation
  FROM saved_lists WHERE workspace_id=NEW.workspace_id AND id=NEW.list_id;
  IF NOT FOUND OR root_workspace<>NEW.workspace_id OR root_version<>NEW.definition_version OR root_operation<>NEW.governing_operation_id THEN
    RAISE EXCEPTION 'saved_list_version_root_mismatch';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER saved_list_versions_pairing_v1
AFTER INSERT ON saved_list_versions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saved_list_versions_pairing_v1();
--> statement-breakpoint
CREATE FUNCTION saved_lists_require_current_version_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_operation uuid;
BEGIN
  SELECT governing_operation_id INTO version_operation FROM saved_list_versions
  WHERE workspace_id=NEW.workspace_id AND list_id=NEW.id AND definition_version=NEW.current_definition_version;
  IF NOT FOUND OR (TG_OP='INSERT' AND version_operation<>NEW.governing_operation_id) OR
     (TG_OP='UPDATE' AND NEW.current_definition_version<>OLD.current_definition_version AND version_operation<>NEW.governing_operation_id) THEN
    RAISE EXCEPTION 'saved_list_current_version_required';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER saved_lists_require_current_version_v1
AFTER INSERT OR UPDATE ON saved_lists DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saved_lists_require_current_version_v1();
