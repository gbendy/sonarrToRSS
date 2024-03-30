import  express, { Router, Request, Response } from 'express';
import { forCategory } from '../../logger';
import { State } from '../../state';
import { basicLogin } from '../authentication';

const logger = forCategory('sonarr');

export default function (state: State) {
  const router = Router();

  // Process webhooks from Sonarr
  router.use(state.sonarrUrl, express.json());

  const processEvent = async (req: Request, res: Response) => {

    res.status(200);
    res.end('ok');

    if (req.body?.eventType) {
      logger.info(`New event: ${req.body.eventType}`);
      state.feed.eventManager.addEvent(req.body);
    }
  };

  router.post(state.sonarrUrl, basicLogin(state), processEvent);
  router.put(state.sonarrUrl, basicLogin(state), processEvent);

  return router;
}
