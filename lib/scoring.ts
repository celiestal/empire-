/**
 * Risk-adjusted first-year return, in dollars, divided by risk (1 to 5).
 * Deterministic so the model cannot inflate its own scores.
 */
export function scoreOpportunity(o: { startupCostCents: number; monthlyRevenueEstimateCents: number; risk: number }): number {
  const firstYear = (o.monthlyRevenueEstimateCents * 12 - o.startupCostCents) / 100;
  const risk = Math.min(5, Math.max(1, Math.round(o.risk)));
  return Math.round(firstYear / risk);
}
