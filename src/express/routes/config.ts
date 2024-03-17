import  { Router, Request, Response } from 'express';
import { State } from '../../state';
import { authenticated } from '../authentication';
import { noCache } from '../middleware';
import { HealthTypes } from '../../utils';

export default function (state: State) {
  const router = Router();

  router.get('/config', authenticated(state), noCache, (req: Request, res: Response) => {
    res.render('config', state.handlebarOptions({
      layout: 'config',
      healthTypes: HealthTypes,
      configure: true
    }, req));
  });
  return router;
}
