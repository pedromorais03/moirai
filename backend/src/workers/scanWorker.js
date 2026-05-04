// src/workers/scanWorker.js
import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { scanPath, scanRepo } from "../services/trivyService.js";
import fs from "fs/promises";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2");

const worker = new Worker(
  "scan",
  async (job) => {
    const { type } = job.data;

    console.log(`[worker] Processing job ${job.id} — type: ${type}`);

    if (type === "file") {
      const { filePath } = job.data;

      try {
        const result = await scanPath(filePath);
        return result;
      } finally {
        // clean up uploaded file after scanning
        await fs.rm(filePath, { force: true });
      }
    }

    if (type === "repo") {
      const { repoUrl } = job.data;
      const result = await scanRepo(repoUrl);
      return result;
    }

    throw new Error(`Unknown job type: ${type}`);
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err);
});

console.log(`[worker] Started with concurrency ${CONCURRENCY}`);