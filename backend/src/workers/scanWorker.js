// src/workers/scanWorker.js
import { Worker } from "bullmq";
import { runMigrations } from "../config/db.js";
import { redisConnection } from "../config/redis.js";
import { scanPath, scanRepo, scanImage, scanSecrets, scanRepoSecrets, compareScans } from "../services/trivyService.js";
import { saveScan } from "../services/historyService.js";
import { scanQueue } from "../queue/scanQueue.js";
import fs from "fs/promises";

await runMigrations();

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2");

const worker = new Worker(
  "scan",
  async (job) => {
    const { type } = job.data;
    console.log(`[worker] Processing job ${job.id} — type: ${type}`);

    const ignoreFile = job.data.ignoreFilePath || null;

    // ── file ──────────────────────────────────────────────────────────────
    if (type === "file") {
      const { filePath } = job.data;
      const result = await scanPath(filePath, { ignoreFile });
      await saveScan({ jobId: job.id, type, target: job.data.originalName || filePath, result });
      await fs.rm(filePath, { force: true }); // cleanup DEPOIS do scan
      if (ignoreFile) await fs.rm(ignoreFile, { force: true });
      return { ...result, score: await getScore(result) };
    }

    // ── repo ──────────────────────────────────────────────────────────────
    if (type === "repo") {
      const { repoUrl } = job.data;
      try {
        const result = await scanRepo(repoUrl, { ignoreFile });
        await saveScan({ jobId: job.id, type, target: repoUrl, result });
        return { ...result, score: await getScore(result) };
      } finally {
        if (ignoreFile) await fs.rm(ignoreFile, { force: true });
      }
    }

    // ── image ─────────────────────────────────────────────────────────────
    if (type === "image") {
      const { imageName } = job.data;
      try {
        const result = await scanImage(imageName, { ignoreFile });
        await saveScan({ jobId: job.id, type, target: imageName, result });
        return { ...result, score: await getScore(result) };
      } finally {
        if (ignoreFile) await fs.rm(ignoreFile, { force: true });
      }
    }

    // ── secrets (file) ────────────────────────────────────────────────────
    if (type === "secrets-file") {
      const { filePath, originalName } = job.data;
      try {
        const result = await scanSecrets(filePath, { ignoreFile });
        await saveScan({ jobId: job.id, type: "secrets", target: originalName || filePath, result });
        return { ...result, score: await getScore(result) };
      } finally {
        await fs.rm(filePath, { force: true });
        if (ignoreFile) await fs.rm(ignoreFile, { force: true });
      }
    }

    // ── secrets (repo) ────────────────────────────────────────────────────
    if (type === "secrets-repo") {
      const { repoUrl } = job.data;
      try {
        const result = await scanRepoSecrets(repoUrl, { ignoreFile });
        await saveScan({ jobId: job.id, type: "secrets", target: repoUrl, result });
        return { ...result, score: await getScore(result) };
      } finally {
        if (ignoreFile) await fs.rm(ignoreFile, { force: true });
      }
    }

    // ── compare ───────────────────────────────────────────────────────────
    if (type === "compare") {
      const { beforeJobId, afterJobId } = job.data;
      const [beforeJob, afterJob] = await Promise.all([
        scanQueue.getJob(beforeJobId),
        scanQueue.getJob(afterJobId),
      ]);
      if (!beforeJob || !afterJob) throw new Error("One or both jobs not found");
      const [bs, as_] = await Promise.all([beforeJob.getState(), afterJob.getState()]);
      if (bs !== "completed") throw new Error(`Before job not completed (${bs})`);
      if (as_ !== "completed") throw new Error(`After job not completed (${as_})`);
      return compareScans(beforeJob.returnvalue, afterJob.returnvalue);
    }

    throw new Error(`Unknown job type: ${type}`);
  },
  { connection: redisConnection, concurrency: CONCURRENCY }
);

async function getScore(result) {
  const { calculateScore } = await import("../services/scoreService.js");
  return calculateScore(result.summary);
}

worker.on("completed", (job) => console.log(`[worker] Job ${job.id} completed`));
worker.on("failed",    (job, err) => console.error(`[worker] Job ${job?.id} failed:`, err.message));
worker.on("error",     (err) => console.error("[worker] Worker error:", err));

console.log(`[worker] Started with concurrency ${CONCURRENCY}`);