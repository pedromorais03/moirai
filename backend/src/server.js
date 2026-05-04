// src/server.js
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { scanRoutes } from "./routes/scan.js";

const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

// CORS — allow frontend dev server
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || "*",
});

// Multipart for file uploads (max 50MB)
await fastify.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

// Health check
fastify.get("/health", async () => ({ status: "ok" }));

// Scan routes
await fastify.register(scanRoutes, { prefix: "/scan" });

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`[server] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}