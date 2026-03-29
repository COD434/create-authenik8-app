"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeRedisClient = exports.setupRedis = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const connect_redis_1 = require("connect-redis");
const ioredis_1 = __importDefault(require("ioredis"));
dotenv_1.default.config();
let redisClientInstance = null;
let redisStoreInstance = null;
const DEFAULT_REDIS_CONFIG = {
    host: (_a = process.env.REDIS_HOST) !== null && _a !== void 0 ? _a : "redis",
    port: Number((_b = process.env.REDIS_PORT) !== null && _b !== void 0 ? _b : "6379"),
    maxRetriesPerRequest: 10,
    connectTimeout: 5000
};
const DEFAULT_STORE_OPTIONS = {
    prefix: "session",
    ttl: 86400
};
const validateRedisConfig = (config) => {
    if (!config.url && !config.host) {
        throw new Error("Redis configuration requires either URL or host/port");
    }
    if (config.url && !config.url.startsWith("redis://") && !config.url.startsWith("rediss://")) {
        throw new Error("Redis URL must use 'redis://' protocol");
    }
};
const getRedisConfig = (options) => {
    const port = (options === null || options === void 0 ? void 0 : options.port) ?
        Number(options.port) :
        process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) :
            Number(DEFAULT_REDIS_CONFIG.port);
    const config = {
        ...DEFAULT_REDIS_CONFIG,
        host: (options === null || options === void 0 ? void 0 : options.host) || process.env.REDIS_HOST || DEFAULT_REDIS_CONFIG.host,
        port: port,
        password: (options === null || options === void 0 ? void 0 : options.password) || process.env.REDIS_PASSWORD || undefined,
        ...options
    };
    validateRedisConfig(config);
    return config;
};
const setupRedis = async (options) => {
    try {
        const config = getRedisConfig(options === null || options === void 0 ? void 0 : options.redisConfig);
        const storeOptions = { ...DEFAULT_STORE_OPTIONS, ...options === null || options === void 0 ? void 0 : options.storeOptions };
        const redisClient = new ioredis_1.default({
            host: config.host,
            port: Number(config.port),
            connectTimeout: config.connectTimeout,
            password: config.password,
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: config.maxRetriesPerRequest
        });
        await new Promise((resolve, reject) => {
            redisClient.once("ready", async () => {
                try {
                    const pong = await redisClient.ping();
                    console.log("Redis ping response:", pong);
                    resolve();
                }
                catch (err) {
                    reject(err);
                }
            });
            redisClient.once("error", (err) => {
                reject(err);
            });
        });
        const redisStore = new connect_redis_1.RedisStore({
            client: redisClient,
            prefix: storeOptions.prefix,
            ttl: storeOptions.ttl
        });
        redisClient.on("error", (err) => {
            console.error("Redis client error:", err);
        });
        redisClient.on("ready", () => {
            console.log("Redis client is ready");
        });
        redisClient.on("reconnecting", () => {
            console.log("Redis client reconnecting...");
        });
        return { redisClient, redisStore };
    }
    catch (error) {
        console.error("Redis setup failed:", error);
        throw error;
    }
};
exports.setupRedis = setupRedis;
const initializeRedisClient = async () => {
    if (!redisClientInstance) {
        const { redisClient } = await setupRedis();
        redisClientInstance = redisClient;
    }
    return redisClientInstance;
};
exports.initializeRedisClient = initializeRedisClient;
//# sourceMappingURL=redisService.js.map