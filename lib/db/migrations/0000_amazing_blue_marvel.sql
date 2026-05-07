CREATE TYPE "public"."agent_run_kind" AS ENUM('daily_digest', 'on_demand_briefing', 'goal_refresh', 'scheduled_pulse_check');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."audit_actor" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'boolean', 'single_select', 'multi_select');--> statement-breakpoint
CREATE TYPE "public"."goal_horizon" AS ENUM('d30', 'd60', 'd90', 'm6', 'y1', 'y_multi');--> statement-breakpoint
CREATE TYPE "public"."goal_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'paused', 'achieved', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'in_app', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('digest', 'overdue_pulse', 'goal_milestone', 'system');--> statement-breakpoint
CREATE TYPE "public"."pulse_band" AS ENUM('Healthy', 'Steady', 'Fading', 'Dormant');--> statement-breakpoint
CREATE TYPE "public"."recommendation_feedback_action" AS ENUM('accepted', 'snoozed', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."recommendation_kind" AS ENUM('re_engage', 'expand');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('pending', 'accepted', 'snoozed', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_channel" AS ENUM('text', 'phone', 'video', 'in_person', 'email', 'social', 'voice_note', 'group_event');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_direction" AS ENUM('outbound', 'inbound', 'mutual');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_duration" AS ENUM('quick', 'normal', 'deep');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "agent_run_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"input_summary" jsonb DEFAULT '{}'::jsonb,
	"output_summary" jsonb DEFAULT '{}'::jsonb,
	"token_usage" jsonb,
	"error" text,
	"trace" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor" "audit_actor" NOT NULL,
	"actor_agent_run_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"default_cadence_days" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_clusters" (
	"contact_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_clusters_contact_id_cluster_id_pk" PRIMARY KEY("contact_id","cluster_id")
);
--> statement-breakpoint
CREATE TABLE "contact_goals" (
	"contact_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"relevance_note" text,
	"pinned_by_user" boolean DEFAULT false NOT NULL,
	"inferred_by_agent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_goals_contact_id_goal_id_pk" PRIMARY KEY("contact_id","goal_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" smallint DEFAULT 1 NOT NULL,
	"known_through_contact_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text,
	"preferred_name" text,
	"email" "citext",
	"phone" text,
	"photo_url" text,
	"city" text,
	"region" text,
	"country" text,
	"latitude" double precision,
	"longitude" double precision,
	"relationship_type" text,
	"industry" text,
	"role_title" text,
	"company" text,
	"how_we_met" text,
	"birthday" date,
	"social_handles" jsonb DEFAULT '{}'::jsonb,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"notes" text,
	"expected_cadence_days" integer,
	"tie_strength" integer DEFAULT 0 NOT NULL,
	"pulse_band" "pulse_band" DEFAULT 'Dormant' NOT NULL,
	"tie_strength_breakdown" jsonb,
	"last_touchpoint_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contacts_tier_known_through_check" CHECK (("contacts"."tier" < 2) OR ("contacts"."known_through_contact_id" IS NOT NULL)),
	CONSTRAINT "contacts_tier_range_check" CHECK ("contacts"."tier" >= 0 AND "contacts"."tier" <= 10),
	CONSTRAINT "contacts_tie_strength_range_check" CHECK ("contacts"."tie_strength" >= 0 AND "contacts"."tie_strength" <= 100)
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"custom_field_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"data_type" "custom_field_type" NOT NULL,
	"options" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"download_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"horizon" "goal_horizon" NOT NULL,
	"priority" "goal_priority" DEFAULT 'medium' NOT NULL,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"why_this_matters" text,
	"target_date" date,
	"target_personas" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"read_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_secret" text NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"action" "recommendation_feedback_action" NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "recommendation_kind" NOT NULL,
	"contact_id" uuid,
	"persona_descriptor" jsonb,
	"rationale" text NOT NULL,
	"linked_goal_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"priority_score" numeric(6, 3) DEFAULT '0' NOT NULL,
	"draft_outreach" text,
	"where_to_find" jsonb,
	"status" "recommendation_status" DEFAULT 'pending' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"agent_run_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "touchpoint_topic_tags" (
	"touchpoint_id" uuid NOT NULL,
	"topic_tag_id" uuid NOT NULL,
	CONSTRAINT "touchpoint_topic_tags_touchpoint_id_topic_tag_id_pk" PRIMARY KEY("touchpoint_id","topic_tag_id")
);
--> statement-breakpoint
CREATE TABLE "touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"channel" "touchpoint_channel" NOT NULL,
	"direction" "touchpoint_direction" DEFAULT 'outbound' NOT NULL,
	"duration_bucket" "touchpoint_duration" DEFAULT 'normal' NOT NULL,
	"quality_rating" smallint,
	"note" text,
	"group_event_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "touchpoints_quality_check" CHECK ("touchpoints"."quality_rating" IS NULL OR ("touchpoints"."quality_rating" >= 1 AND "touchpoints"."quality_rating" <= 5))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"self_contact_id" uuid,
	"notification_prefs" jsonb DEFAULT '{"push":true,"in_app":true,"email":false,"quiet_hours":null,"digest_enabled":true}'::jsonb NOT NULL,
	"plan_tier" text DEFAULT 'free' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("actor_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_messages" ADD CONSTRAINT "briefing_messages_session_id_briefing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."briefing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_messages" ADD CONSTRAINT "briefing_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_messages" ADD CONSTRAINT "briefing_messages_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_sessions" ADD CONSTRAINT "briefing_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_clusters" ADD CONSTRAINT "contact_clusters_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_clusters" ADD CONSTRAINT "contact_clusters_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_clusters" ADD CONSTRAINT "contact_clusters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_goals" ADD CONSTRAINT "contact_goals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_goals" ADD CONSTRAINT "contact_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_goals" ADD CONSTRAINT "contact_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_tags" ADD CONSTRAINT "topic_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoint_topic_tags" ADD CONSTRAINT "touchpoint_topic_tags_touchpoint_id_touchpoints_id_fk" FOREIGN KEY ("touchpoint_id") REFERENCES "public"."touchpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoint_topic_tags" ADD CONSTRAINT "touchpoint_topic_tags_topic_tag_id_topic_tags_id_fk" FOREIGN KEY ("topic_tag_id") REFERENCES "public"."topic_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "briefing_messages_session_idx" ON "briefing_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "briefing_sessions_user_idx" ON "briefing_sessions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "clusters_user_idx" ON "clusters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contact_clusters_user_idx" ON "contact_clusters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contact_goals_user_idx" ON "contact_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contacts_user_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contacts_tier_idx" ON "contacts" USING btree ("user_id","tier");--> statement-breakpoint
CREATE INDEX "contacts_pulse_idx" ON "contacts" USING btree ("user_id","pulse_band");--> statement-breakpoint
CREATE INDEX "contacts_last_touchpoint_idx" ON "contacts" USING btree ("user_id","last_touchpoint_at");--> statement-breakpoint
CREATE INDEX "contacts_known_through_idx" ON "contacts" USING btree ("known_through_contact_id");--> statement-breakpoint
CREATE INDEX "custom_field_values_contact_idx" ON "custom_field_values" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_unique_idx" ON "custom_field_values" USING btree ("contact_id","custom_field_id");--> statement-breakpoint
CREATE INDEX "custom_fields_user_idx" ON "custom_fields" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_user_name_idx" ON "custom_fields" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_rec_idx" ON "recommendation_feedback" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "recommendations_user_status_idx" ON "recommendations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "recommendations_user_kind_idx" ON "recommendations" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "recommendations_contact_idx" ON "recommendations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "topic_tags_user_idx" ON "topic_tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_tags_user_name_idx" ON "topic_tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "touchpoints_contact_idx" ON "touchpoints" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "touchpoints_user_occurred_idx" ON "touchpoints" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "touchpoints_group_idx" ON "touchpoints" USING btree ("group_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");