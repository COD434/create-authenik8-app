"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisTokenStore = void 0;
class RedisTokenStore {
    constructor(redis, debug = false) {
        this.redis = redis;
        this.debug = debug;
        this.prefix = "auth:v1";
    }
    key(...parts) {
        return `${this.prefix}:${parts.join(":")}`;
    }
    log(action, key, value) {
        if (this.debug) {
            console.log(`[Redis ${action}]`, { key, value });
        }
    }
    async storeRefreshToken(token, userId, ttl) {
        const key = this.key("refresh", userId);
        await this.redis.set(key, userId, "EX", ttl);
        this.log("SET", key, userId);
    }
    async getRefreshToken(userId) {
        const key = this.key("refresh", userId);
        const value = await this.redis.get(key);
        this.log("GET", key, value);
        return value;
    }
    async getset(key, value, expiry) {
        const previous = await this.redis.getset(key, value);
        if (expiry) {
            await this.redis.expire(key, expiry);
        }
        this.log("GETSET", key, { previous, new: value });
        return previous;
    }
    async deleteRefreshToken(userId) {
        const key = this.key("refresh", userId);
        await this.redis.del(key);
        this.log("DEL", key);
    }
    async blacklistToken(userId, ttl) {
        const key = this.key("blacklist", userId);
        await this.redis.set(key, "1", "EX", ttl);
        this.log("SET", key, "blacklisted");
    }
    async isBlacklisted(userId) {
        const key = this.key("blacklist", userId);
        const exists = await this.redis.exists(key);
        this.log("CHECK", key, exists);
        return exists === 1;
    }
    // Rate Limiting
    async incrementRateLimit(ip, ttl) {
        const key = this.key("rate", ip);
        const count = await this.redis.incr(key);
        if (count === 1) {
            await this.redis.expire(key, ttl);
        }
        this.log("INCR", key, count);
        return count;
    }
    // IP Whitelist
    async addToWhitelist(ip) {
        const key = this.key("whitelist", ip);
        await this.redis.set(key, "1");
        this.log("SET", key, "whitelisted");
    }
    async removeFromWhitelist(ip) {
        const key = this.key("whitelist", ip);
        await this.redis.del(key);
        this.log("DEL", key);
    }
    async isWhitelisted(ip) {
        const key = this.key("whitelist", ip);
        const exists = await this.redis.exists(key);
        this.log("CHECK", key, exists);
        return exists === 1;
    }
    async set(key, value, expiry) {
        console.log("REDIS SET:", key, value);
        if (expiry) {
            await this.redis.set(key, value, "EX", expiry);
        }
        else {
            await this.redis.set(key, value);
        }
    }
    async get(key) {
        return this.redis.get(key);
    }
}
exports.RedisTokenStore = RedisTokenStore;
//# sourceMappingURL=RedisTokenStore.js.map