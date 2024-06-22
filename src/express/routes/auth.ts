import  { Router, Request, Response, NextFunction } from 'express';
import { State } from '../../state';
import { sessionAuthenticated, performSiteLogin } from '../authentication';

export default function (state: State) {
  const router = Router();

  router.get('/login', (req: Request, res: Response) => {
    res.render('login', state.handlebarOptions({
      title: 'Sonarr Webhooks Login',
      script: 'login.js'
    }, req));
  });

  router.post('/login', performSiteLogin(state));

  router.get('/logout', sessionAuthenticated(state), (req: Request, res: Response, next: NextFunction) => {
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect(state.resolveUrlPath('/'));
    });
  });

  return router;
}
