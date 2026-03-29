"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisLock = void 0;
const crypto_1 = require("crypto");
class RedisLock {
    constructor(redis) {
        this.redis = redis;
    }
    async acquire(key, ttl = 5000) {
        const value = (0, crypto_1.randomUUID)();
        const result = await this.redis.set(key, value, "PX", ttl, "NX");
        if (result !== "OK")
            return null;
        return value;
    }
    async release(key, value) {
        const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
        await this.redis.eval(luaScript, 1, key, value);
    }
}
exports.RedisLock = RedisLock;
//# sourceMappingURL=lockHelper.js.map