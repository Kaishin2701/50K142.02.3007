import type { RequestHandler } from 'express';
import type { Database } from './database.js';
import type { authService } from '../modules/auth/auth.service.js';
import { notificationList } from './notifications.js';
/** Best-effort refresh events. Business data is always fetched through authorized APIs. */
export function eventStream(db:Database,auth:ReturnType<typeof authService>):RequestHandler{return(req,res)=>{
 res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
 const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):req.cookies?.me_session;
 const seen=new Set<string>();let busy=false,closed=false;
 res.write('event: ready\ndata: {}\n\n');
 const tick=async()=>{if(busy||closed)return;busy=true;
   try{await auth.authenticate(token);const notifications=await notificationList(db,req.actor!.id,100,0);
     const fresh=notifications.filter(n=>!seen.has(n.ma_thong_bao));for(const notification of notifications)seen.add(notification.ma_thong_bao);
     if(seen.size>1000){seen.clear();for(const notification of notifications)seen.add(notification.ma_thong_bao);}
     if(!closed&&fresh.length)res.write(`event: refresh\ndata: ${JSON.stringify({types:[...new Set(fresh.map(n=>n.loai))]})}\n\n`);
     else if(!closed)res.write(': heartbeat\n\n');
   }catch{if(!closed){res.write('event: session-ended\ndata: {}\n\n');res.end();}}
   finally{busy=false;}
 };
 const interval=setInterval(()=>{void tick();},2000);interval.unref();res.on('close',()=>{closed=true;clearInterval(interval);});void tick();
};}
