
import { Request, Response, NextFunction } from "express";


interface User{
id:string;
type?: 'guest-mode' | 'authenticated'
}

const verifyToken = (token: string):User => ({
	id: "guest",
type:token ==="temp-token" ? "guest-mode" :  "authenticated"});
const guestToken = () => "temp-token";

export const Incognito = (req:Request, res:Response, next:NextFunction)=>{
const authHeader = req.headers.authorization;

        let token = authHeader?.split(" ")[1];
        let user = token? verifyToken(token) : null;

if(!user){
const GToken = guestToken();
user = verifyToken(GToken);
res.setHeader("X-Guest-Token",GToken);
}
if(user?.type === "guest-mode"){
}
  (res as any).user = user;
  next();
}

