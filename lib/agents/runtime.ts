import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, FALLBACK, MODEL } from "@/lib/ai";
import { newId, now, type Store } from "@/lib/store";
import type { Agent } from "@/lib/types";
import { GUARDRAILS, ROLES, SPECIALIST_ROLES } from "./roles";
import { buildTools, type ToolName } from "./tools";

const CUSTOM_TOOLS: ToolName[] = ["list_state", "save_knowledge", "search_knowledge", "request_approval"];

function roleFor(agent: Agent) {
  return agent.role === "custom" ? null : ROLES[agent.role];
}

function systemPrompt(agent: Agent): string {
  return `You are ${agent.name}, an AI agent in an AI-run business.

Your mission: ${agent.mission}

${GUARDRAILS}

Work through the task with your tools, then finish with a short report: what you did, what you found, and what you recommend next.`;
}

/** Runs one agent on one instruction until it finishes or hits the turn limit. */
export async function runAgent(store: Store, agent: Agent, instruction: string, depth = 0): Promise<string> {
  const role = roleFor(agent);
  const allowed = new Set<string>(role ? role.tools : CUSTOM_TOOLS);
  const all = buildTools({
    store,
    agent,
    depth,
    runAgent: (a, i, d) => runAgent(store, a, i, d),
  });
  const tools: Anthropic.Beta.BetaToolUnion[] = Object.entries(all)
    .filter(([name]) => allowed.has(name))
    .map(([, t]) => t);
  if (role?.webSearch ?? agent.role === "custom") {
    tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });
  }

  const final = await anthropic().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: depth === 0 ? 16 : 10,
    ...FALLBACK,
    betas: [...FALLBACK.betas],
    output_config: { effort: depth === 0 ? "high" : "medium" },
    system: systemPrompt(agent),
    tools: tools as never,
    messages: [{ role: "user", content: instruction }],
  });

  if (final.stop_reason === "refusal") return "The model declined this task.";
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || "(no report)";
}

/** Makes sure the CEO and one agent per specialist role exist. */
export async function ensureWorkforce(store: Store): Promise<Agent> {
  const agents = await store.list("agents");
  let ceo = agents.find((a) => a.role === "ceo" && a.status === "active");
  if (!ceo) {
    ceo = await store.insert("agents", {
      id: newId("agt"),
      role: "ceo",
      name: ROLES.ceo.name,
      mission: ROLES.ceo.mission,
      parentId: null,
      status: "active",
      createdAt: now(),
    });
  }
  for (const r of SPECIALIST_ROLES) {
    if (!agents.some((a) => a.role === r.id && a.status === "active")) {
      await store.insert("agents", {
        id: newId("agt"),
        role: r.id,
        name: r.name,
        mission: r.mission,
        parentId: ceo.id,
        status: "active",
        createdAt: now(),
      });
    }
  }
  return ceo;
}

/**
 * One autonomous cycle: the CEO reviews the business, delegates work and records
 * decisions. Gated actions it wants come out as approval requests for the owner.
 */
export async function runCeoCycle(store: Store, note?: string): Promise<{ report: string; refused?: string }> {
  const settings = await store.settings();
  if (settings.killSwitch) return { report: "", refused: "The kill switch is on, so the cycle did not run." };

  const ceo = await ensureWorkforce(store);
  await store.audit("system", "cycle_started", note ?? "scheduled");
  const instruction = `Run this cycle of the business.

1. Call list_state to see where things stand.
2. If there are fewer than 3 good opportunities, have research agents find and record more.
3. Pick the best opportunity to pursue if none is active, and create a project for it.
4. Move each active project forward one concrete step by delegating to the right specialist.
5. For anything that needs money, outreach, publishing or deploying, file request_approval with full details.
6. Save the key decisions to the knowledge base.
${note ? `\nThe owner adds: ${note}` : ""}`;

  const report = await runAgent(store, ceo, instruction, 0);
  await store.audit(ceo.name, "cycle_report", report.slice(0, 2000));
  return { report };
}
