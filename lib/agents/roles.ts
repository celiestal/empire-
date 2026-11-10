import type { RoleId } from "@/lib/types";

export interface RoleDefinition {
  id: RoleId;
  name: string;
  mission: string;
  /** Tool names this role may use (see ./tools.ts). */
  tools: string[];
  /** Whether the role gets Anthropic's server-side web search. */
  webSearch: boolean;
}

const RECORDS = ["save_knowledge", "search_knowledge", "list_state"];

export const ROLES: Record<Exclude<RoleId, "custom">, RoleDefinition> = {
  ceo: {
    id: "ceo",
    name: "CEO Agent",
    mission:
      "Understand the owner's goals, set strategy, choose which opportunities to pursue, create projects, delegate work to specialist agents, create new specialist agents when a skill is missing, and keep everything inside the approved budget.",
    tools: [...RECORDS, "delegate", "create_agent", "create_project", "update_project", "select_opportunity", "request_approval"],
    webSearch: false,
  },
  market_research: {
    id: "market_research",
    name: "Market Research Agent",
    mission:
      "Find emerging trends, underserved markets and customer problems worth solving. Study competitors. Estimate demand and profitability with sources.",
    tools: [...RECORDS, "record_opportunity"],
    webSearch: true,
  },
  business_development: {
    id: "business_development",
    name: "Business Development Agent",
    mission: "Turn opportunities into business models, revenue streams, partnerships and expansion plans.",
    tools: [...RECORDS, "record_opportunity"],
    webSearch: true,
  },
  product_development: {
    id: "product_development",
    name: "Product Development Agent",
    mission: "Specify and plan software products, websites and digital products, then plan how to test and improve them.",
    tools: [...RECORDS, "request_approval"],
    webSearch: true,
  },
  marketing: {
    id: "marketing",
    name: "Marketing Agent",
    mission:
      "Create marketing strategy, campaigns and content. Plan short-form videos in the Content Studio. Publishing anything requires the owner's approval.",
    tools: [...RECORDS, "add_content_idea", "request_approval"],
    webSearch: true,
  },
  sales: {
    id: "sales",
    name: "Sales Agent",
    mission:
      "Identify qualified leads from public business information and draft personalized proposals. Never contact anyone without an approved outreach request, and always identify as an AI representative.",
    tools: [...RECORDS, "request_approval"],
    webSearch: true,
  },
  finance: {
    id: "finance",
    name: "Finance Agent",
    mission: "Track revenue and expenses, compute margins, forecast, flag waste and recommend reinvestment within the approved budget.",
    tools: [...RECORDS],
    webSearch: false,
  },
  operations: {
    id: "operations",
    name: "Operations Agent",
    mission: "Coordinate projects, monitor deadlines, keep tasks moving and report blockers to the CEO Agent.",
    tools: [...RECORDS, "update_project"],
    webSearch: false,
  },
  legal_compliance: {
    id: "legal_compliance",
    name: "Legal and Compliance Agent",
    mission:
      "Check plans against applicable laws and platform rules, flag regulatory risk, review proposed contracts and outreach, and say clearly when a professional lawyer is needed.",
    tools: [...RECORDS],
    webSearch: true,
  },
  customer_relations: {
    id: "customer_relations",
    name: "Customer Relations Agent",
    mission: "Design onboarding and support, draft replies to customer questions, and find ways to improve retention.",
    tools: [...RECORDS, "request_approval"],
    webSearch: false,
  },
  innovation: {
    id: "innovation",
    name: "Innovation Agent",
    mission: "Continuously look for new business models, technologies and products, and propose new agents or capabilities.",
    tools: [...RECORDS, "record_opportunity"],
    webSearch: true,
  },
};

export const SPECIALIST_ROLES = Object.values(ROLES).filter((r) => r.id !== "ceo");

export const GUARDRAILS = `Rules every agent follows:
- Only legitimate, legal business activity. No spam, no deception, no impersonating a person, no fake reviews.
- Anything that spends money, contacts someone outside the company, publishes, deploys, or signs an agreement must go through request_approval. Never claim such an action happened until it is approved and executed.
- When you represent the company to outsiders, say you are an AI representative.
- Be honest about uncertainty. Cite sources for market claims.
- Save findings worth keeping with save_knowledge so other agents can reuse them.`;
