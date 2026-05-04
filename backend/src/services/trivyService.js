// src/services/trivyService.js
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import os from "os";

const execFileAsync = promisify(execFile);

export async function scanPath(targetPath) {
  const args = [
  "config",
  "--format", "json",
  "--exit-code", "0",
  "--quiet",
  "--file-patterns", "dockerfile:.*",
  targetPath,
];

  try {
    const { stdout } = await execFileAsync("trivy", args, {
      timeout: 120_000,
    });

    const parsed = JSON.parse(stdout || "{}");
    return normalizeTrivyOutput(parsed);
  } catch (err) {
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        return normalizeTrivyOutput(parsed);
      } catch {
        // fall through
      }
    }
    throw new Error(`Trivy scan failed: ${err.message}`);
  }
}

export async function scanRepo(repoUrl) {
  const { execFile: execFileRaw } = await import("child_process");
  const execF = promisify(execFileRaw);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moirai-repo-"));

  try {
    await execF("git", ["clone", "--depth", "1", repoUrl, tmpDir], {
      timeout: 60_000,
    });

    const result = await scanPath(tmpDir);
    return result;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function normalizeTrivyOutput(raw) {
  const results = raw.Results || [];

  const findings = results.flatMap((r) => {
    const misconfigs = r.Misconfigurations || [];
    return misconfigs.map((m) => ({
      file: r.Target,
      type: r.Type,
      id: m.ID,
      title: m.Title,
      severity: m.Severity,
      description: m.Description,
      message: m.Message,
      resolution: m.Resolution,
      references: m.References || [],
      status: m.Status,
    }));
  });

  const summary = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "CRITICAL").length,
    high: findings.filter((f) => f.severity === "HIGH").length,
    medium: findings.filter((f) => f.severity === "MEDIUM").length,
    low: findings.filter((f) => f.severity === "LOW").length,
    unknown: findings.filter((f) => f.severity === "UNKNOWN").length,
  };

  return { summary, findings };
}