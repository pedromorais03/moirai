// src/routes/scan.js
import { scanQueue } from "../queue/scanQueue.js";
import path from "path";
import fs from "fs/promises";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads";

export async function scanRoutes(fastify) {
  // Ensure uploads dir exists
  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  /**
   * POST /scan/file
   * Accepts a multipart file upload (Dockerfile or IaC file).
   */
  fastify.post("/file", async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }

    const filename = `${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    await pipeline(data.file, createWriteStream(filePath));

    const job = await scanQueue.add("scan-file", {
      type: "file",
      filePath,
      originalName: data.filename,
    });

    return reply.status(202).send({ jobId: job.id });
  });

  /**
   * POST /scan/repo
   * Accepts a JSON body with { repoUrl }.
   */
  fastify.post(
    "/repo",
    {
      schema: {
        body: {
          type: "object",
          required: ["repoUrl"],
          properties: {
            repoUrl: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { repoUrl } = request.body;

      const job = await scanQueue.add("scan-repo", {
        type: "repo",
        repoUrl,
      });

      return reply.status(202).send({ jobId: job.id });
    }
  );

  /**
   * GET /scan/:jobId
   * Polling endpoint — returns job status and result when done.
   */
  fastify.get("/:jobId", async (request, reply) => {
    const { jobId } = request.params;

    const job = await scanQueue.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const state = await job.getState();

    // BullMQ states: waiting, active, completed, failed, delayed, unknown
    if (state === "completed") {
      return reply.send({
        jobId,
        status: "completed",
        result: job.returnvalue,
      });
    }

    if (state === "failed") {
      return reply.send({
        jobId,
        status: "failed",
        error: job.failedReason,
      });
    }

    return reply.send({ jobId, status: state });
  });
}