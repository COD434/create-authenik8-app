import { RedisStore } from "connect-redis";
import Redis from "ioredis";
interface RedisConfig {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    maxRetriesPerRequest?: number;
    connectTimeout: number;
}
interface RedisStoreOptions {
    prefix?: string;
    ttl?: number;
}
interface SetupRedisOptions {
    redisConfig?: Partial<RedisConfig>;
    storeOptions?: Partial<RedisStoreOptions>;
}
declare const setupRedis: (options?: SetupRedisOptions) => Promise<{
    redisClient: Redis;
    redisStore: RedisStore;
}>;
declare const initializeRedisClient: () => Promise<Redis>;
export { setupRedis, initializeRedisClient };
export type { RedisConfig, RedisStoreOptions, SetupRedisOptions };
//# sourceMappingURL=redisService.d.ts.map