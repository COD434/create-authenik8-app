import {SecurityModule} from "./security/ipService";
import  {RefreshService } from "./auth/refreshService"
import {Authenik8Config} from "./types/config";
import  {Incognito} from "./auth/guestModeService"
import {requireAdmin} from "./middleware/adminService";
import {JWTService} from "./auth/jwtAuth"
import { initializeRedisClient } from "./redis/redisService"
import {Authenik8Instance} from "./types/public"
import {RedisTokenStore} from "./storage/RedisTokenStore"

export const createAuthenik8 = async (config:Authenik8Config): Promise<Authenik8Instance> =>{

const redisClient = config.redis ?? await initializeRedisClient()
const tokenStore = new RedisTokenStore(redisClient);

	const jwtService =new JWTService({
	jwtSecret:config.jwtSecret,
	expiry:config.jwtExpiry ?? "15m",
	redisClient:redisClient
	});

	const refreshService = new RefreshService({
	tokenStore,
	redisClient,
	accessTokenSecret:config.jwtSecret,
	refreshTokenSecret:config.refreshSecret,
	accessTokenExpiry:config.jwtExpiry ?? "15m",
	rotateRefreshTokens:true,
	refreshTokenExpiry:config.jwtExpiry ?? "7d"
	});

	const security = new SecurityModule({
	redisClient:config.redis,
	rateLimiterEnabled: true,
	helmetEnabled:true,
	whiteListEnabled:true
	});
return{
	//auth
	redis:redisClient,
	signToken:jwtService.signToken.bind(jwtService),
	verifyToken:jwtService.verifyToken.bind(jwtService),
	guestToken:jwtService.guestToken.bind(jwtService),
	
	//refresh
	refreshToken:
		refreshService.refresh.bind(refreshService),
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
requireAdmin :requireAdmin({ jwtSecret:
	config.jwtSecret,
			   redis:redisClient
}),
incognito:Incognito

}
}
