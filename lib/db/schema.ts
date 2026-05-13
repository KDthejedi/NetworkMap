/**
 * Network Map. Drizzle schema covering spec section 4 in full.
 *
 * Conventions:
 *  - All tables have id (uuid), created_at, updated_at; soft delete via deleted_at where noted.
 *  - All user owned tables carry user_id for RLS isolation (spec section 11.3).
 *  - snake_case column names; camelCase TS bindings.
 */
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  numeric,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// citext for case-insensitive emails (spec section 4.2 / 4.3).
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// ---------- enums ----------

export const touchpointChannel = pgEnum("touchpoint_channel", [
  "text",
  "phone",
  "video",
  "in_person",
  "email",
  "social",
  "voice_note",
  "group_event",
]);

export const touchpointDirection = pgEnum("touchpoint_direction", [
  "outbound",
  "inbound",
  "mutual",
]);

export const touchpointDuration = pgEnum("touchpoint_duration", [
  "quick",
  "normal",
  "deep",
]);

export const goalHorizon = pgEnum("goal_horizon", [
  "d30",
  "d60",
  "d90",
  "m6",
  "y1",
  "y_multi",
]);

export const goalPriority = pgEnum("goal_priority", ["high", "medium", "low"]);

export const goalStatus = pgEnum("goal_status", [
  "active",
  "paused",
  "achieved",
  "abandoned",
]);

export const recommendationKind = pgEnum("recommendation_kind", [
  "re_engage",
  "expand",
]);

export const recommendationStatus = pgEnum("recommendation_status", [
  "pending",
  "accepted",
  "snoozed",
  "dismissed",
  "completed",
]);

export const agentRunKind = pgEnum("agent_run_kind", [
  "daily_digest",
  "on_demand_briefing",
  "goal_refresh",
  "scheduled_pulse_check",
]);

export const agentRunStatus = pgEnum("agent_run_status", [
  "running",
  "succeeded",
  "failed",
]);

export const notificationKind = pgEnum("notification_kind", [
  "digest",
  "overdue_pulse",
  "goal_milestone",
  "system",
]);

export const notificationChannel = pgEnum("notification_channel", [
  "push",
  "in_app",
  "email",
]);

export const customFieldType = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "boolean",
  "single_select",
  "multi_select",
]);

export const auditActor = pgEnum("audit_actor", ["user", "agent"]);

export const pulseBand = pgEnum("pulse_band", [
  "Healthy",
  "Steady",
  "Fading",
  "Dormant",
]);

export const recommendationFeedbackAction = pgEnum(
  "recommendation_feedback_action",
  ["accepted", "snoozed", "dismissed", "completed"],
);

export const contactAlignment = pgEnum("contact_alignment", [
  "personal",
  "professional",
  "both",
]);

export const ageCohort = pgEnum("age_cohort", [
  "under_20",
  "20s",
  "30s",
  "40s",
  "50s",
  "60s",
  "70_plus",
]);

// ---------- users ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en-US"),
    selfContactId: uuid("self_contact_id"),
    notificationPrefs: jsonb("notification_prefs")
      .$type<{
        push: boolean;
        in_app: boolean;
        email: boolean;
        quiet_hours?: { start: string; end: string } | null;
        digest_enabled: boolean;
      }>()
      .notNull()
      .default(
        sql`'{"push":true,"in_app":true,"email":false,"quiet_hours":null,"digest_enabled":true}'::jsonb`,
      ),
    planTier: text("plan_tier").notNull().default("free"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

// ---------- clusters ----------

export const clusters = pgTable(
  "clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    icon: text("icon").notNull(),
    defaultCadenceDays: integer("default_cadence_days").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isSystem: boolean("is_system").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("clusters_user_idx").on(t.userId),
  }),
);

