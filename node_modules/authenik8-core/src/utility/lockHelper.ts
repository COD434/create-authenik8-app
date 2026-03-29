import { randomUUID } from "crypto";

export class RedisLock {
  constructor(private redis: any) {}

  async acquire(key: string, ttl = 5000): Promise<string | null> {
    const value = randomUUID();

    const result = await this.redis.set(
      key,
      value,
      "PX",
      ttl,
      "NX"
    );

    if (result !== "OK") return null;

    return value;
  }

  async release(key: string, value: string): Promise<void> {
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
