import { Config, Context, Event, ImageCache, SeriesResourceExt, SonarrApiConfig } from './types';
import { engine } from 'express-handlebars';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import express, { Express, Request, Response } from 'express';
import { JSONObject, WebHookPayload } from './sonarrApiV3';
import feed from './feed';
import { HealthTypes, arraysEqual, getSonarrApi, getSonarrHostConfig, isErrorWithCode, updateContextFromConfig, validateSonarrApiConfig, validateUserConfig } from './utils';
import { writeFile } from 'node:fs/promises';

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

function getSeriesImage(context: Context, series: SeriesResourceExt, filename: string, res: Response) {
  if (!series.cachedImages.has(filename)) {
    series.cachedImages.set(filename, {
      waiting: [],
      getting: false
    });
  }
  if (!context.sonarrApi) {
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
    });
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
  ApplicationUpdate: 'applicationUpdate',
  Download: 'download',
  EpisodeFileDelete: 'episodeFileDelete',
  Grab: 'grab',
  Health: 'health',
  HealthRestored: 'healthRestored',
  SeriesAdd: 'seriesAdd',
  SeriesDelete: 'seriesDelete',
  Test: 'test'
};

export function resolveUrlPath(context: Context, path: string)
{
  return `${context.urlBase}${path.startsWith('/') ? path.slice(1) : path}`;
}

export function resolveApplicationUrl(context: Context, path: string)
{
  return `${context.applicationUrl}${path.startsWith('/') ? path.slice(1) : path}`;
}

export async function ensureSeries(context: Context, seriesIds: Set<number>) {
  if (!context.sonarrApi) {
    return;
  }
  if (seriesIds.size) {
    const promises = [];
    for (const seriesId of seriesIds) {
      promises.push(context.sonarrApi.getJson<SeriesResourceExt>(`series/${seriesId}?includeSeasonImages=true`).then(data => {
        data.cachedImages = new Map<string, ImageCache>;
        context.seriesData.set(seriesId, data);
      }));
    }

    return Promise.all(promises).catch((e) => {
      console.log(`Error retrieving series data ${e}`);
    });
  }
}

