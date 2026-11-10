import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { evaluate, spentThisMonthCents, type ActionKind } from "@/lib/policy";
import { newId, now, type Store } from "@/lib/store";
import type { Agent, RoleId } from "@/lib/types";
import { scoreOpportunity } from "@/lib/scoring";
import { ROLES } from "./roles";

export interface ToolContext {
  store: Store;
  agent: Agent;
  /** How deep in the delegation chain this agent is (CEO = 0). */
  depth: number;
  /** Runs another agent; injected to avoid a circular import with the runtime. */
  runAgent: (agent: Agent, instruction: string, depth: number) => Promise<string>;
}

export const MAX_DELEGATION_DEPTH = 1;

async function gate(ctx: ToolContext, kind: ActionKind, amountCents = 0) {
  const [settings, ledger] = await Promise.all([ctx.store.settings(), ctx.store.list("ledger")]);
  return evaluate({ kind, amountCents }, settings, spentThisMonthCents(ledger));
}

/** Wraps an internal (non-gated) write so the kill switch stops it. */
async function internal(ctx: ToolContext, action: string, fn: () => Promise<string>): Promise<string> {
  const d = await gate(ctx, "internal");
  if (d.decision === "deny") return `Refused: ${d.reason}`;
  const result = await fn();
  await ctx.store.audit(ctx.agent.name, action, result.slice(0, 500));
  return result;
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function buildTools(ctx: ToolContext) {
  const { store } = ctx;

  const all = {
    list_state: betaZodTool({
      name: "list_state",
      description: "Get the current state of the business: projects, top opportunities, agents, pending approvals, budget.",
      inputSchema: z.object({}),
      run: async () => {
        const [projects, opps, agents, approvals, settings, ledger] = await Promise.all([
          store.list("projects"),
          store.list("opportunities"),
          store.list("agents"),
          store.list("approvals"),
          store.settings(),
          store.list("ledger"),
        ]);
        const spent = spentThisMonthCents(ledger);
        return JSON.stringify(
          {
            ownerGoals: settings.ownerGoals,
            budget: { monthly: usd(settings.monthlyBudgetCents), spentThisMonth: usd(spent), perActionLimit: usd(settings.perActionLimitCents) },
            killSwitch: settings.killSwitch,
            projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, goal: p.goal })),
            opportunities: opps
              .filter((o) => o.status === "proposed")
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
              .map((o) => ({ id: o.id, title: o.title, score: o.score, risk: o.risk })),
            agents: agents.filter((a) => a.status === "active").map((a) => ({ id: a.id, name: a.name, role: a.role })),
            pendingApprovals: approvals.filter((a) => a.status === "pending").map((a) => ({ id: a.id, kind: a.kind, summary: a.summary })),
          },
          null,
          2,
        );
      },
    }),

    save_knowledge: betaZodTool({
      name: "save_knowledge",
      description: "Save a finding, decision or lesson to the shared knowledge base so every agent can use it.",
      inputSchema: z.object({ topic: z.string(), content: z.string() }),
      run: (i) =>
        internal(ctx, "save_knowledge", async () => {
          await store.insert("knowledge", { id: newId("kb"), topic: i.topic, content: i.content, agentId: ctx.agent.id, createdAt: now() });
          return `Saved under "${i.topic}".`;
        }),
    }),

    search_knowledge: betaZodTool({
      name: "search_knowledge",
      description: "Search the shared knowledge base by keyword.",
      inputSchema: z.object({ query: z.string() }),
      run: async ({ query }) => {
        const q = query.toLowerCase();
        const hits = (await store.list("knowledge"))
          .filter((k) => `${k.topic} ${k.content}`.toLowerCase().includes(q))
          .slice(0, 8);
        return hits.length ? hits.map((k) => `## ${k.topic}\n${k.content}`).join("\n\n") : "Nothing saved on that yet.";
      },
    }),

    record_opportunity: betaZodTool({
      name: "record_opportunity",
      description: "Record a business opportunity with honest estimates. The platform scores it by risk-adjusted return.",
      inputSchema: z.object({
        title: z.string(),
        summary: z.string().describe("The customer problem, the offer, and evidence, with sources"),
        market: z.string(),
        startupCostUsd: z.number().min(0),
        monthlyRevenueUsd: z.number().min(0).describe("Realistic monthly revenue after 6 months"),
        risk: z.number().int().min(1).max(5).describe("1 = low risk, 5 = very high"),
      }),
      run: (i) =>
        internal(ctx, "record_opportunity", async () => {
          const startupCostCents = Math.round(i.startupCostUsd * 100);
          const monthlyRevenueEstimateCents = Math.round(i.monthlyRevenueUsd * 100);
          const score = scoreOpportunity({ startupCostCents, monthlyRevenueEstimateCents, risk: i.risk });
          const o = await store.insert("opportunities", {
            id: newId("opp"),
            title: i.title,
            summary: i.summary,
            market: i.market,
            startupCostCents,
            monthlyRevenueEstimateCents,
            risk: i.risk,
            score,
            status: "proposed",
            createdBy: ctx.agent.id,
            createdAt: now(),
          });
          return `Recorded opportunity ${o.id} with score ${score}.`;
        }),
    }),

    select_opportunity: betaZodTool({
      name: "select_opportunity",
      description: "Mark an opportunity as selected (to pursue) or rejected.",
      inputSchema: z.object({ opportunityId: z.string(), decision: z.enum(["selected", "rejected"]) }),
      run: (i) =>
        internal(ctx, "select_opportunity", async () => {
          await store.update("opportunities", i.opportunityId, { status: i.decision });
          return `Opportunity ${i.opportunityId} ${i.decision}.`;
        }),
    }),

    create_project: betaZodTool({
      name: "create_project",
      description: "Create a project to pursue a goal. Projects start with no budget; spending needs approval.",
      inputSchema: z.object({ name: z.string(), goal: z.string(), opportunityId: z.string().optional() }),
      run: (i) =>
        internal(ctx, "create_project", async () => {
          const p = await store.insert("projects", {
            id: newId("prj"),
            name: i.name,
            goal: i.goal,
            opportunityId: i.opportunityId ?? null,
            status: "planning",
            budgetCents: 0,
            createdAt: now(),
          });
          return `Created project ${p.id}.`;
        }),
    }),

    update_project: betaZodTool({
      name: "update_project",
      description: "Change a project's status.",
      inputSchema: z.object({ projectId: z.string(), status: z.enum(["planning", "active", "paused", "done"]) }),
      run: (i) =>
        internal(ctx, "update_project", async () => {
          await store.update("projects", i.projectId, { status: i.status });
          return `Project ${i.projectId} is now ${i.status}.`;
        }),
    }),

    create_agent: betaZodTool({
      name: "create_agent",
      description:
        "Hire a new agent. Use a standard role, or 'custom' with a specific mission when a needed skill is missing from the team.",
      inputSchema: z.object({
        role: z.enum(Object.keys(ROLES).filter((r) => r !== "ceo").concat("custom") as [string, ...string[]]),
        name: z.string(),
        mission: z.string().describe("Responsibilities and the measurable objective for this agent"),
      }),
      run: (i) =>
        internal(ctx, "create_agent", async () => {
          const a = await store.insert("agents", {
            id: newId("agt"),
            role: i.role as RoleId,
            name: i.name,
            mission: i.mission,
            parentId: ctx.agent.id,
            status: "active",
            createdAt: now(),
          });
          return `Hired ${a.name} (${a.id}).`;
        }),
    }),

    delegate: betaZodTool({
      name: "delegate",
      description:
        "Give a specialist agent a task and get its report back. Pass an existing agentId from list_state, or a role to use that role's standing agent.",
      inputSchema: z.object({
        agentId: z.string().optional(),
        role: z.string().optional(),
        instruction: z.string().describe("What to do, the expected output, and any constraints"),
        projectId: z.string().optional(),
      }),
      run: async (i) => {
        if (ctx.depth >= MAX_DELEGATION_DEPTH) return "Refused: specialists cannot delegate further. Do the work yourself.";
        const d = await gate(ctx, "internal");
        if (d.decision === "deny") return `Refused: ${d.reason}`;
        const agents = (await store.list("agents")).filter((a) => a.status === "active");
        const target = i.agentId ? agents.find((a) => a.id === i.agentId) : agents.find((a) => a.role === i.role);
        if (!target) return "No such agent. Call list_state for ids, or create_agent first.";
        const task = await store.insert("tasks", {
          id: newId("tsk"),
          projectId: i.projectId ?? null,
          agentId: target.id,
          description: i.instruction,
          status: "running",
          result: null,
          createdAt: now(),
        });
        try {
          const result = await ctx.runAgent(target, i.instruction, ctx.depth + 1);
          await store.update("tasks", task.id, { status: "done", result });
          return `${target.name} reports:\n${result}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await store.update("tasks", task.id, { status: "failed", result: msg });
          return `${target.name} failed: ${msg}`;
        }
      },
    }),

    request_approval: betaZodTool({
      name: "request_approval",
      description:
        "Ask the owner to approve an action that spends money, contacts someone outside, publishes, deploys or signs an agreement. The action does not happen unless approved.",
      inputSchema: z.object({
        kind: z.enum(["spend", "outreach", "deploy", "contract", "publish"]),
        summary: z.string().describe("One line: what will happen"),
        detail: z.string().describe("Full details: recipients, message text, vendor, terms, and why"),
        amountUsd: z.number().min(0).default(0),
        projectId: z.string().optional(),
      }),
      run: async (i) => {
        const amountCents = Math.round(i.amountUsd * 100);
        const d = await gate(ctx, i.kind, amountCents);
        if (d.decision === "deny") {
          await store.audit(ctx.agent.name, "approval_denied_by_policy", `${i.summary}: ${d.reason}`);
          return `Refused by policy: ${d.reason}`;
        }
        const a = await store.insert("approvals", {
          id: newId("apr"),
          kind: i.kind,
          summary: i.summary,
          detail: i.detail,
          amountCents,
          projectId: i.projectId ?? null,
          requestedBy: ctx.agent.id,
          status: "pending",
          createdAt: now(),
          decidedAt: null,
        });
        await store.audit(ctx.agent.name, "approval_requested", i.summary);
        return `Approval ${a.id} is waiting for the owner. Do not act on it until it is approved.`;
      },
    }),

    add_content_idea: betaZodTool({
      name: "add_content_idea",
      description: "Add a question to the owner's content gap list in the Content Studio.",
      inputSchema: z.object({ question: z.string(), source: z.string() }),
      run: (i) =>
        internal(ctx, "add_content_idea", async () => {
          const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
          const owner = ownerEmail ? await store.userByEmail(ownerEmail) : null;
          if (!owner) return "The owner has no account yet, so the idea was not saved.";
          await store.insert("contentIdeas", {
            id: newId("idea"),
            userId: owner.id,
            question: i.question,
            source: i.source,
            asks: 1,
            status: "open",
            createdAt: now(),
          });
          return "Added to the content gap list.";
        }),
    }),
  };

  return all;
}

export type ToolName = keyof ReturnType<typeof buildTools>;
