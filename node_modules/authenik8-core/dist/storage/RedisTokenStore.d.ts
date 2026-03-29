import { Redis } from "ioredis";
export declare class RedisTokenStore {
    private redis;
    private debug;
    private prefix;
    constructor(redis: Redis, debug?: boolean);
    private key;
    private log;
    storeRefreshToken(token: string, userId: string, ttl: number): Promise<void>;
    getRefreshToken(userId: string): Promise<string | null>;
    getset(key: string, value: string, expiry?: number): Promise<string | null>;
    deleteRefreshToken(userId: string): Promise<void>;
    blacklistToken(userId: string, ttl: number): Promise<void>;
    isBlacklisted(userId: string): Promise<boolean>;
    incrementRateLimit(ip: string, ttl: number): Promise<number>;
    addToWhitelist(ip: string): Promise<void>;
    removeFromWhitelist(ip: string): Promise<void>;
    isWhitelisted(ip: string): Promise<boolean>;
    set(key: string, value: string, expiry?: number): Promise<void>;
    get(key: string): Promise<string | null>;
}
//# sourceMappingURL=RedisTokenStore.d.ts.map