import type { GatedActionKind, LedgerEntry, Settings } from "@/lib/types";

/**
 * The policy gate. Every action an agent takes is classified here before it runs.
 *
 * - "internal" actions (research, notes, planning records) run on their own.
 * - "gated" actions (spending money, contacting people, deploying, signing,
 *   publishing) never run on their own: they become an approval request that the
 *   owner accepts or rejects on the dashboard.
 * - The kill switch refuses everything except reading.
 */

export type ActionKind = "read" | "internal" | GatedActionKind;

export const GATED_KINDS: readonly GatedActionKind[] = [
  "spend",
  "outreach",
  "deploy",
  "contract",
  "publish",
] as const;

export type PolicyDecision =
  | { decision: "allow" }
  | { decision: "require_approval"; reason: string }
  | { decision: "deny"; reason: string };

export function isGated(kind: ActionKind): kind is GatedActionKind {
  return (GATED_KINDS as readonly string[]).includes(kind);
}

/** Money spent (negative ledger entries) since the first of the current UTC month. */
export function spentThisMonthCents(ledger: LedgerEntry[], at: Date = new Date()): number {
  const monthStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
  return ledger
    .filter((e) => e.amountCents < 0 && Date.parse(e.createdAt) >= monthStart)
    .reduce((sum, e) => sum - e.amountCents, 0);
}

export function evaluate(
  action: { kind: ActionKind; amountCents?: number },
  settings: Settings,
  spentThisMonth: number,
): PolicyDecision {
  if (action.kind === "read") return { decision: "allow" };

  if (settings.killSwitch) {
    return { decision: "deny", reason: "The kill switch is on. Agents can only read until it is turned off." };
  }

  if (action.kind === "internal") return { decision: "allow" };

  const amount = Math.max(0, action.amountCents ?? 0);
  if (amount > 0) {
    if (amount > settings.perActionLimitCents) {
      return {
        decision: "deny",
        reason: `Costs ${fmt(amount)}, above the per-action limit of ${fmt(settings.perActionLimitCents)}.`,
      };
    }
    const remaining = settings.monthlyBudgetCents - spentThisMonth;
    if (amount > remaining) {
      return {
        decision: "deny",
        reason: `Costs ${fmt(amount)}, but only ${fmt(Math.max(0, remaining))} is left in this month's budget.`,
      };
    }
  }

  return { decision: "require_approval", reason: `${action.kind} actions always need the owner's approval.` };
}

export function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
