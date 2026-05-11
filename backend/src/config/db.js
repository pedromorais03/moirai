// src/config/db.js
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || "localhost",
  port:     parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB       || "moirai",
  user:     process.env.POSTGRES_USER     || "moirai",
  password: process.env.POSTGRES_PASSWORD || "moirai",
});

/**
 * Run on startup — creates tables if they don't exist.
 */
export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scans (
      id          SERIAL PRIMARY KEY,
      job_id      TEXT NOT NULL UNIQUE,
      type        TEXT NOT NULL,           -- file | repo | image
      target      TEXT NOT NULL,           -- filename, repoUrl, imageName
      score       INTEGER NOT NULL,
      summary     JSONB NOT NULL,
      findings    JSONB NOT NULL,
      scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_scans_target     ON scans (target);
    CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans (scanned_at DESC);
  `);

  console.log("[db] Migrations OK");
}