// ---------- contacts ----------

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: smallint("tier").notNull().default(1),
    knownThroughContactId: uuid("known_through_contact_id"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    preferredName: text("preferred_name"),
    email: citext("email"),
    phone: text("phone"),
    photoUrl: text("photo_url"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    relationshipType: text("relationship_type"),
    industry: text("industry"),
    roleTitle: text("role_title"),
    company: text("company"),
    howWeMet: text("how_we_met"),
    birthday: date("birthday"),
    socialHandles: jsonb("social_handles")
      .$type<{
        linkedin?: string;
        x?: string;
        instagram?: string;
        github?: string;
        [key: string]: string | undefined;
      }>()
      .default(sql`'{}'::jsonb`),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    notes: text("notes"),
    expectedCadenceDays: integer("expected_cadence_days"),
    alignment: contactAlignment("alignment"),
    /**
     * Demographic + attribute fields used for diversity / robustness analysis.
     * race_or_ethnicity and gender are sensitive: spec section 11.2 calls for
     * field-level encryption. The columns are jsonb so we can replace plaintext
     * with an envelope-encrypted ciphertext payload later without a migration.
     * Until KMS is wired, the value is just { value: string } in plaintext and
     * the code path is centralized in lib/demographics/.
     */
    raceOrEthnicity: jsonb("race_or_ethnicity").$type<{ value: string } | null>(),
    gender: jsonb("gender").$type<{ value: string } | null>(),
    ageCohort: ageCohort("age_cohort"),
    education: text("education"),
    languages: text("languages").array().notNull().default(sql`ARRAY[]::text[]`),
    professionalAffiliations: text("professional_affiliations")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    tieStrength: integer("tie_strength").notNull().default(0),
    pulseBand: pulseBand("pulse_band").notNull().default("Dormant"),
    tieStrengthBreakdown: jsonb("tie_strength_breakdown")
      .$type<{
        topContributions: Array<{
          touchpointId: string;
          contribution: number;
          channel: string;
          occurredAt: string;
        }>;
        cadenceDays: number;
        goalBoostApplied: boolean;
        computedAt: string;
      } | null>(),
    lastTouchpointAt: timestamp("last_touchpoint_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("contacts_user_idx").on(t.userId),
    tierIdx: index("contacts_tier_idx").on(t.userId, t.tier),
    pulseIdx: index("contacts_pulse_idx").on(t.userId, t.pulseBand),
    lastTouchpointIdx: index("contacts_last_touchpoint_idx").on(
      t.userId,
      t.lastTouchpointAt,
    ),
    knownThroughIdx: index("contacts_known_through_idx").on(
      t.knownThroughContactId,
    ),
    tierKnownThroughCheck: check(
      "contacts_tier_known_through_check",
      sql`(${t.tier} < 2) OR (${t.knownThroughContactId} IS NOT NULL)`,
    ),
    tierRangeCheck: check(
      "contacts_tier_range_check",
      sql`${t.tier} >= 0 AND ${t.tier} <= 10`,
    ),
    tieStrengthRangeCheck: check(
      "contacts_tie_strength_range_check",
      sql`${t.tieStrength} >= 0 AND ${t.tieStrength} <= 100`,
    ),
  }),
);

// ---------- contact-cluster join ----------

export const contactClusters = pgTable(
  "contact_clusters",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => clusters.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.clusterId] }),
    userIdx: index("contact_clusters_user_idx").on(t.userId),
  }),
);

// ---------- custom fields ----------

export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dataType: customFieldType("data_type").notNull(),
    options: jsonb("options").$type<string[] | null>(),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("custom_fields_user_idx").on(t.userId),
    uniqueName: uniqueIndex("custom_fields_user_name_idx").on(t.userId, t.name),
  }),
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    customFieldId: uuid("custom_field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    value: jsonb("value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    contactIdx: index("custom_field_values_contact_idx").on(t.contactId),
    uniquePerField: uniqueIndex("custom_field_values_unique_idx").on(
      t.contactId,
      t.customFieldId,
    ),
  }),
);

// ---------- topic tags ----------

export const topicTags = pgTable(
  "topic_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("topic_tags_user_idx").on(t.userId),
    uniqueName: uniqueIndex("topic_tags_user_name_idx").on(t.userId, t.name),
  }),
);

// ---------- touchpoints ----------

export const touchpoints = pgTable(
  "touchpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    channel: touchpointChannel("channel").notNull(),
    direction: touchpointDirection("direction").notNull().default("outbound"),
    durationBucket: touchpointDuration("duration_bucket")
      .notNull()
      .default("normal"),
    qualityRating: smallint("quality_rating"),
    note: text("note"),
    groupEventId: uuid("group_event_id"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    contactIdx: index("touchpoints_contact_idx").on(t.contactId),
    userOccurredIdx: index("touchpoints_user_occurred_idx").on(
      t.userId,
      t.occurredAt,
    ),
    groupIdx: index("touchpoints_group_idx").on(t.groupEventId),
    qualityCheck: check(
      "touchpoints_quality_check",
      sql`${t.qualityRating} IS NULL OR (${t.qualityRating} >= 1 AND ${t.qualityRating} <= 5)`,
    ),
  }),
);

export const touchpointTopicTags = pgTable(
  "touchpoint_topic_tags",
  {
    touchpointId: uuid("touchpoint_id")
      .notNull()
      .references(() => touchpoints.id, { onDelete: "cascade" }),
    topicTagId: uuid("topic_tag_id")
      .notNull()
      .references(() => topicTags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.touchpointId, t.topicTagId] }),
  }),
);

// ---------- goals ----------

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    horizon: goalHorizon("horizon").notNull(),
    priority: goalPriority("priority").notNull().default("medium"),
    status: goalStatus("status").notNull().default("active"),
    whyThisMatters: text("why_this_matters"),
    targetDate: date("target_date"),
    targetPersonas: jsonb("target_personas")
      .$type<
        Array<{
          role: string;
          industry: string;
          seniority?: string;
          geography?: string | null;
          attributes?: string[];
          why?: string;
        }>
      >()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("goals_user_idx").on(t.userId),
    statusIdx: index("goals_status_idx").on(t.userId, t.status),
  }),
);

export const contactGoals = pgTable(
  "contact_goals",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relevanceNote: text("relevance_note"),
    pinnedByUser: boolean("pinned_by_user").notNull().default(false),
    inferredByAgent: boolean("inferred_by_agent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.goalId] }),
    userIdx: index("contact_goals_user_idx").on(t.userId),
  }),
);

