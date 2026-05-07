/**
 * Agent tool surface (spec section 6.3). Nine tools, each a server-side
 * function with a JSON schema. The orchestrator validates inputs and outputs.
 *
 * IMPORTANT: every tool that mutates writes a row in audit_log via writeAuditLog,
 * and the agent is only permitted to mutate Recommendation, ContactGoal (with
 * inferred_by_agent=true), and AgentRun (spec section 6.7).
 */
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import {
  contacts,
  contactClusters,
  clusters,
  contactGoals,
  goals,
  recommendations,
  touchpoints,
} from "@/lib/db/schema";
import { eq, and, sql, desc, lt, isNull, ne } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolContext = {
  userId: string;
  agentRunId: string;
};

export type ToolHandler<I, O> = {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
  toAnthropic(): Anthropic.Tool;
};

function tool<I, O>(
  cfg: Omit<ToolHandler<I, O>, "toAnthropic"> & { jsonSchema: object },
): ToolHandler<I, O> {
  return {
    ...cfg,
    toAnthropic() {
      return {
        name: cfg.name,
        description: cfg.description,
        input_schema: cfg.jsonSchema as Anthropic.Tool.InputSchema,
      };
    },
  };
}

// ---------- list_contacts ----------

export const listContactsTool = tool({
  name: "list_contacts",
  description:
    "Return paginated contacts with optional filters: cluster_id, tier, pulse_band, has_goal_link.",
  schema: z.object({
    cluster_id: z.string().uuid().optional(),
    tier: z.number().int().min(0).max(10).optional(),
    pulse_band: z.enum(["Healthy", "Steady", "Fading", "Dormant"]).optional(),
    has_goal_link: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      cluster_id: { type: "string" },
      tier: { type: "integer" },
      pulse_band: {
        type: "string",
        enum: ["Healthy", "Steady", "Fading", "Dormant"],
      },
      has_goal_link: { type: "boolean" },
      limit: { type: "integer", default: 25 },
    },
  },
  async execute(input, ctx) {
    const conds = [
      eq(contacts.userId, ctx.userId),
      sql`${contacts.deletedAt} is null`,
      ne(contacts.tier, 0),
    ];
    if (input.tier !== undefined) conds.push(eq(contacts.tier, input.tier));
    if (input.pulse_band) {
      conds.push(sql`${contacts.pulseBand} = ${input.pulse_band}::pulse_band`);
    }
    if (input.cluster_id) {
      conds.push(
        sql`exists (select 1 from contact_clusters cc where cc.contact_id = ${contacts.id} and cc.cluster_id = ${input.cluster_id})`,
      );
    }
    if (input.has_goal_link === true) {
      conds.push(
        sql`exists (select 1 from contact_goals cg where cg.contact_id = ${contacts.id})`,
      );
    } else if (input.has_goal_link === false) {
      conds.push(
        sql`not exists (select 1 from contact_goals cg where cg.contact_id = ${contacts.id})`,
      );
    }
    const rows = await adminDb
      .select({
        id: contacts.id,
        first_name: contacts.firstName,
        last_name: contacts.lastName,
        tier: contacts.tier,
        pulse_band: contacts.pulseBand,
        tie_strength: contacts.tieStrength,
        last_touchpoint_at: contacts.lastTouchpointAt,
        city: contacts.city,
        country: contacts.country,
        role_title: contacts.roleTitle,
        company: contacts.company,
        relationship_type: contacts.relationshipType,
        industry: contacts.industry,
        tags: contacts.tags,
      })
      .from(contacts)
      .where(and(...conds))
      .orderBy(desc(contacts.tieStrength))
      .limit(input.limit ?? 25);
    return rows;
  },
});

// ---------- get_contact_detail ----------

