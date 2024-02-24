import { Context, Event, ImageCache, SeriesResourceExt } from './types';
import { engine } from 'express-handlebars';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import express, { Express, Request, Response } from 'express';
import { WebHookPayload } from './sonarrApiV3';

/**
 * Parses the given string and returns it as an Integer.
 * Defaults to defaultvalue if parsing fails
 */
function parseInteger(str: string, defaultValue: number): number
function parseInteger(str: string, defaultValue: undefined): number | undefined
function parseInteger(str: string, defaultValue: number|undefined)
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

function getSeriesImage(context: Context, series: SeriesResourceExt, filename: string, res: Response) {
  if (!series.cachedImages.has(filename)) {
    series.cachedImages.set(filename, {
      waiting: [],
      getting: false
    });
  }
  const cache = series.cachedImages.get(filename) as ImageCache;
  if (cache.image) {
    sendBuffer(cache.image, cache.contentType, res);
    return;
  }
  cache.waiting.push(res);
  if (!cache.getting) {
    cache.getting = true;
    context.sonarrApi.getBuffer(`mediacover/${series.id}/${filename}`).then(r => {
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
    })
  }
}

function getBanner(context: Context, seriesId: number, res: Response) {
  const series = context.seriesData.get(seriesId);
  if (series === undefined) {
    res.statusCode = 404;
    res.end();
    return;
  }
  getSeriesImage(context, series, 'banner.jpg', res);
}

const eventTypePartials: Record<string, string> = {
  SeriesAdd: 'seriesAdd',
  Grab: 'grab',
  Download: 'download'
};

