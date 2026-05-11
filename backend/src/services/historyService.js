// src/services/historyService.js
import { pool } from "../config/db.js";
import { calculateScore } from "./scoreService.js";

/**
 * Persist a completed scan result.
 */
export async function saveScan({ jobId, type, target, result }) {
  const score = calculateScore(result.summary);

  await pool.query(
    `INSERT INTO scans (job_id, type, target, score, summary, findings)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (job_id) DO NOTHING`,
    [jobId, type, target, score, JSON.stringify(result.summary), JSON.stringify(result.findings)]
  );

  return score;
}

/**
 * List all scans, most recent first.
 * Returns lightweight rows (no findings array).
 */
export async function listScans({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, job_id, type, target, score, summary, scanned_at
     FROM scans
     ORDER BY scanned_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

/**
 * Get scan history for a specific target (evolution over time).
 */
export async function getTargetHistory(target, { limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, job_id, type, target, score, summary, scanned_at
     FROM scans
     WHERE target = $1
     ORDER BY scanned_at DESC
     LIMIT $2`,
    [target, limit]
  );
  return rows;
}

/**
 * Get a single scan with full findings by jobId.
 */
export async function getScanByJobId(jobId) {
  const { rows } = await pool.query(
    `SELECT * FROM scans WHERE job_id = $1`,
    [jobId]
  );
  return rows[0] || null;
}