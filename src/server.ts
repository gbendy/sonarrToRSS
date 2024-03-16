import { State } from './state';
import { engine } from 'express-handlebars';
import express, { Express } from 'express';
import { WebHookPayload } from './sonarrApiV3';
import feed from './feed';
import { forCategory } from './logger';
import api from './routes/api';
import sonarr from './routes/sonarr';
import feeds from './routes/feeds';
import browse from './routes/browse';

const logger = forCategory('server');

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

export function generateHelpers(state: State) {
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
      return applicationUrl ? state.resolveApplicationUrl(path) : state.resolveUrlPath(path);
    },
    nextUrl: (page: number, count: number, ascending: boolean, applicationUrl: boolean = false) => {
      const path = `browse/${Math.max(page+1, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
      return applicationUrl ? state.resolveApplicationUrl(path) : state.resolveUrlPath(path);
    },
    prevUrl: (page: number, count: number, ascending: boolean, applicationUrl: boolean = false) => {
      const path = `browse/${Math.max(page-1, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
      return applicationUrl ? state.resolveApplicationUrl(path) : state.resolveUrlPath(path);
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
      return applicationUrl ? state.resolveApplicationUrl(path) : state.resolveUrlPath(path);
    },
    bannerUrl(seriedId: string, applicationUrl: boolean = false) {
      const path = `banner/${seriedId}`;
      return applicationUrl ? state.resolveApplicationUrl(path) : state.resolveUrlPath(path);
    },
    testSonarrUrl() {
      return state.resolveUrlPath('/api/testSonarrUrl');
    },
    saveConfigUrl() {
      return state.resolveUrlPath('/api/saveConfig');
    },
    showBanner(event: WebHookPayload) {
      return event.series && event.eventType !== 'SeriesDelete' && event.eventType !== 'Test' && state.seriesData.has(event.series.id);
    },
    ifEqual: (lhs: any, rhs: any, isTrue: any, isFalse: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      return lhs == rhs ? isTrue : isFalse;
    },
    ifInArray: (value:any, array: Array<any>, isFound: any, isNotFound: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      return array.findIndex(element => value === element) < 0 ? isNotFound : isFound;
    },
    colorScheme(forFeed: boolean) {
      if (forFeed) {
        return state.config.feedTheme === 'auto' ? 'light dark' : state.config.feedTheme;
      } else {
        return 'light dark';
      }
    },
    defaultColor(color: string, forFeed: boolean) {
      const isLight = !forFeed || state.config.feedTheme !== 'dark';
      return `var(--${isLight ? 'light' : 'dark'}-${color})`;
    },
    defaultColorInvert(color: string, forFeed: boolean) {
      const isDark = !forFeed || state.config.feedTheme !== 'dark';
      return `var(--${isDark ? 'dark' : 'light'}-${color})`;
    }
  };
}

export async function start(state: State) {
  const app: Express = express();
  await feed.init(state);

  app.engine('handlebars', engine());
  app.set('view engine', 'handlebars');
  app.set('views', './src/views');

  if (!state.config.configured) {
    const helpers = generateHelpers(state);

    app.get('*', (req, res) => {
      res.render('config', {
        layout: 'config',
        state: state,
        helpers
      });
      return;
    });
    app.use('/api/', api(state));
  } else {
    app.use(browse(state));
    app.use(feeds(state));
    app.use(sonarr(state));
    app.use('/api/', api(state));
  }

  state.server = app.listen(state.config.port, state.config.address, () => {
    logger.info(`Server is running at http://${state.config.address}:${state.config.port}`);
  });
}