const helpers = {
  dateTime: (date: number) => {
    const d = new Date(date);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  },
  eventPartial: (event: WebHookPayload) => {
    return eventTypePartials[event.eventType] ?? 'defaultType';
  },
  toHumanSize: (value: number) => {
    const i = Math.floor(Math.log(value) / Math.log(1024));
    return (value / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
  },
  startUrl: (start: number) => {
    return `/browse/${start-1}`;
  },
  defaultSortedUrl: (start: number, count: number) => {
    return `/browse/${start-1}/${count}`;
  },
  ascendingQuery: (ascending: boolean) => {
    return ascending ? '?sort=ascending' : ''
  },
  browseUrl: (start: number, count: number, ascending: boolean) => {
    return `/browse/${start-1}/${count}${ascending ? '?sort=ascending' : ''}`;
  },
  ascendingUrl: (start: number, count: number) => {
    return `/browse/${start-1}/${count}?sort=ascending`;
  },
  descendingUrl: (start: number, count: number) => {
    return `/browse/${start-1}/${count}`;
  },
  nextUrl: (start: number, count: number, ascending: boolean) => {
    return `/browse/${Math.max(start-1+count, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
  },
  prevUrl: (start: number, count: number, ascending: boolean) => {
    return `/browse/${Math.max(start-1-count, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
  },
  ifEqual: (lhs: any, rhs: any, isTrue: any, isFalse: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    return lhs == rhs ? isTrue : isFalse;
  }
};

export async function start(context: Context) {
  const app: Express = express();
  app.engine('handlebars', engine());
  app.set('view engine', 'handlebars');
  app.set('views', './src/views');

  app.get('/', (req: Request, res: Response) => {
    res.redirect('/browse/');
  });

  // get series banner image
  app.get('/banner/:seriesId', (req: Request, res: Response ) => {
    const seriesId = parseInteger(req.params.seriesId, undefined);
    if (seriesId === undefined) {
      res.statusCode = 400;
      res.end();
      return;
    }
    getBanner(context, seriesId, res);
  });

  const ensureSeries = (context: Context, seriesIds: Set<number>) => {
    if (seriesIds.size) {
      const promises = [];
      for (const seriesId of seriesIds) {
        promises.push(context.sonarrApi.getJson<SeriesResourceExt>(`series/${seriesId}?includeSeasonImages=true`).then(data => {
          data.cachedImages = new Map<string, ImageCache>;
          context.seriesData.set(seriesId, data);
        }));
      }

      return Promise.all(promises).catch(() => {
        console.log('Error retrieving series data');
      });
    }
  };

  // History browsing
  app.get('/browse/:start?/:count?', async (req: Request, res: Response) => {
    // get and sanitise input parameters
    const totalEvents = context.history.length;
    const start = Math.min(Math.max(parseInteger(req.params.start, 0), 0), totalEvents-1);
    const count = Math.max(parseInteger(req.params.count, 6), 1);
    const ascending = req.query.sort === 'ascending';

    const numEvents = Math.min(totalEvents - start, count);

    // select events to show
    const first = ascending ?
      start :
      Math.max(totalEvents - start - count, 0);

    const events = context.history.slice(first, first + numEvents);
    if (!ascending) {
      events.reverse();
    }

    // fetch series info so we can show banners
    const seriesIds = events.reduce((store, e) => {
      if (e.event.series?.id && !context.seriesData.has(e.event.series?.id)) {
        store.add(e.event.series.id);
      }
      return store;
    }, new Set<number>()) as Set<number>;

    await ensureSeries(context, seriesIds);

    // Calculate pagination data
    const end = start+count >= totalEvents ? totalEvents-1 : start + count - 1;
    const numPages = Math.ceil(totalEvents / count);
    const pagination = [];
    const paginationCount = 9; // must be odd
    const currentPage = Math.floor(start / count)
    function createPagination(page: number) {
      return {
        label: page + 1,
        start: page * count + 1,
        active: currentPage === page
      }
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
      instanceName: context.hostConfig?.instanceName ?? 'Sonarr',
      events,
      ascending,
      start: start+1,
      end: end + 1,
      count: count,
      first: start === 0,
      last: end + 1 === totalEvents,
      prevCount: Math.min(start, count),
      nextCount: Math.min(totalEvents - 1 - end, count),
      pagination,
      total: totalEvents,
      sonarrBaseUrl: context.config.sonarrBaseUrl,
      countPreset,
      standardCount: countPreset.some(v => v === count.toString()),
      canClickEvents: true,
      helpers
    });
  });

  app.get('/event/:eventId?', async (req: Request, res: Response) => {
    const eventId = req.params.eventId;
    const event = context.events[eventId];
    if (!event) {
      res.statusCode = 400;
      res.statusMessage = `Event ${eventId} not found`;
      res.render('eventnotfound', {
        eventId
      });
    } else {

      if (event.event.series?.id) {
        await ensureSeries(context, new Set([ event.event.series?.id]))
      }
      res.render('event', {
        instanceName: context.hostConfig?.instanceName ?? 'Sonarr',
        event: {
          ...event,
          indexDisplay: event.index + 1,
          ascendingIndex: context.history.length - event.index - 1,
          ascendingIndexDisplay: context.history.length - event.index
        },
        sonarrBaseUrl: context.config.sonarrBaseUrl,
        helpers
      });
    }
  });

  // Process webhooks from Sonarr
  app.use('/sonarr', express.json());

  const processEvent = (req: Request, res: Response) => {
    const timestamp = Date.now();
    const id = crypto.randomBytes(12).toString('hex');
    const event: Event = {
      timestamp,
      id,
      index: context.history.length,
      event: req.body
    };
    context.history.push(event);
    context.events[event.id] = event;
    console.log(`New activity: ${event.event.eventType}`);
    res.status(200);
    res.end('ok');

    writeFileSync(context.config.historyFile, JSON.stringify(context.history), { encoding: 'utf8' });
  };

  app.post('/sonarr', processEvent);
  app.put('/sonarr', processEvent);

  app.listen(context.config.port, context.config.host, () => {
    console.log(`[server]: Server is running at http://${context.config.host}:${context.config.port}`);
  });
}