// ---------- agent runs and recommendations ----------

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: agentRunKind("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: agentRunStatus("status").notNull().default("running"),
    inputSummary: jsonb("input_summary").default(sql`'{}'::jsonb`),
    outputSummary: jsonb("output_summary").default(sql`'{}'::jsonb`),
    tokenUsage: jsonb("token_usage").$type<{
      input?: number;
      output?: number;
      cache_read?: number;
    } | null>(),
    error: text("error"),
    trace: jsonb("trace").$type<
      Array<{
        kind: "user" | "assistant" | "tool_use" | "tool_result";
        content: unknown;
        at: string;
      }>
    >().default(sql`'[]'::jsonb`),
  },
  (t) => ({
    userIdx: index("agent_runs_user_idx").on(t.userId, t.startedAt),
  }),
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: recommendationKind("kind").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    personaDescriptor: jsonb("persona_descriptor").$type<{
      role: string;
      industry: string;
      seniority?: string;
      geography?: string | null;
      attributes?: string[];
      why: string;
      goalAlignment: string[];
    } | null>(),
    rationale: text("rationale").notNull(),
    linkedGoalIds: uuid("linked_goal_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    priorityScore: numeric("priority_score", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    draftOutreach: text("draft_outreach"),
    whereToFind: jsonb("where_to_find").$type<{
      venues?: string[];
      linkedinSearches?: string[];
      warmPath?: { contactId: string; rationale: string } | null;
    } | null>(),
    status: recommendationStatus("status").notNull().default("pending"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("recommendations_user_status_idx").on(
      t.userId,
      t.status,
    ),
    userKindIdx: index("recommendations_user_kind_idx").on(t.userId, t.kind),
    contactIdx: index("recommendations_contact_idx").on(t.contactId),
  }),
);

export const recommendationFeedback = pgTable(
  "recommendation_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    action: recommendationFeedbackAction("action").notNull(),
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    recIdx: index("recommendation_feedback_rec_idx").on(t.recommendationId),
  }),
);

// ---------- notifications ----------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload").$type<{
      deepLink?: string;
      [key: string]: unknown;
    }>().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    channel: notificationChannel("channel").notNull().default("in_app"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId, t.createdAt),
    unreadIdx: index("notifications_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  }),
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    authSecret: text("auth_secret").notNull(),
    platform: text("platform").notNull().default("web"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueEndpoint: uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    userIdx: index("push_subscriptions_user_idx").on(t.userId),
  }),
);

// ---------- audit log ----------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actor: auditActor("actor").notNull(),
    actorAgentRunId: uuid("actor_agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("audit_log_user_idx").on(t.userId, t.occurredAt),
    entityIdx: index("audit_log_entity_idx").on(t.entityType, t.entityId),
  }),
);

// ---------- briefing chat sessions ----------

export const briefingSessions = pgTable(
  "briefing_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("briefing_sessions_user_idx").on(t.userId, t.updatedAt),
  }),
);

export const briefingMessages = pgTable(
  "briefing_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => briefingSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionIdx: index("briefing_messages_session_idx").on(
      t.sessionId,
      t.createdAt,
    ),
  }),
);

// ---------- export jobs ----------

export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  status: text("status").notNull().default("pending"),
  downloadUrl: text("download_url"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ---------- relations (for ergonomics; not strictly required for the schema) ----------

export const usersRelations = relations(users, ({ many, one }) => ({
  contacts: many(contacts),
  clusters: many(clusters),
  goals: many(goals),
  selfContact: one(contacts, {
    fields: [users.selfContactId],
    references: [contacts.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ many, one }) => ({
  user: one(users, { fields: [contacts.userId], references: [users.id] }),
  knownThrough: one(contacts, {
    fields: [contacts.knownThroughContactId],
    references: [contacts.id],
  }),
  clusters: many(contactClusters),
  touchpoints: many(touchpoints),
  goals: many(contactGoals),
  customFieldValues: many(customFieldValues),
}));

export const touchpointsRelations = relations(touchpoints, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [touchpoints.contactId],
    references: [contacts.id],
  }),
  topicTags: many(touchpointTopicTags),
}));

export const goalsRelations = relations(goals, ({ many }) => ({
  contacts: many(contactGoals),
}));

// ---------- type exports ----------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Cluster = typeof clusters.$inferSelect;
export type NewCluster = typeof clusters.$inferInsert;
export type Touchpoint = typeof touchpoints.$inferSelect;
export type NewTouchpoint = typeof touchpoints.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Recommendation = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type PulseBand = (typeof pulseBand.enumValues)[number];
export type TouchpointChannel = (typeof touchpointChannel.enumValues)[number];
export type TouchpointDirection = (typeof touchpointDirection.enumValues)[number];
export type TouchpointDuration = (typeof touchpointDuration.enumValues)[number];
export type GoalStatus = (typeof goalStatus.enumValues)[number];
export type GoalPriority = (typeof goalPriority.enumValues)[number];
