"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityModule = void 0;
const helmet_1 = __importDefault(require("helmet"));
const ioredis_1 = __importDefault(require("ioredis"));
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const WHITELIST_KEY = "whitelist:ips";
const IP_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_JWT_EXPIRY = "1h";
const JWT_SECRET = process.env.JWT_SECRET || "Boo";
const EXPIRY = "1h";
class SecurityModule {
    constructor(options = {}) {
        var _a, _b, _c;
        this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || "Boo";
        this.jwtExpiry = options.jwtExpiry || DEFAULT_JWT_EXPIRY;
        this.whiteListEnabled = (_a = options.whiteListEnabled) !== null && _a !== void 0 ? _a : true;
        this.helmetEnabled = (_b = options.helmetEnabled) !== null && _b !== void 0 ? _b : true;
        this.rateLimiterEnabled = (_c = options.rateLimiterEnabled) !== null && _c !== void 0 ? _c : true;
        this.redisClient = options.redisClient || new ioredis_1.default({
            host: process.env.REDIS_HOST || "127.0.0.1",
            port: Number(process.env.REDIS_PORT || 6379),
            enableOfflineQueue: false,
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 10,
        });
        if (this.rateLimiterEnabled) {
            this.rateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
                storeClient: this.redisClient,
                keyPrefix: "rate_limit",
                points: options.rateLimitPoints || 100,
                duration: options.rateLimitDuration || 60,
                blockDuration: options.rateLimitBlock || 300,
            });
        }
        this.redisClient.on("error", (err) => console.error("Security Redis error:", err));
        this.redisClient.on("connect", () => {
            console.log("SecurityRedis  Connected to:", this.redisClient.options.host);
        });
    }
    async isAllowed(ip) {
        if (!this.whiteListEnabled)
            return true;
        try {
            const exists = await this.redisClient.sismember(WHITELIST_KEY, ip);
            if (exists === 1)
                return true;
            if (ip === "::1" || ip === "127.0.0.1")
                return true;
            const entries = await this.redisClient.smembers(WHITELIST_KEY);
            for (const entry of entries) {
                if (entry.includes("/")) {
                    const CIDR = (await Promise.resolve().then(() => __importStar(require("ip-cidr")))).default;
                    if (new CIDR(entry).contains(ip))
                        return true;
                }
            }
            return false;
        }
        catch (err) {
            console.error("whitelist check error:", err);
            return false;
        }
    }
    async addIP(ipOrCIDR, ttl = IP_EXPIRATION_SECONDS) {
        await this.redisClient.sadd(WHITELIST_KEY, ipOrCIDR);
        await this.redisClient.expire(WHITELIST_KEY, ttl);
    }
    async removeIP(ipOrCIDR) {
        await this.redisClient.srem(WHITELIST_KEY, ipOrCIDR);
    }
    async listIPs() {
        return await this.redisClient.smembers(WHITELIST_KEY);
    }
    whiteListMiddleware() {
        return async (req, res, next) => {
            var _a, _b;
            if (!this.whiteListEnabled)
                return next();
            const clientIP = ((_b = (_a = req.headers["x-forwarded-for"]) === null || _a === void 0 ? void 0 : _a.toString().split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) || req.ip;
            if (await this.isAllowed(clientIP))
                return next();
            res.status(403).json({ error: "Access denied" });
        };
    }
    rateLimiterMiddleware() {
        return (req, res, next) => {
            if (!this.rateLimiter || !this.rateLimiterEnabled)
                return next();
            const ip = req.ip || req.socket.remoteAddress || "unknown";
            this.rateLimiter.consume(ip).then(() => next()).catch(() => res.status(429).send("Too many Requests"));
        };
    }
    helmetMiddleware() {
        if (!this.helmetEnabled) {
            return (req, res, next) => next();
        }
        const helmetDirectives = {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "trusted-cdn.com"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "trusted-cdn.com"],
            fontSrc: ["'self'", "trusted-cdn.com"],
            connectSrc: ["'self'", "api.trusted-domain.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
            reportUri: "/csp-violation-report",
        };
        return (0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: helmetDirectives, reportOnly: process.env.NODE_ENV !== "production"
            },
            hsts: { maxAge: 315366000,
                includeSubDomains: true, preload: true },
            xxsFilter: true,
            noSniff: true,
            frameguard: { action: "deny" },
            referrerPolicy: { policy: "same-origin" },
        });
    }
}
exports.SecurityModule = SecurityModule;
//# sourceMappingURL=ipService.js.map