export const getContactDetailTool = tool({
  name: "get_contact_detail",
  description:
    "Full contact record plus the last 10 touchpoints, tie strength breakdown, and any linked goal ids.",
  schema: z.object({ contact_id: z.string().uuid() }),
  jsonSchema: {
    type: "object",
    properties: { contact_id: { type: "string" } },
    required: ["contact_id"],
  },
  async execute(input, ctx) {
    const [c] = await adminDb
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.contact_id),
          eq(contacts.userId, ctx.userId),
        ),
      );
    if (!c) return null;
    const tps = await adminDb
      .select()
      .from(touchpoints)
      .where(
        and(
          eq(touchpoints.contactId, c.id),
          isNull(touchpoints.deletedAt),
        ),
      )
      .orderBy(desc(touchpoints.occurredAt))
      .limit(10);
    const goalLinks = await adminDb
      .select({ goal_id: contactGoals.goalId })
      .from(contactGoals)
      .where(eq(contactGoals.contactId, c.id));
    return {
      contact: c,
      recent_touchpoints: tps,
      linked_goal_ids: goalLinks.map((g) => g.goal_id),
      tie_strength_breakdown: c.tieStrengthBreakdown,
    };
  },
});

// ---------- get_active_goals ----------

export const getActiveGoalsTool = tool({
  name: "get_active_goals",
  description: "All active goals with priority and why_this_matters.",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {} },
  async execute(_input, ctx) {
    return await adminDb
      .select({
        id: goals.id,
        title: goals.title,
        category: goals.category,
        horizon: goals.horizon,
        priority: goals.priority,
        status: goals.status,
        why_this_matters: goals.whyThisMatters,
        target_date: goals.targetDate,
        target_personas: goals.targetPersonas,
      })
      .from(goals)
      .where(
        and(
          eq(goals.userId, ctx.userId),
          eq(goals.status, "active"),
          sql`${goals.deletedAt} is null`,
        ),
      );
  },
});

// ---------- get_overdue_contacts ----------

export const getOverdueContactsTool = tool({
  name: "get_overdue_contacts",
  description:
    "Contacts where days_since_last_touchpoint > expected_cadence_days, ranked by overdue ratio.",
  schema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
  jsonSchema: {
    type: "object",
    properties: { limit: { type: "integer", default: 20 } },
  },
  async execute(input, ctx) {
    const rows = await adminDb.execute<{
      id: string;
      first_name: string;
      last_name: string | null;
      tier: number;
      pulse_band: string;
      tie_strength: number;
      days_since: number;
      cadence_days: number;
      overdue_ratio: number;
    }>(sql`
      with cluster_min as (
        select cc.contact_id, min(c.default_cadence_days) as cluster_cadence
        from contact_clusters cc
        join clusters c on c.id = cc.cluster_id
        group by cc.contact_id
      )
      select
        ct.id, ct.first_name, ct.last_name, ct.tier, ct.pulse_band, ct.tie_strength,
        coalesce(extract(epoch from (now() - ct.last_touchpoint_at)) / 86400.0, 9999) as days_since,
        coalesce(ct.expected_cadence_days, cm.cluster_cadence, 30) as cadence_days,
        coalesce(extract(epoch from (now() - ct.last_touchpoint_at)) / 86400.0, 9999) /
          nullif(coalesce(ct.expected_cadence_days, cm.cluster_cadence, 30), 0) as overdue_ratio
      from contacts ct
      left join cluster_min cm on cm.contact_id = ct.id
      where ct.user_id = ${ctx.userId}
        and ct.deleted_at is null
        and ct.tier > 0
        and (ct.last_touchpoint_at is null
             or extract(epoch from (now() - ct.last_touchpoint_at)) / 86400.0 >
                coalesce(ct.expected_cadence_days, cm.cluster_cadence, 30))
      order by overdue_ratio desc nulls first
      limit ${input.limit}
    `);
    return rows.rows;
  },
});

// ---------- search_contacts ----------

