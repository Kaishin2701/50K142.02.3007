import type { RequestHandler } from 'express';
import type { Actor, authService } from '../modules/auth/auth.service.js';
import { AppError } from '../shared/errors.js';
declare global { namespace Express { interface Request { actor?: Actor; currentUser?: Record<string,unknown>; } } }
export function authenticate(auth: ReturnType<typeof authService>): RequestHandler {
 return async (req,_res,next) => {
   try { const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : req.cookies?.me_session;
     const result=await auth.authenticate(token); req.actor=result.actor;req.currentUser=result.user;next(); }
   catch(error) { next(error); }
 };
}
export const permit = (...roles: Actor['role'][]): RequestHandler => (req,_res,next) => {
 if (!req.actor || !roles.includes(req.actor.role)) return next(new AppError(403,'FORBIDDEN','Bạn không có quyền thực hiện chức năng này.'));
 next();
};
