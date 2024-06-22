import { Request, Response, NextFunction } from 'express';
import { SRSSRequest } from '../types';
import ipaddr from 'ipaddr.js';
import { forCategory } from '../logger';

const logger = forCategory('middleware');

export function noCache(req: Request, res:Response, next: NextFunction) {
  res.setHeader('cache-control', 'no-cache');
  next();
}

export function isLocalIp(req: Request, res: Response, next: NextFunction) {
  (req as SRSSRequest).isLocalIpAddr = false;
  if (req.clientIp) {
    try {
      const range = ipaddr.process(req.clientIp).range();
      (req as SRSSRequest).isLocalIpAddr = range === 'loopback' || range === 'private' || range === 'linkLocal' || range === 'uniqueLocal';
    } catch {} // eslint-disable-line no-empty
  }
  logger.info(`${req.clientIp ?? 'unknown'} ${(req as SRSSRequest).isLocalIpAddr ? 'local' : 'public'}`);
  next();
}
