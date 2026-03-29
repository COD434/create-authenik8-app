"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginLimiterMiddleware = exports.OTPLimiterMiddleware = exports.initializeRateLimiter = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const redisService_1 = require("../redis/redisService");
dotenv_1.default.config();
class TokenBucket {
    constructor(redisClient) {
        this.redis = redisClient;
    }
    async consume(key, capacity, refillRate) {
        var _a, _b;
        const now = Date.now();
        const results = await this.redis
            .pipeline()
            .hgetall(`rate_limit:${key}`)
            .exec();
        const data = (_b = (_a = results === null || results === void 0 ? void 0 : results[0]) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : {};
        const bucket = data
            || {};
        const currentToken = parseFloat(bucket.tokens || capacity.toString());
        const lastRefill = parseFloat(bucket.lastRefill || now.toString());
        const timeElapsed = (now - lastRefill) / 1000;
        const newToken = Math.min(capacity, currentToken + (timeElapsed * refillRate));
        if (newToken < 1) {
            return {
                allowed: false,
                remaining: Math.floor(newToken),
                retryAfter: Math.ceil((1 - newToken) / refillRate)
            };
        }
        await this.redis.hset(`rate_limit:${key}`, {
            tokens: (newToken - 1).toString(),
            lastRefill: now.toString()
        });
        this.redis.expire(`rate_limit:${key}`, 3600);
        return { allowed: true, remaining: Math.floor(newToken - 1) };
    }
}
let tokenBucket;
const initializeRateLimiter = async () => {
    const redisClient = (await (0, redisService_1.setupRedis)()).redisClient;
    tokenBucket = new TokenBucket(redisClient);
};
exports.initializeRateLimiter = initializeRateLimiter;
const createRatelimiter = (config) => {
    return async (req, res, next) => {
        const key = config.keyGenerator(req);
        const { allowed, remaining, retryAfter } = await tokenBucket.consume(key, config.capacity, config.refillRate);
        res.set({
            "X-RateLimit-Limit": config.capacity.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            ...(!allowed && { "Retry-After": (retryAfter === null || retryAfter === void 0 ? void 0 : retryAfter.toString()) || "1" })
        });
        if (allowed) {
            return next();
        }
        else {
            res.status(429).json({
                error: `Too many requests`
            });
        }
    };
};
const RATE_LIMIT_CONFIGS = {
    OTP: {
        keyPrefix: "otp_limiter",
        refillRate: 0.1,
        capacity: 3,
        keyGenerator: (req) => {
            var _a;
            const email = (_a = req.body) === null || _a === void 0 ? void 0 : _a.email;
            return email || req.ip || "unknown";
        }
    },
    LOGIN: {
        keyPrefix: "login_limiter",
        capacity: 10,
        refillRate: 2,
        keyGenerator: (req) => req.ip || "unknown"
    }
};
(0, exports.initializeRateLimiter)().catch((err) => {
    console.error("Failed to initialize rate limiters:", err);
    process.exit(1);
});
exports.OTPLimiterMiddleware = createRatelimiter(RATE_LIMIT_CONFIGS.OTP);
const LoginLimiterMiddleware = () => createRatelimiter(RATE_LIMIT_CONFIGS.LOGIN);
exports.LoginLimiterMiddleware = LoginLimiterMiddleware;
//# sourceMappingURL=limiter.js.map