export const searchContactsTool = tool({
  name: "search_contacts",
  description:
    "Full text and structured search across name, role, company, industry, tags, notes.",
  schema: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "integer", default: 20 },
    },
    required: ["query"],
  },
  async execute(input, ctx) {
    const q = `%${input.query.toLowerCase()}%`;
    return await adminDb
      .select({
        id: contacts.id,
        first_name: contacts.firstName,
        last_name: contacts.lastName,
        role_title: contacts.roleTitle,
        company: contacts.company,
        industry: contacts.industry,
        city: contacts.city,
        tier: contacts.tier,
        pulse_band: contacts.pulseBand,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, ctx.userId),
          sql`${contacts.deletedAt} is null`,
          sql`(
            lower(${contacts.firstName}) like ${q}
            or lower(coalesce(${contacts.lastName}, '')) like ${q}
            or lower(coalesce(${contacts.company}, '')) like ${q}
            or lower(coalesce(${contacts.industry}, '')) like ${q}
            or lower(coalesce(${contacts.roleTitle}, '')) like ${q}
            or lower(coalesce(${contacts.notes}, '')) like ${q}
            or exists (select 1 from unnest(${contacts.tags}) t where lower(t) like ${q})
          )`,
        ),
      )
      .limit(input.limit ?? 25);
  },
});

// ---------- propose_re_engage ----------

const proposeReEngageSchema = z.object({
  contact_id: z.string().uuid(),
  rationale: z.string().min(10).max(400),
  linked_goal_ids: z.array(z.string().uuid()).default([]),
  priority_score: z.number().min(0).max(100),
});

export const proposeReEngageTool = tool({
  name: "propose_re_engage",
  description:
    "Persist a draft re_engage recommendation. Returns the recommendation id.",
  schema: proposeReEngageSchema,
  jsonSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string" },
      rationale: { type: "string" },
      linked_goal_ids: {
        type: "array",
        items: { type: "string" },
        default: [],
      },
      priority_score: { type: "number" },
    },
    required: ["contact_id", "rationale", "priority_score"],
  },
  async execute(input, ctx) {
    const [rec] = await adminDb
      .insert(recommendations)
      .values({
        userId: ctx.userId,
        kind: "re_engage",
        contactId: input.contact_id,
        rationale: input.rationale,
        linkedGoalIds: input.linked_goal_ids,
        priorityScore: String(input.priority_score),
        agentRunId: ctx.agentRunId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning({ id: recommendations.id });
    await writeAuditLog({
      userId: ctx.userId,
      actor: "agent",
      actorAgentRunId: ctx.agentRunId,
      action: "create",
      entityType: "recommendation",
      entityId: rec.id,
      after: { kind: "re_engage", contactId: input.contact_id },
    });
    return { id: rec.id };
  },
});

// ---------- propose_expand ----------

const proposeExpandSchema = z.object({
  persona_descriptor: z.object({
    role: z.string(),
    industry: z.string(),
    seniority: z.string().optional(),
    geography: z.string().nullable().optional(),
    attributes: z.array(z.string()).optional(),
    why: z.string(),
    goal_alignment: z.array(z.string().uuid()),
  }),
  rationale: z.string().min(10).max(400),
  priority_score: z.number().min(0).max(100),
});

