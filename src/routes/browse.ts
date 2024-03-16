import  { Router, Request, Response } from 'express';
import { ImageCache, SeriesResourceExt } from '../types';
import { HealthTypes } from '../utils';
import { State } from '../state';
import { noCache } from '../middleware';

/**
 * Parses the given string and returns it as an Integer.
 * Defaults to defaultvalue if parsing fails
 */
function parseInteger<T>(str: string, defaultValue: T): number | T
{
  const value = Number.parseInt(str);
  return Number.isNaN(value) ? defaultValue : value;
}

function sendBuffer(buffer: Buffer, contentType: string|undefined, res: Response) {
  res.statusCode = 200;
  if (contentType) {
    res.setHeader('content-type', contentType);
  }
  res.end(buffer);
}

function getSeriesImage(state: State, series: SeriesResourceExt, filename: string, res: Response) {
  if (!series.cachedImages.has(filename)) {
    series.cachedImages.set(filename, {
      waiting: [],
      getting: false
    });
  }
  if (!state.sonarrApi) {
    // no API and we don't have the image. Just 500 it.
    res.statusCode = 500;
    res.end();
    return;
  }
  const cache = series.cachedImages.get(filename) as ImageCache;
  if (cache.image) {
    sendBuffer(cache.image, cache.contentType, res);
    return;
  }
  cache.waiting.push(res);
  if (!cache.getting) {
    cache.getting = true;
    state.sonarrApi.getBuffer(`mediacover/${series.id}/${filename}`).then(r => {
      cache.getting = false;
      cache.image = r.buffer;
      cache.contentType = r.contentType;
      for (const waitingRes of cache.waiting) {
        sendBuffer(cache.image, cache.contentType, waitingRes);
      }
    }).catch(e => {
      for (const waitingRes of cache.waiting) {
        waitingRes.statusCode = 500;
        waitingRes.status = e;
        waitingRes.end();
      }
      cache.waiting.length = 0;
    });
  }
}

function getBanner(state: State, seriesId: number, res: Response) {
  const series = state.seriesData.get(seriesId);
  if (series === undefined) {
    res.statusCode = 404;
    res.end();
    return;
  }
  getSeriesImage(state, series, 'banner.jpg', res);
}

export default function (state: State) {
  const router = Router();
  const helpers = state.handlebarsHelpers;

  router.get('/', (req: Request, res: Response) => {
    res.redirect(state.resolveUrlPath('browse'));
  });

  router.get('/config', noCache, (req: Request, res: Response) => {
    res.render('config', {
      layout: 'config',
      state: state,
      healthTypes: HealthTypes,
      helpers
    });
  });

  // get series banner image
  router.get('/banner/:seriesId', (req: Request, res: Response ) => {
    if (!state.sonarrApi) {
      res.statusCode = 500;
      res.end();
      return;
    }
    const seriesId = parseInteger(req.params.seriesId, undefined);
    if (seriesId === undefined) {
      res.statusCode = 400;
      res.end();
      return;
    }
    getBanner(state, seriesId, res);
  });

  // History browsing
  router.get('/browse/:pageOrId?/:count?', async (req: Request, res: Response) => {
    // get and sanitise input parameters
    const totalEvents = state.history.length;
    const count = Math.max(parseInteger(req.params.count, 6), 1);
    const ascending = req.query.sort === 'ascending';
    const numPages = Math.ceil(totalEvents / count);
    const pageIsId = parseInteger(req.params.pageOrId, true);
    let currentPage: number;
    if (pageIsId === true) {
      // page isn't a number so is the ID of an event.
      // work out which page contains that event.
      const event = state.events[req.params.pageOrId];
      if (event) {
        currentPage = ascending ?
          Math.floor(event.index / count) :
          (Math.floor((totalEvents - event.index - 1)/ count));
      } else {
        currentPage = 0;
      }
    } else {
      // page is a number so is the current page to show
      currentPage = Math.min(Math.max(pageIsId, 0), numPages-1);
    }

    const start = Math.min(currentPage * count, totalEvents-1);

    const numEvents = Math.min(totalEvents - start, count);

    // select events to show
    const first = ascending ?
      start :
      Math.max(totalEvents - start - count, 0);

    const events = state.history.slice(first, first + numEvents);
    if (!ascending) {
      events.reverse();
    }

    // fetch series info so we can show banners
    const seriesIds = events.reduce((store, e) => {
      if (e.event.series?.id && !state.seriesData.has(e.event.series?.id)) {
        store.add(e.event.series.id);
      }
      return store;
    }, new Set<number>()) as Set<number>;

    await state.ensureSeries(seriesIds);

    // Calculate pagination data
    const end = start+count >= totalEvents ? totalEvents-1 : start + count - 1;
    const pagination = [];
    const paginationCount = 9; // must be odd
    function createPagination(page: number) {
      return {
        label: page + 1,
        page: page,
        active: currentPage === page
      };
    }
    if (numPages < paginationCount) {
      for (let i=0; i<numPages; i++) {
        pagination.push(createPagination(i));
      }
    } else {
      if (currentPage <= Math.floor(paginationCount / 2)) {
        for (let i=0; i<paginationCount-2; i++) {
          pagination.push(createPagination(i));
        }
        pagination.push({skip: true});
        pagination.push(createPagination(numPages-1));
      } else if (currentPage >= (numPages - paginationCount / 2)-1) {
        pagination.push(createPagination(0));
        pagination.push({skip: true});
        for (let i=numPages-(paginationCount - 2); i<numPages; i++) {
          pagination.push(createPagination(i));
        }
      } else {
        pagination.push(createPagination(0));
        pagination.push({skip: true});
        const sidePages = Math.floor((paginationCount - 4) / 2);
        for (let i=currentPage-sidePages; i<=currentPage+sidePages; i++) {
          pagination.push(createPagination(i));
        }
        pagination.push({skip: true});
        pagination.push(createPagination(numPages-1));
      }
    }
    const countPreset = [ '6', '12', '24', '48', '96' ];

    res.render('home', {
      instanceName: state.hostConfig?.instanceName ?? 'Sonarr',
      events,
      ascending,
      currentPage,
      start: ascending ? (start + 1) : (totalEvents - start),
      end: ascending ? (end + 1) : (totalEvents - end),
      startEventId: events[0].id,
      endEventId: events[events.length-1].id,
      count: count,
      first: start === 0,
      last: end + 1 === totalEvents,
      pagination,
      total: totalEvents,
      sonarrBaseUrl: state.config.sonarrBaseUrl,
      countPreset,
      standardCount: countPreset.some(v => v === count.toString()),
      canClickEvents: true,
      helpers
    });
  });

  router.get('/event/:eventId?', async (req: Request, res: Response) => {
    const count = parseInteger(req.query.count as string, undefined);
    const ascending = req.query.sort === 'ascending';

    const eventId = req.params.eventId;
    const event = state.events[eventId];
    if (!event) {
      res.statusCode = 400;
      res.statusMessage = `Event ${eventId} not found`;
      res.render('eventnotfound', {
        eventId,
        count,
        ascending,
        helpers,
      });
    } else {

      if (event.event.series?.id !== undefined && !state.seriesData.has(event.event.series.id)) {
        await state.ensureSeries(new Set([ event.event.series?.id]));
      }
      res.render('event', {
        instanceName: state.hostConfig?.instanceName ?? 'Sonarr',
        event,
        count,
        ascending,
        sonarrBaseUrl: state.config.sonarrBaseUrl,
        helpers
      });
    }
  });


  return router;
}
