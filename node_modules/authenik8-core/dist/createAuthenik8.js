"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthenik8 = void 0;
const ipService_1 = require("./security/ipService");
const refreshService_1 = require("./auth/refreshService");
const guestModeService_1 = require("./auth/guestModeService");
const adminService_1 = require("./middleware/adminService");
const jwtAuth_1 = require("./auth/jwtAuth");
const redisService_1 = require("./redis/redisService");
const RedisTokenStore_1 = require("./storage/RedisTokenStore");
const createAuthenik8 = async (config) => {
    var _a, _b, _c, _d;
    const redisClient = (_a = config.redis) !== null && _a !== void 0 ? _a : await (0, redisService_1.initializeRedisClient)();
    const tokenStore = new RedisTokenStore_1.RedisTokenStore(redisClient);
    const jwtService = new jwtAuth_1.JWTService({
        jwtSecret: config.jwtSecret,
        expiry: (_b = config.jwtExpiry) !== null && _b !== void 0 ? _b : "15m",
        redisClient: redisClient
    });
    const refreshService = new refreshService_1.RefreshService({
        tokenStore,
        redisClient,
        accessTokenSecret: config.jwtSecret,
        refreshTokenSecret: config.refreshSecret,
        accessTokenExpiry: (_c = config.jwtExpiry) !== null && _c !== void 0 ? _c : "15m",
        rotateRefreshTokens: true,
        refreshTokenExpiry: (_d = config.jwtExpiry) !== null && _d !== void 0 ? _d : "7d"
    });
    const security = new ipService_1.SecurityModule({
        redisClient: config.redis,
        rateLimiterEnabled: true,
        helmetEnabled: true,
        whiteListEnabled: true
    });
    return {
        //auth
        redis: redisClient,
        signToken: jwtService.signToken.bind(jwtService),
        verifyToken: jwtService.verifyToken.bind(jwtService),
        guestToken: jwtService.guestToken.bind(jwtService),
        //refresh
        refreshToken: refreshService.refresh.bind(refreshService),
        generateRefreshToken: refreshService.generateRefreshToken.bind(refreshService),
        //security
        rateLimit: security.rateLimiterMiddleware(),
        ipWhitelist: security.whiteListMiddleware(),
        helmet: security.helmetMiddleware(),
        //Whitelist management
        addIP: security.addIP.bind(security),
        removeIP: security.removeIP.bind(security),
        listIPs: security.listIPs.bind(security),
        //middleware
        requireAdmin: (0, adminService_1.requireAdmin)({ jwtSecret: config.jwtSecret,
            redis: redisClient
        }),
        incognito: guestModeService_1.Incognito
    };
};
exports.createAuthenik8 = createAuthenik8;
//# sourceMappingURL=createAuthenik8.js.map