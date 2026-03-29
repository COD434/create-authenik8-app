
import {Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";
import {Authenik8Config} from "../types/config";
import { RequireAdminOptions } from "../types/admin";


interface JwtPayload {
id:string;
role: string;
}



export const requireAdmin=(options:RequireAdminOptions)=>{
	const {jwtSecret,redis}= options;
return(req:Request, res:Response,next:NextFunction)=>{

const authHeader = req.headers.authorization
const cookieToken =req.cookies?.token

let token:string | undefined;


if(authHeader && authHeader.startsWith("Bearer")){
	token=authHeader.split(" ")[1];

}
if (!token && cookieToken){
token = cookieToken
}

if(!token){
return res.status(401).json({error:"Unauthorized:No token provided"});}
try{
        const decoded = jwt.verify(token,options.jwtSecret) as JwtPayload;

        if(typeof decoded.role !== "string"){
        res.status(403).json({error:"Forbidden: Admin only"})
        }
	const payload = decoded as JwtPayload

(req as any).user =decoded;
next();
}catch(error){
	return
res.status(401).json({error:"Invalid or expired token"})
}
}
}
