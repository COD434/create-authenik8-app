
import {Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken"
import crypto from "crypto"


interface JwtPayload {
userId: string;
email: string;
type?:string;
id?:string;
createdAt?:number;
}

export interface JWTOptions{
jwtSecret:string;
expiry?:SignOptions["expiresIn"];
redisClient?:any;
onGuestToken?: () => void;
}
export class JWTService{

private jwtSecret:string;
private expiry?:SignOptions["expiresIn"]


signToken(payload: object){
return jwt.sign(payload,this.jwtSecret,{
expiresIn:this.expiry || "1h"})
};


private redisclient?:any;
private onGuestToken?: () => void;


constructor(options:JWTOptions){
this.jwtSecret = options.jwtSecret;
this.expiry = options.expiry;
this.redisclient = options.redisClient;
this.onGuestToken = options.onGuestToken;

}


guestToken(): string{
const payload = {
type: "guest",
id:crypto.randomUUID(),
createdAt:Date.now()
}
if(this.onGuestToken)
	this.onGuestToken();

return jwt.sign(payload,this.jwtSecret,{expiresIn:this.expiry});
}

verifyToken(token:string):JwtPayload | null{
try{
	return jwt.verify(token,this.jwtSecret)as JwtPayload;}catch{
	return null

	}
}

authenticateJWT = async(
	req:Request,
	res:Response,
	next:NextFunction
) => {
const authHeader = req.headers.authorization;
const token = req.cookies?.token || (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1]:null);

if(!token){
return res.status(401).json({message:"Unauthorized"})
}
try{
const decoded =jwt.verify(token,this.jwtSecret)as JwtPayload;

if(this.redisclient && decoded.userId){
const storedToken = await this.redisclient.get(`session:${decoded.userId}`);

if(storedToken !== token){
return res
.status(403)
.json({success:false,message:"invalid session",errors: []})
}
}
(req as any).user =decoded;
next();

}catch{
return res.status(403)
.json({success:false, message: "invalid or expired token"});
}
}
}

