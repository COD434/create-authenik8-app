
import helmet from  "helmet";
import Redis from "ioredis";
import type {StringValue} from "ms"
import { RequestHandler } from "express";
import {RateLimiterRedis} from "rate-limiter-flexible";
import { Request, Response, NextFunction } from "express";
import { HelmetOptions } from "helmet";


const WHITELIST_KEY ="whitelist:ips";
const IP_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_JWT_EXPIRY = "1h"

 interface CSPDirectives{
 [key: string]: Array<string | boolean>;
 }

interface DynamicWhiteList{
isAllowed : (ip:string)=> Promise<boolean>;
addIp: (ip: string)=> Promise<void>;
removeIp: (ip: string)=> Promise<void>;
getAll:() => Promise<string[]>;
middleware: () => (req:Request, res: Response, next:any)=> Promise<void>;
listIP:(ip:string)=> Promise<void>;
}

const JWT_SECRET =process.env.JWT_SECRET || "Boo";
const EXPIRY = "1h";

export interface SecurityOptions{
 redisClient?: Redis;
jwtSecret?:string;
jwtExpiry?:StringValue;
rateLimitPoints?:number;
rateLimitDuration?:number;
rateLimitBlock?:number;
rateLimiterEnabled?:boolean;
enableWhitelist?:boolean;
enableRateLimiter?:boolean;
enableHelmet?:boolean;
whiteListEnabled?:boolean;
helmetEnabled?:boolean;
}

export class SecurityModule{
private redisClient:Redis;
private jwtSecret:string;
private jwtExpiry:StringValue;
private rateLimiter?: RateLimiterRedis;
private whiteListEnabled:boolean;
private helmetEnabled:boolean;
private rateLimiterEnabled:boolean;


constructor(options: SecurityOptions = {})
{
this.jwtSecret=options.jwtSecret || process.env.JWT_SECRET ||  "Boo" ;
this.jwtExpiry = options.jwtExpiry ||  DEFAULT_JWT_EXPIRY;
this.whiteListEnabled = options.whiteListEnabled ?? true;
this.helmetEnabled = options.helmetEnabled ?? true;
this.rateLimiterEnabled = options.rateLimiterEnabled ?? true;

this.redisClient = options.redisClient || new Redis({
host:process.env.REDIS_HOST || "127.0.0.1",
port:Number(process.env.REDIS_PORT || 6379),
enableOfflineQueue: false,
retryStrategy:(times)=> Math.min(times * 50 , 2000),
maxRetriesPerRequest:10,
})

if(this.rateLimiterEnabled){
this.rateLimiter = new RateLimiterRedis({
storeClient: this.redisClient,
keyPrefix:"rate_limit",
points:options.rateLimitPoints || 100,
duration:options.rateLimitDuration || 60,
blockDuration: options.rateLimitBlock || 300,

})
}
this.redisClient.on("error",(err)=>
 console.error("Security Redis error:",err)
 );
this.redisClient.on("connect",() =>{
console.log("SecurityRedis  Connected to:",this.redisClient.options.host);
		   
})
}


async isAllowed(ip:string):Promise<boolean>{
if(!this.whiteListEnabled)
return true;

try{
const exists = await this.redisClient.sismember(WHITELIST_KEY,ip);
 if (exists ===1) return true;


if( ip === "::1" || ip === "127.0.0.1")
return true;
const entries = await this.redisClient.smembers(WHITELIST_KEY)

for (const entry of entries){
if(entry.includes("/"))
	{
	const CIDR = (await import("ip-cidr")).default;
	if(new CIDR(entry).contains(ip)) return true;
	}
}
return false;

}catch(err){
console.error("whitelist check error:",err);
return false;
}
}

async addIP(ipOrCIDR:string,ttl:number =IP_EXPIRATION_SECONDS){
await this.redisClient.sadd(WHITELIST_KEY,ipOrCIDR);
await this.redisClient.expire(WHITELIST_KEY,ttl)
}
async removeIP(ipOrCIDR:string){
await this.redisClient.srem(WHITELIST_KEY,ipOrCIDR);
}

async listIPs(): Promise<string[]>{
return await this.redisClient.smembers(WHITELIST_KEY);
}

whiteListMiddleware(){
return async(req: Request,res:Response, next:NextFunction)=>{
 if(!this.whiteListEnabled) return next();

const clientIP = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip!;

if(await this.isAllowed(clientIP!))return next();
  res.status(403).json({error:"Access denied"});
  }
}
rateLimiterMiddleware(){
return (req:Request, res:Response, next:NextFunction)=>{
if (!this.rateLimiter || !this.rateLimiterEnabled)return next();
const ip = req.ip || req.socket.remoteAddress || "unknown";
this.rateLimiter.consume(ip).then(()=> next()).catch(()=> res.status(429).send("Too many Requests"));
};
}

helmetMiddleware():RequestHandler{
if(!this.helmetEnabled){
return(req: Request,  res:Response, next:NextFunction)=> next();}
 
const helmetDirectives={
defaultSrc:["'self'"],
scriptSrc:["'self'","'unsafe-inline'","trusted-cdn.com"],
styleSrc:["'self'"],
imgSrc:["'self'","data:","trusted-cdn.com"],
fontSrc:["'self'","trusted-cdn.com"],
connectSrc:["'self'","api.trusted-domain.com"],
frameSrc:["'none'"],
objectSrc:["'none'"],
upgradeInsecureRequests: [],
reportUri: "/csp-violation-report",
};

return helmet({
contentSecurityPolicy:{
directives:helmetDirectives, reportOnly:process.env.NODE_ENV !== "production"},
hsts:{maxAge:315366000,
includeSubDomains:true,preload:true},
xxsFilter:true,
noSniff:true,
frameguard:{action:"deny"},
referrerPolicy:{policy:"same-origin"},
}as HelmetOptions);
}
}


