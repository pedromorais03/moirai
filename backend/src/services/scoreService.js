// src/services/scoreService.js

const WEIGHTS = { CRITICAL: 10, HIGH: 5, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const MAX_PENALTY = 100;

/**
 * Calculate a security score 0–100.
 * Starts at 100 and subtracts weighted penalties.
 * Score never goes below 0.
 */
export function calculateScore(summary) {
  const penalty =
    (summary.critical ?? 0) * WEIGHTS.CRITICAL +
    (summary.high     ?? 0) * WEIGHTS.HIGH     +
    (summary.medium   ?? 0) * WEIGHTS.MEDIUM   +
    (summary.low      ?? 0) * WEIGHTS.LOW;

  return Math.max(0, MAX_PENALTY - penalty);
}

/**
 * Return a label and color for a given score.
 */
export function scoreLabel(score) {
  if (score >= 90) return { label: "Excelente", color: "#30d158" };
  if (score >= 70) return { label: "Bom",       color: "#34c759" };
  if (score >= 50) return { label: "Regular",   color: "#ffd60a" };
  if (score >= 25) return { label: "Ruim",      color: "#ff6b35" };
  return                   { label: "Crítico",  color: "#ff2d55" };
}