import { Context, ImageCache, SeriesResourceExt } from './types';
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
function parseInteger(str: string, defaultValue: undefined): undefined
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


const eventTypeNames: Record<string, string> = {
  SeriesAdd: 'Series added',
  Grab: 'Episode grabbed',
  Download: 'Episode downloaded'
};

const helpers = {
  dateTime: (date: number) => {
    const d = new Date(date);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  },
  eventType: (eventType: string) => {
    return eventTypeNames[eventType] ?? eventType;  
  },
  isSeriesAdded: (entry: WebHookPayload) => {
    return entry.eventType === 'SeriesAdd';
  },
  isGrab: (entry: WebHookPayload) => {
    return entry.eventType === 'Grab';
  },
  isDownload: (entry: WebHookPayload) => {
    return entry.eventType === 'Download';
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
  switchSortUrl: (start: number, count: number, ascending: boolean) => {
    return `/browse/${start-1}/${count}${!ascending ? '?sort=ascending' : ''}`;
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
  selectedIf: (lhs: any, rhs: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    return lhs == rhs ? 'selected' : '';
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

  // History browsing
  app.get('/browse/:start?/:count?', async (req: Request, res: Response) => {
    const start = Math.max(parseInteger(req.params.start, 0), 0);
    const count = parseInteger(req.params.count, 6);
    const ascending = req.query.sort === 'ascending';

    const first = ascending ?
      start :
      Math.max(context.history.length - start - count, 0);
    const records = context.history.slice(first, first + count);
    if (!ascending) {
      records.reverse();
    }
    const seriesIds = records.reduce((store, e) => {
      if (e.entry.series?.id && !context.seriesData.has(e.entry.series?.id)) {
        store.add(e.entry.series.id);
      }
      return store;
    }, new Set<number>()) as Set<number>;
    if (seriesIds.size) {
      const promises = [];
      for (const seriesId of seriesIds) {
        promises.push(context.sonarrApi.getJson<SeriesResourceExt>(`series/${seriesId}?includeSeasonImages=true`).then(data => {
          data.cachedImages = new Map<string, ImageCache>;
          context.seriesData.set(seriesId, data);
        }));        
      }
      try {
        await Promise.all(promises);
      } catch(e) {
        console.log(`Error retrieving series data`);
      }
    }
    const end = start+count >= context.history.length ? context.history.length-1 : start + count - 1;
    const finalCount = end - start;
    res.render('home', {
      instanceName: context.hostConfig?.instanceName ?? 'Sonarr',
      records,
      ascending,
      start: start+1,
      end: end + 1,
      count: count,
      recordCount: finalCount,
      first: start === 0,
      last: end + 1 === context.history.length,
      prevCount: Math.min(start, count),
      nextCount: Math.min(context.history.length - 1 - end, count),
      total: context.history.length,
      sonarrBaseUrl: context.config.sonarrBaseUrl,
      countOptions: [ "6", "12", "24", "48", "96" ],
      helpers
    });
  });
  
  // Process webhooks from Sonarr
  app.use('/sonarr', express.json());
  app.post('/sonarr', (req: Request, res: Response) => {
    const timestamp = Date.now();
    const id = crypto.randomBytes(12).toString("hex");
    const record = {
      timestamp,
      id,
      entry: req.body
    };
    context.history.push(record);
    console.log(`New activity: ${record.entry.eventType}`);
    res.status(200);
    res.end('ok');

    writeFileSync(context.config.historyFile, JSON.stringify(context.history), { encoding: 'utf8' });
  });
  
  app.listen(context.config.port, context.config.host, () => {
    console.log(`[server]: Server is running at http://${context.config.host}:${context.config.port}`);
  });
}
