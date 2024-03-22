import  { Router, Request, Response, NextFunction } from 'express';
import { State } from '../../state';
import { authenticated, localLogin } from '../authentication';

export default function (state: State) {
  const router = Router();

  router.get('/login', (req: Request, res: Response) => {
    res.render('login', state.handlebarOptions({
      title: 'Sonarr Webhooks Login',
      script: 'login.js'
    }, req));
  });

  router.post('/login', localLogin(state));

  router.get('/logout', authenticated(state), (req: Request, res: Response, next: NextFunction) => {
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
  });

  return router;
}
