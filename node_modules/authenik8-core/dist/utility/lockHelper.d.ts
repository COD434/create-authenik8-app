export declare class RedisLock {
    private redis;
    constructor(redis: any);
    acquire(key: string, ttl?: number): Promise<string | null>;
    release(key: string, value: string): Promise<void>;
}
//# sourceMappingURL=lockHelper.d.ts.map