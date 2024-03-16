import { Request, Response, NextFunction } from 'express';

export function noCache(req: Request, res:Response, next: NextFunction) {
  res.setHeader('cache-control', 'no-cache');
  next();
}
