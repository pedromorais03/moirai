// src/queues/scanQueue.js
import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const scanQueue = new Queue("scan", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: false, // keep results for polling
    removeOnFail: false,
  },
});