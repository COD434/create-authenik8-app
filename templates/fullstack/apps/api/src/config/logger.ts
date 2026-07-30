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

type SerializedRequest = {
  id?: string | number;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
};

export const httpLogSerializers = {
  req(request: SerializedRequest) {
    const headers = { ...request.headers };
    delete headers.referer;
    delete headers.referrer;
    return {
      ...request,
      url: request.url?.split("?", 1)[0],
      query: undefined,
      headers,
    };
  },
};

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
