import type { Request,RequestHandler,Response } from 'express';
import { id } from './validation.js';
export const param=(req:Request,name='id')=>id.parse(req.params[name]);
export const controller=(work:(req:Request,res:Response)=>Promise<unknown>,status=200):RequestHandler=>async(req,res,next)=>{
 try{const data=await work(req,res);if(!res.headersSent)res.status(status).json({data});}catch(error){next(error);}
};