export const proposeExpandTool = tool({
  name: "propose_expand",
  description: "Persist a draft expand recommendation with a persona descriptor.",
  schema: proposeExpandSchema,
  jsonSchema: {
    type: "object",
    properties: {
      persona_descriptor: {
        type: "object",
        properties: {
          role: { type: "string" },
          industry: { type: "string" },
          seniority: { type: "string" },
          geography: { type: ["string", "null"] },
          attributes: { type: "array", items: { type: "string" } },
          why: { type: "string" },
          goal_alignment: { type: "array", items: { type: "string" } },
        },
        required: ["role", "industry", "why", "goal_alignment"],
      },
      rationale: { type: "string" },
      priority_score: { type: "number" },
    },
    required: ["persona_descriptor", "rationale", "priority_score"],
  },
  async execute(input, ctx) {
    const [rec] = await adminDb
      .insert(recommendations)
      .values({
        userId: ctx.userId,
        kind: "expand",
        personaDescriptor: {
          role: input.persona_descriptor.role,
          industry: input.persona_descriptor.industry,
          seniority: input.persona_descriptor.seniority,
          geography: input.persona_descriptor.geography ?? null,
          attributes: input.persona_descriptor.attributes ?? [],
          why: input.persona_descriptor.why,
          goalAlignment: input.persona_descriptor.goal_alignment,
        },
        rationale: input.rationale,
        linkedGoalIds: input.persona_descriptor.goal_alignment,
        priorityScore: String(input.priority_score),
        agentRunId: ctx.agentRunId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning({ id: recommendations.id });
    await writeAuditLog({
      userId: ctx.userId,
      actor: "agent",
      actorAgentRunId: ctx.agentRunId,
      action: "create",
      entityType: "recommendation",
      entityId: rec.id,
      after: {
        kind: "expand",
        role: input.persona_descriptor.role,
      },
    });
    return { id: rec.id };
  },
});

// ---------- draft_outreach_message ----------

export const draftOutreachTool = tool({
  name: "draft_outreach_message",
  description:
    "Generate a short outreach message draft for a contact and an optional goal. Returns the draft text. Caller should persist it to recommendations.draft_outreach if appropriate.",
  schema: z.object({
    contact_id: z.string().uuid(),
    goal_id: z.string().uuid().optional(),
    context_note: z.string().optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string" },
      goal_id: { type: "string" },
      context_note: { type: "string" },
    },
    required: ["contact_id"],
  },
  async execute(input, ctx) {
    // The agent itself drafts the message — this tool returns the structured
    // context the model needs. The orchestrator may call the model recursively.
    const [c] = await adminDb
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, input.contact_id), eq(contacts.userId, ctx.userId)));
    if (!c) return null;
    const recent = await adminDb
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.contactId, c.id))
      .orderBy(desc(touchpoints.occurredAt))
      .limit(3);
    let goal = null;
    if (input.goal_id) {
      const [g] = await adminDb
        .select()
        .from(goals)
        .where(and(eq(goals.id, input.goal_id), eq(goals.userId, ctx.userId)));
      goal = g;
    }
    return { contact: c, recent_touchpoints: recent, goal, context_note: input.context_note };
  },
});

// ---------- link_contact_to_goal ----------

export const linkContactToGoalTool = tool({
  name: "link_contact_to_goal",
  description:
    "Add a contact_goals row marking the contact as relevant to a goal (inferred_by_agent=true).",
  schema: z.object({
    contact_id: z.string().uuid(),
    goal_id: z.string().uuid(),
    relevance_note: z.string().min(1).max(400),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string" },
      goal_id: { type: "string" },
      relevance_note: { type: "string" },
    },
    required: ["contact_id", "goal_id", "relevance_note"],
  },
  async execute(input, ctx) {
    await adminDb
      .insert(contactGoals)
      .values({
        userId: ctx.userId,
        contactId: input.contact_id,
        goalId: input.goal_id,
        relevanceNote: input.relevance_note,
        inferredByAgent: true,
      })
      .onConflictDoNothing();
    await writeAuditLog({
      userId: ctx.userId,
      actor: "agent",
      actorAgentRunId: ctx.agentRunId,
      action: "link",
      entityType: "contact_goal",
      entityId: input.contact_id,
      after: { goalId: input.goal_id },
    });
    return { ok: true };
  },
});

// ---------- registry ----------

export const ALL_TOOLS = [
  listContactsTool,
  getContactDetailTool,
  getActiveGoalsTool,
  getOverdueContactsTool,
  searchContactsTool,
  proposeReEngageTool,
  proposeExpandTool,
  draftOutreachTool,
  linkContactToGoalTool,
] as const;

export const TOOL_BY_NAME: Record<string, ToolHandler<unknown, unknown>> =
  Object.fromEntries(
    ALL_TOOLS.map((t) => [t.name, t as unknown as ToolHandler<unknown, unknown>]),
  );

// Quiet eslint: lt is imported but only used conditionally elsewhere
void lt;
