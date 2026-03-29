import { SignOptions } from "jsonwebtoken";
import { Redis } from "ioredis";
export interface Authenik8Config {
    jwtSecret: string;
    jwtExpiry?: SignOptions["expiresIn"];
    refreshSecret: string;
    redis?: Redis;
}
//# sourceMappingURL=config.d.ts.map