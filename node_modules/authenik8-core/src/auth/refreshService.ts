import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import {randomUUID} from "crypto"
import {RedisLock} from "../utility/lockHelper"

export class MissingTokenError extends Error{
constructor(message="Missing Token")
{
super(message);
this.name ="MissingTokenError";
}
}

export class InvalidTokenError extends
Error{
constructor(message = "Invalid refresh token"){
super(message);
this.name = "InvalidTokenError";
}
}


interface TokenPayload{
userId: string;
email: string;
}


export interface TokenStore{
get(key:string):Promise<string| null>;
set?(key: string, value: string, expiry?:number):Promise<void>;
del?(key :string):Promise<void>;
getset?(key: string, value: string, expiry?: number): Promise<string | null>;
}


export interface RefreshServiceOptions {
	tokenStore:TokenStore;
	accessTokenSecret:string;
	redisClient:any;
	refreshTokenSecret:string;
	accessTokenExpiry:SignOptions["expiresIn"];
	rotateRefreshTokens?:boolean;
	refreshTokenExpiry?:string | number;
}

export interface RefreshResult{
accessToken:string;
refreshToken?:string;
}


export class RefreshService{
private tokenStore:TokenStore;
private accessTokenSecret:string;
private refreshTokenSecret:string;
private accessTokenExpiry:SignOptions["expiresIn"];
private rotateRefreshTokens:boolean;
private refreshTokenExpiry:string | number;
private lock:RedisLock;

constructor(options:RefreshServiceOptions){
this.tokenStore =  options.tokenStore;
this.accessTokenSecret = options.accessTokenSecret;
this.refreshTokenSecret =options.refreshTokenSecret;
this.accessTokenExpiry= options.accessTokenExpiry ?? "15m";
this.rotateRefreshTokens = options.rotateRefreshTokens ?? false;
this.refreshTokenExpiry = options.refreshTokenExpiry ?? "7d"
this.lock = new RedisLock(options.redisClient)
 }


 async generateRefreshToken(payload: TokenPayload): Promise<string> {

	 if (!payload.userId) throw new Error("generateRefreshToken: payload.userId is missing");

	 const token = jwt.sign({...payload,jti:randomUUID(),},this.refreshTokenSecret, {
    expiresIn: this.refreshTokenExpiry as SignOptions["expiresIn"],
  });

  if(this.tokenStore.set){
  await this.tokenStore.set(
  `refresh:${payload.userId}`,token, 60 * 60 * 24 * 7
  );
  }

  
  return token
}


 async refresh(refreshToken?:string):Promise<RefreshResult>{
	 if(!refreshToken){
	 throw new MissingTokenError()
	 }

	 let decoded:TokenPayload;
try{

decoded = jwt.verify(refreshToken,this.refreshTokenSecret) as TokenPayload;
}catch(err){
throw new InvalidTokenError()
}

const lockKey = `lock:${decoded.userId}`;
  const lockValue = await this.lock.acquire(lockKey, 5000);

  if (!lockValue) {
    throw new InvalidTokenError("Concurrent refresh detected");
  }

//const storedToken= await this.tokenStore.get(`refresh:${decoded.userId}`)

try{
const key = `refresh:${decoded.userId}`;
const storedToken = await this.tokenStore.get(key);


if (!storedToken || storedToken !== refreshToken){
throw new InvalidTokenError();
}

const newAccessToken = jwt.sign(
        { userId: decoded.userId, email: decoded.email },
        this.accessTokenSecret,
        { expiresIn: this.accessTokenExpiry as jwt.SignOptions["expiresIn"] }
    );

let newRefreshToken:string | undefined;

if(this.rotateRefreshTokens && this.tokenStore.set){
const key = `refresh:${decoded.userId}`

;
 newRefreshToken =jwt.sign({userId:decoded.userId,email : decoded.email,jti:randomUUID(),},
	this.refreshTokenSecret,
{expiresIn:this.refreshTokenExpiry as jwt.SignOptions["expiresIn"]});

if (!this.tokenStore.getset) {
  throw new Error("TokenStore must implement getset for atomic refresh rotation");
}
const PreviousToken =await this.tokenStore.getset(key,newRefreshToken,60 * 60 * 24 * 7)
if(PreviousToken !== refreshToken){
throw new InvalidTokenError("Concurrent refresh detected")}
}

 return{
 accessToken:newAccessToken,
 refreshToken:newRefreshToken ?? refreshToken
 };
}finally {
    if (lockValue) await this.lock.release(lockKey, lockValue);
  }
}

}
