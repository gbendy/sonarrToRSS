import  express, { Router, Request, Response } from 'express';
import { writeFileSync } from 'node:fs';
import { Event } from '../../types';
import { forCategory } from '../../logger';
import { State } from '../../state';
import { randomString } from '../../utils';
import { basicLogin } from '../authentication';

const logger = forCategory('sonarr');

export default function (state: State) {
  const router = Router();

  // Process webhooks from Sonarr
  router.use(state.sonarrUrl, express.json());

  const processEvent = async (req: Request, res: Response) => {
    const timestamp = Date.now();
    const id = randomString();
    const event: Event = {
      timestamp,
      id,
      index: state.history.length,
      event: req.body
    };
    state.history.push(event);
    state.events[event.id] = event;
    logger.info(`New event: ${event.event.eventType}`);
    res.status(200);
    res.end('ok');

    if (event.event.series?.id !== undefined && !state.seriesData.has(event.event.series.id)) {
      state.ensureSeries(new Set([ event.event.series?.id ]));
    }
    try {
      await state.feed.eventManager.processNew(event);
    } catch (e) {
      logger.info(`Error sending event to feed: ${e}`);
    }

    writeFileSync(state.resolvedHistoryFile, JSON.stringify(state.history), { encoding: 'utf8' });
  };

  router.post(state.sonarrUrl, basicLogin(state), processEvent);
  router.put(state.sonarrUrl, basicLogin(state), processEvent);

  return router;
}