export function generateHelpers(context: Context) {
  return {
    dateTime: (date: number) => {
      const d = new Date(date);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    },
    plusOne: (value: number) => {
      return value + 1;
    },
    eventPartial: (event: WebHookPayload) => {
      return eventTypePartials[event.eventType] ?? 'defaultType';
    },
    toHumanSize: (value: number) => {
      const i = Math.floor(Math.log(value) / Math.log(1024));
      return (value / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
    },
    ascendingQuery: (ascending: boolean) => {
      return ascending ? '?sort=ascending' : '';
    },
    browseUrl: (pageOrId: number|string|undefined, count: number|undefined, ascending: boolean|undefined, applicationUrl: boolean = false) => {
      let path = 'browse';
      if (pageOrId !== undefined) {
        path += `/${pageOrId}`;
        if (count !== undefined) {
          path += `/${count}`;
        }
      }
      if (ascending) {
        path += '?sort=ascending';
      }
      return applicationUrl ? resolveApplicationUrl(context, path) : resolveUrlPath(context, path);
    },
    nextUrl: (page: number, count: number, ascending: boolean, applicationUrl: boolean = false) => {
      const path = `browse/${Math.max(page+1, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
      return applicationUrl ? resolveApplicationUrl(context, path) : resolveUrlPath(context, path);
    },
    prevUrl: (page: number, count: number, ascending: boolean, applicationUrl: boolean = false) => {
      const path = `browse/${Math.max(page-1, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
      return applicationUrl ? resolveApplicationUrl(context, path) : resolveUrlPath(context, path);
    },
    eventUrl(eventId: string, count: number|undefined, ascending: boolean|undefined, applicationUrl: boolean = false) {
      let path = `event/${eventId}`;
      if (count || ascending) {
        path += '?';
        if (count) {
          path += `count=${count}`;
        }
        if (ascending) {
          path += `${count ? '&' : ''}sort=ascending`;
        }
      }
      return applicationUrl ? resolveApplicationUrl(context, path) : resolveUrlPath(context, path);
    },
    bannerUrl(seriedId: string, applicationUrl: boolean = false) {
      const path = `banner/${seriedId}`;
      return applicationUrl ? resolveApplicationUrl(context, path) : resolveUrlPath(context, path);
    },
    testSonarrUrl() {
      return resolveUrlPath(context, '/api/testSonarrUrl');
    },
    saveConfigUrl() {
      return resolveUrlPath(context, '/api/saveConfig');
    },
    showBanner(event: WebHookPayload) {
      return event.series && event.eventType !== 'SeriesDelete' && event.eventType !== 'Test' && context.seriesData.has(event.series.id);
    },
    ifEqual: (lhs: any, rhs: any, isTrue: any, isFalse: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      return lhs == rhs ? isTrue : isFalse;
    },
    ifInArray: (value:any, array: Array<any>, isFound: any, isNotFound: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      return array.findIndex(element => value === element) < 0 ? isNotFound : isFound;
    },
    colorScheme(forFeed: boolean) {
      if (forFeed) {
        return context.config.feedTheme === 'auto' ? 'light dark' : context.config.feedTheme;
      } else {
        return 'light dark';
      }
    },
    defaultColor(color: string, forFeed: boolean) {
      const isLight = !forFeed || context.config.feedTheme !== 'dark';
      return `var(--${isLight ? 'light' : 'dark'}-${color})`;
    },
    defaultColorInvert(color: string, forFeed: boolean) {
      const isDark = !forFeed || context.config.feedTheme !== 'dark';
      return `var(--${isDark ? 'dark' : 'light'}-${color})`;
    }
  };
}

export async function start(context: Context) {
  const app: Express = express();
  await feed.init(context);

  const helpers = generateHelpers(context);
  app.engine('handlebars', engine());
  app.set('view engine', 'handlebars');
  app.set('views', './src/views');

  app.use((req, res, next) => {
    if (!context.config.configured && req.method === 'GET') {
      res.render('config', {
        layout: 'config',
        context,
        helpers
      });
      return;
    }
    next();
  });

  app.get('/', (req: Request, res: Response) => {
    res.redirect(resolveUrlPath(context, 'browse'));
  });

  app.get('/config', (req: Request, res: Response) => {
    res.render('config', {
      layout: 'config',
      context,
      healthTypes: HealthTypes,
      helpers
    });
  });

  // get series banner image
  app.get('/banner/:seriesId', (req: Request, res: Response ) => {
    if (!context.sonarrApi) {
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
    getBanner(context, seriesId, res);
  });

  // History browsing
  app.get('/browse/:pageOrId?/:count?', async (req: Request, res: Response) => {
    if (!context.sonarrApi) {
      res.redirect(resolveUrlPath(context, 'config'));
      return;
    }
    // get and sanitise input parameters
    const totalEvents = context.history.length;
    const count = Math.max(parseInteger(req.params.count, 6), 1);
    const ascending = req.query.sort === 'ascending';
    const numPages = Math.ceil(totalEvents / count);
    const pageIsId = parseInteger(req.params.pageOrId, true);
    let currentPage: number;
    if (pageIsId === true) {
      // page isn't a number so is the ID of an event.
      // work out which page contains that event.
      const event = context.events[req.params.pageOrId];
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
      instanceName: context.hostConfig?.instanceName ?? 'Sonarr',
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
      sonarrBaseUrl: context.config.sonarrBaseUrl,
      countPreset,
      standardCount: countPreset.some(v => v === count.toString()),
      canClickEvents: true,
      helpers
    });
  });

  app.get('/event/:eventId?', async (req: Request, res: Response) => {
    if (!context.sonarrApi) {
      res.redirect(resolveUrlPath(context, 'config'));
      return;
    }
    const count = parseInteger(req.query.count as string, undefined);
    const ascending = req.query.sort === 'ascending';

    const eventId = req.params.eventId;
    const event = context.events[eventId];
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

      if (event.event.series?.id !== undefined && !context.seriesData.has(event.event.series.id)) {
        await ensureSeries(context, new Set([ event.event.series?.id]));
      }
      res.render('event', {
        instanceName: context.hostConfig?.instanceName ?? 'Sonarr',
        event,
        count,
        ascending,
        sonarrBaseUrl: context.config.sonarrBaseUrl,
        helpers
      });
    }
  });

  // Process webhooks from Sonarr
  app.use('/sonarr', express.json());

  const processEvent = async (req: Request, res: Response) => {
    const timestamp = Date.now();
    const id = `e${crypto.randomBytes(12).toString('hex')}`;
    const event: Event = {
      timestamp,
      id,
      index: context.history.length,
      event: req.body
    };
    context.history.push(event);
    context.events[event.id] = event;
    console.log(`New event: ${event.event.eventType}`);
    res.status(200);
    res.end('ok');

    if (event.event.series?.id !== undefined && !context.seriesData.has(event.event.series.id)) {
      ensureSeries(context, new Set([ event.event.series?.id]));
    }
    try {
      await context.feed.eventManager.processNew(event);
    } catch (e) {
      console.log(`Error sending event to feed: ${e}`);
    }

    writeFileSync(context.resolvedHistoryFile, JSON.stringify(context.history), { encoding: 'utf8' });
  };

  app.post('/sonarr', processEvent);
  app.put('/sonarr', processEvent);

  app.get('/api/ping', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end();
  });

  app.post('/api/testSonarrUrl', express.json(), async (req, res) => {
    const sonarrApi = req.body as SonarrApiConfig;
    if (!validateSonarrApiConfig(sonarrApi, true)) {
      res.statusCode = 400;
      res.statusMessage = 'Invalid Body';
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json; charset=UTF-8');
    try {
      const api = getSonarrApi(sonarrApi);
      const result = await getSonarrHostConfig(api);
      res.write(JSON.stringify({
        result: 'OK',
        instanceName: result.instanceName ?? 'Sonarr'
      }));
      res.end();
    } catch (message) {
      res.write(JSON.stringify({
        result: 'FAILED',
        message
      }));
      res.end();
    }
  });

  app.post('/api/saveConfig', express.json(), async (req, res) => {
    const postedConfig = req.body as Config;
    if (!validateUserConfig(postedConfig)) {
      res.statusCode = 400;
      res.statusMessage = 'Invalid Body';
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json; charset=UTF-8');
    try {
      const newConfig = { ...context.config };
      const initialConfig = !newConfig.configured;

      let changedListen = false;
      if (newConfig.port !== postedConfig.port) {
        newConfig.port = postedConfig.port;
        changedListen = true;
      }
      if (newConfig.address !== postedConfig.address) {
        newConfig.address = postedConfig.address;
        changedListen = true;
      }
      let regenerateFeed = false;
      const changedApplicationUrl = newConfig.applicationUrl !== postedConfig.applicationUrl;
      if (changedApplicationUrl) {
        newConfig.applicationUrl = postedConfig.applicationUrl;
        regenerateFeed = true;
      }
      const changedUrlBase = newConfig.urlBase !== postedConfig.urlBase;
      if (changedUrlBase) {
        newConfig.urlBase = postedConfig.urlBase;
      }
      let changedSonarrApi = false;
      if (newConfig.sonarrBaseUrl !== postedConfig.sonarrBaseUrl) {
        newConfig.sonarrBaseUrl = postedConfig.sonarrBaseUrl;
        changedSonarrApi = true;
      }
      if (newConfig.sonarrInsecure !== postedConfig.sonarrInsecure) {
        newConfig.sonarrInsecure = postedConfig.sonarrInsecure;
        changedSonarrApi = true;
      }
      if (newConfig.sonarrApiKey !== postedConfig.sonarrApiKey) {
        newConfig.sonarrApiKey = postedConfig.sonarrApiKey;
        changedSonarrApi = true;
      }
      if (newConfig.feedTheme !== postedConfig.feedTheme) {
        newConfig.feedTheme = postedConfig.feedTheme;
        regenerateFeed = true;
      }
      if (newConfig.feedHealthDelay !== postedConfig.feedHealthDelay) {
        newConfig.feedHealthDelay = postedConfig.feedHealthDelay;
        regenerateFeed = true;
      }
      if (!arraysEqual(newConfig.feedHealthDelayTypes, postedConfig.feedHealthDelayTypes)) {
        newConfig.feedHealthDelayTypes = postedConfig.feedHealthDelayTypes;
        regenerateFeed = true;
      }
      newConfig.configured = true;
      const responseData: JSONObject = {
        result: 'OK',
      };
      if (initialConfig || changedListen || changedApplicationUrl || changedUrlBase || changedSonarrApi || regenerateFeed) {
        // write out new config to config file.
        try {
          await writeFile(context.configFilename, JSON.stringify(newConfig, null, 2), { encoding: 'utf8' });
        } catch (e) {
          if (isErrorWithCode(e)) {
            // write file error, this is the only throw that should happen
            console.error(`Config file ${context.configFilename} cannot be written. ${e.code} ${e.message}`);
          } else if (e instanceof Error) {
            console.error(`Config file ${context.configFilename} cannot be written. ${e.message}`);
          } else {
            console.error(`Config file ${context.configFilename} cannot be written. ${e}`);
          }
          throw 'Could not write config file';
        }
        // update local config
        context.config = newConfig;

        await updateContextFromConfig(context);

        if (initialConfig || changedListen) {
          // restart server, will also restart feed
          console.log(`Server connection configuration changed. Restarting to listen on ${newConfig.address}:${newConfig.port}`);
          context.server.close(() => {
            start(context);
          });
          responseData.reload = true;
        } else {
          if (changedApplicationUrl) {
            responseData.reload = true;
          }
          if (regenerateFeed) {
            await feed.init(context);
          }
        }
        // other changes will be picked up immediately
      }
      // work out what we need to restart to use new config
      res.write(JSON.stringify(responseData));
      res.end();
    } catch (message) {
      res.write(JSON.stringify({
        result: 'FAILED',
        message
      }));
      res.end();
    }
  });

  app.get('/rss', (req: Request, res: Response) => {
    res.setHeader('content-type', 'application/xml; charset=UTF-8');
    res.write(context.feed.feed.rss2());
    res.end();
  });

  context.server = app.listen(context.config.port, context.config.address, () => {
    console.log(`[server]: Server is running at http://${context.config.address}:${context.config.port}`);
  });
}
