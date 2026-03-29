import dotenv from "dotenv";
import Redis,{Redis as RedisClient}  from "ioredis"
import {setupRedis} from "../redis/redisService" 
import {Request, Response, NextFunction} from "express"
dotenv.config()


class TokenBucket{
private redis: RedisClient


constructor(redisClient:RedisClient){
this.redis = redisClient;
}

async consume(key:string, capacity:number, refillRate:number): Promise<{
allowed:boolean;
remaining:number;
retryAfter?:number;
}>{
const now = Date.now();
const results = await this.redis
.pipeline()
.hgetall(`rate_limit:${key}`)
.exec();
const data= results?.[0]?.[1] ?? {} 
const bucket = data as {tokens?: string;lastRefill?: string}
|| {} ;
const currentToken = parseFloat(bucket.tokens || capacity.toString ());
const lastRefill = parseFloat(bucket.lastRefill || now.toString())
const timeElapsed= (now - lastRefill) / 1000;
const newToken =  Math.min(capacity,  currentToken + (timeElapsed * refillRate))

if (newToken < 1){
return{
allowed:false,
remaining:Math.floor(newToken),
retryAfter:Math.ceil((1 - newToken) / refillRate)
}
}
await this.redis.hset(`rate_limit:${key}`,{
tokens:(newToken - 1).toString(),
lastRefill: now.toString()
})
this.redis.expire(`rate_limit:${key}`, 3600)



return {allowed:true ,remaining:Math.floor(newToken - 1)};
 }
}

let tokenBucket: TokenBucket;


export const initializeRateLimiter = async () => {
const redisClient = (await setupRedis()).redisClient;
tokenBucket = new TokenBucket(redisClient);
};
const createRatelimiter = (config:{
capacity:number;
refillRate: number;
keyGenerator: (req:Request)=> string;
})=>{
return async(req:Request, res:Response, next:NextFunction): Promise<void> =>{
const key = config.keyGenerator(req);
const {allowed, remaining, retryAfter}= await tokenBucket.consume(
key,
config.capacity,
config.refillRate
)
res.set({
"X-RateLimit-Limit": config.capacity.toString(),
"X-RateLimit-Remaining":remaining.toString(),
...(!allowed && {"Retry-After": retryAfter?.toString() || "1"})
})
if(allowed){

return next();
}else{
res.status(429).json({
error:`Too many requests`
 })
}
 }
}


const RATE_LIMIT_CONFIGS= {
	OTP:{
	keyPrefix:"otp_limiter",
	refillRate: 0.1,
	capacity:3,
	keyGenerator: (req:Request)=>{
		const email =req.body?.email;
	 return email || req.ip  || "unknown"
}
	},


	LOGIN:{
	keyPrefix:"login_limiter",
        capacity:10,
        refillRate:2,
	keyGenerator:(req: Request): string => req.ip || "unknown"
	}
};

initializeRateLimiter().catch((err) => {
  console.error("Failed to initialize rate limiters:", err);
  process.exit(1);
})


export const OTPLimiterMiddleware =createRatelimiter(RATE_LIMIT_CONFIGS.OTP);
export const LoginLimiterMiddleware = () => createRatelimiter(RATE_LIMIT_CONFIGS.LOGIN);
