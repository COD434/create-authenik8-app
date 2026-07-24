import pino, { type DestinationStream, type LoggerOptions } from "pino";
import { env } from "./env.js";

export const redactedLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  "password",
  "passwordHash",
  "accessToken",
  "refreshToken",
];

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: redactedLogPaths,
    censor: "[REDACTED]",
  },
};

export function createLogger(destination?: DestinationStream) {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const logger = createLogger();
