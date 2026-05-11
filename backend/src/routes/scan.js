// src/routes/scan.js
import { scanQueue } from "../queue/scanQueue.js";
import { fileURLToPath } from "url";
import { listScans, getTargetHistory, getScanByJobId } from "../services/historyService.js";
import path from "path";
import fs from "fs/promises";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(__dirname, "../../uploads");

export async function scanRoutes(fastify) {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  async function saveField(field, prefix) {
    const filename = `${prefix}-${Date.now()}-${field.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    await pipeline(field.file, createWriteStream(filePath));
    return { filePath, originalName: field.filename };
  }

  // ── POST /scan/file ────────────────────────────────────────────────────
fastify.post("/file", async (request, reply) => {
  const data = await request.file();

  if (!data) return reply.status(400).send({ error: "No file provided" });

  const filename = `scan-${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  console.log("[api] Saving file to:", filePath);
  await pipeline(data.file, createWriteStream(filePath));
  console.log("[api] File saved, size:", (await fs.stat(filePath)).size);

  const job = await scanQueue.add("scan-file", {
    type: "file",
    filePath,
    originalName: data.filename,
    ignoreFilePath: null,
  });

  return reply.status(202).send({ jobId: job.id });
});

  // ── POST /scan/repo ────────────────────────────────────────────────────
  fastify.post("/repo", async (request, reply) => {
    const parts = request.parts();
    let repoUrl = null, ignoreFilePath = null;
    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "repoUrl") repoUrl = part.value.trim();
      if (part.type === "file"  && part.fieldname === "ignoreFile") { ({ filePath: ignoreFilePath } = await saveField(part, "ignore")); }
    }
    if (!repoUrl) return reply.status(400).send({ error: "repoUrl is required" });
    const job = await scanQueue.add("scan-repo", { type: "repo", repoUrl, ignoreFilePath });
    return reply.status(202).send({ jobId: job.id });
  });

  // ── POST /scan/image ───────────────────────────────────────────────────
  fastify.post("/image", async (request, reply) => {
    const parts = request.parts();
    let imageName = null, ignoreFilePath = null;
    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "imageName") imageName = part.value;
      if (part.type === "file"  && part.fieldname === "ignoreFile") { ({ filePath: ignoreFilePath } = await saveField(part, "ignore")); }
    }
    if (!imageName) return reply.status(400).send({ error: "imageName is required" });
    const job = await scanQueue.add("scan-image", { type: "image", imageName, ignoreFilePath });
    return reply.status(202).send({ jobId: job.id });
  });

  // ── POST /scan/secrets/file ────────────────────────────────────────────
  fastify.post("/secrets/file", async (request, reply) => {
    const parts = request.files();
    let filePath = null, ignoreFilePath = null, originalName = null;
    for await (const part of parts) {
      if (part.fieldname === "file")       { ({ filePath, originalName } = await saveField(part, "secrets")); }
      if (part.fieldname === "ignoreFile") { ({ filePath: ignoreFilePath } = await saveField(part, "ignore")); }
    }
    if (!filePath) return reply.status(400).send({ error: "No file provided" });
    const job = await scanQueue.add("scan-secrets-file", { type: "secrets-file", filePath, ignoreFilePath, originalName });
    return reply.status(202).send({ jobId: job.id });
  });

  // ── POST /scan/secrets/repo ────────────────────────────────────────────
  fastify.post("/secrets/repo", async (request, reply) => {
    const parts = request.parts();
    let repoUrl = null, ignoreFilePath = null;
    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "repoUrl") repoUrl = part.value;
      if (part.type === "file"  && part.fieldname === "ignoreFile") { ({ filePath: ignoreFilePath } = await saveField(part, "ignore")); }
    }
    if (!repoUrl) return reply.status(400).send({ error: "repoUrl is required" });
    const job = await scanQueue.add("scan-secrets-repo", { type: "secrets-repo", repoUrl, ignoreFilePath });
    return reply.status(202).send({ jobId: job.id });
  });

  // ── POST /scan/compare ─────────────────────────────────────────────────
  fastify.post("/compare", {
    schema: { body: { type:"object", required:["beforeJobId","afterJobId"], properties:{ beforeJobId:{type:"string"}, afterJobId:{type:"string"} } } }
  }, async (request, reply) => {
    const { beforeJobId, afterJobId } = request.body;
    const job = await scanQueue.add("compare", { type: "compare", beforeJobId, afterJobId });
    return reply.status(202).send({ jobId: job.id });
  });

  // ── GET /scan/:jobId ───────────────────────────────────────────────────
  fastify.get("/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const job = await scanQueue.getJob(jobId);
    if (!job) return reply.status(404).send({ error: "Job not found" });
    const state = await job.getState();
    if (state === "completed") return reply.send({ jobId, status: "completed", result: job.returnvalue });
    if (state === "failed")    return reply.send({ jobId, status: "failed",    error: job.failedReason });
    return reply.send({ jobId, status: state });
  });

  // ── GET /scan/history ──────────────────────────────────────────────────
  fastify.get("/history", async (request, reply) => {
    const limit = parseInt(request.query.limit || "50");
    const scans = await listScans({ limit });
    return reply.send({ scans });
  });

  // ── GET /scan/history/:target ──────────────────────────────────────────
  fastify.get("/history/target", async (request, reply) => {
    const { target } = request.query;
    if (!target) return reply.status(400).send({ error: "target query param required" });
    const scans = await getTargetHistory(target);
    return reply.send({ target, scans });
  });
}