// src/services/trivyService.js
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import os from "os";

const execFileAsync = promisify(execFile);

/**
 * Run Trivy config scan on a local file or directory.
 * Optionally accepts an ignorefile path.
 */
export async function scanPath(targetPath, { ignoreFile } = {}) {
  const absTarget = path.resolve(targetPath); // <- adicionar isso
  const args = [
    "config",
    "--format", "json",
    "--exit-code", "0",
    "--quiet",
    "--file-patterns", "dockerfile:.*",
  ];

  if (ignoreFile) args.push("--ignorefile", path.resolve(ignoreFile));

  args.push(absTarget); // <- usar absTarget
  return runTrivy(args);
}

/**
 * Scan a Docker image by name (e.g. nginx:latest).
 * Uses trivy image with vuln + misconfig scanners.
 */
export async function scanImage(imageName, { ignoreFile } = {}) {
  const args = [
    "image",
    "--format", "json",
    "--exit-code", "0",
    "--quiet",
    "--scanners", "vuln,misconfig",
  ];

  if (ignoreFile) args.push("--ignorefile", path.resolve(ignoreFile));

  args.push(imageName);

  const raw = await runTrivy(args, { timeout: 300_000 }); // 5 min for image pulls
  return normalizeImageOutput(raw._raw);
}

/**
 * Clone a git repo into a temp dir and scan it.
 */
export async function scanRepo(repoUrl, { ignoreFile } = {}) {
  const execF = promisify(execFile);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moirai-repo-"));

  try {
    await execF("git", ["clone", "--depth", "1", repoUrl, tmpDir], {
      timeout: 60_000,
    });

    return await scanPath(tmpDir, { ignoreFile });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Scan for secrets in a local file, directory, or repo.
 */
export async function scanSecrets(targetPath, { ignoreFile } = {}) {
  const absTarget = path.resolve(targetPath);
  const args = [
    "fs",
    "--format", "json",
    "--exit-code", "0",
    "--quiet",
    "--scanners", "secret",
  ];

  if (ignoreFile) args.push("--ignorefile", path.resolve(ignoreFile));

  args.push(absTarget);
  return runTrivy(args, { timeout: 300_000 });
}

/**
 * Scan a repo for secrets (clone + scanSecrets).
 */
export async function scanRepoSecrets(repoUrl, { ignoreFile } = {}) {
  const execF = promisify(execFile);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moirai-secrets-"));

  try {
    await execF("git", ["clone", "--depth", "1", repoUrl, tmpDir], { timeout: 60_000 });
    return await scanSecrets(tmpDir, { ignoreFile });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Compare two scan results — returns new, fixed, and persisted findings.
 */
export function compareScans(before, after) {
  const beforeIds = new Set(before.findings.map((f) => `${f.id}:${f.file}`));
  const afterIds  = new Set(after.findings.map((f)  => `${f.id}:${f.file}`));

  const newFindings      = after.findings.filter((f) => !beforeIds.has(`${f.id}:${f.file}`));
  const fixedFindings    = before.findings.filter((f) => !afterIds.has(`${f.id}:${f.file}`));
  const persistedFindings = after.findings.filter((f) => beforeIds.has(`${f.id}:${f.file}`));

  return {
    summary: {
      before: before.summary,
      after: after.summary,
      new: newFindings.length,
      fixed: fixedFindings.length,
      persisted: persistedFindings.length,
    },
    new: newFindings,
    fixed: fixedFindings,
    persisted: persistedFindings,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function runTrivy(args, { timeout = 120_000 } = {}) {
  try {
    const { stdout } = await execFileAsync("trivy", args, { timeout });
    const parsed = JSON.parse(stdout || "{}");
    parsed._raw = parsed;
    return normalizeTrivyOutput(parsed);
  } catch (err) {
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        parsed._raw = parsed;
        return normalizeTrivyOutput(parsed);
      } catch { /* fall through */ }
    }
    throw new Error(`Trivy scan failed: ${err.message}`);
  }
}

function normalizeTrivyOutput(raw) {
  const results = raw.Results || [];

  const findings = results.flatMap((r) => {
    const misconfigs = (r.Misconfigurations || []).map((m) => ({
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
      causeMetadata: m.CauseMetadata || null,
    }));

    const secrets = (r.Secrets || []).map((s) => ({
      file: r.Target,
      type: "secret",
      id: s.RuleID,
      title: s.Title,
      severity: s.Severity || "CRITICAL",
      description: `Secret encontrado: ${s.Category}`,
      message: `Linha ${s.StartLine}–${s.EndLine}: ${s.Match ? s.Match.replace(/./g, "•") : "(redacted)"}`,
      resolution: "Remova o secret do código. Use variáveis de ambiente ou um secret manager.",
      references: [],
      status: "",
    }));

    return [...misconfigs, ...secrets];
  });

  return buildResult(findings);
}

function normalizeImageOutput(raw) {
  const results = raw.Results || [];

  const findings = results.flatMap((r) => {
    const vulns = (r.Vulnerabilities || []).map((v) => ({
      file: r.Target,
      type: "vulnerability",
      id: v.VulnerabilityID,
      title: v.Title || v.VulnerabilityID,
      severity: v.Severity,
      description: v.Description,
      message: `${v.PkgName} ${v.InstalledVersion} → fix: ${v.FixedVersion || "no fix available"}`,
      resolution: v.FixedVersion ? `Atualize para a versão ${v.FixedVersion}` : "Sem correção disponível",
      references: v.References || [],
      status: v.Status || "",
    }));

    const misconfigs = (r.Misconfigurations || []).map((m) => ({
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

    return [...vulns, ...misconfigs];
  });

  return buildResult(findings);
}

function buildResult(findings) {
  const summary = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "CRITICAL").length,
    high:     findings.filter((f) => f.severity === "HIGH").length,
    medium:   findings.filter((f) => f.severity === "MEDIUM").length,
    low:      findings.filter((f) => f.severity === "LOW").length,
    unknown:  findings.filter((f) => f.severity === "UNKNOWN").length,
  };

  return { summary, findings };
}