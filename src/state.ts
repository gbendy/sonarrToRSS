import { Config, Events, History, ImageCache, RSSFeed, SeriesResourceExt, SonarrApi } from './types';
import { HostConfigResource, WebHookPayload } from './sonarrApiV3';
import { getSonarrApi, getSonarrHostConfig, isErrorWithCode, randomString } from './utils';
import type { Server } from 'node:http';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { Request } from 'express';
import { forCategory } from './logger';

const logger = forCategory('state');

const eventTypePartials = {
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


export class State {
  configFilename: string;
  config: Config;
  urlBase: string = '';
  applicationUrl: string = '';
  resolvedHistoryFile: string;
  resolvedPasswordFile: string;
  resolvedSessionDirectory: string;
  history!: History;
  events!: Events;
  seriesData: Map<number, SeriesResourceExt> = new Map<number, SeriesResourceExt>;
  feed!: RSSFeed;
  server!: Server;
  passportStrategies: { local: string, basic: string };
  hostConfig?: HostConfigResource;
  sonarrApi?: SonarrApi;
  pingId!: string;

  constructor(
    configFilename: string,
    config: Config,
  ) {
    this.configFilename = configFilename;
    this.config = config;

    this.passportStrategies = { local: '', basic: '' };

    this.resolvedHistoryFile = path.resolve(this.config.historyFile);
    this.resolvedPasswordFile = path.resolve(this.config.passwordFile);
    this.resolvedSessionDirectory = path.resolve(this.config.sessionDirectory);

    this.regeneratePingId();
  }

  async updateFromConfig() {
    this.sonarrApi = undefined;
    if (this.config.sonarrBaseUrl && this.config.sonarrApiKey) {
      try {
        this.sonarrApi = getSonarrApi(this.config);
      } catch {} // eslint-disable-line no-empty
    }

    this.urlBase = this.config.urlBase;
    // URL base must start and end with a /
    if (this.urlBase) {
      if (this.urlBase !== '/') {
        if (!this.urlBase.startsWith('/')) {
          this.urlBase = '/' + this.urlBase;
        }
        if (!this.urlBase.endsWith('/')) {
          this.urlBase = this.urlBase + '/';
        }
      }
    } else {
      this.urlBase = '/';
    }
    // Application URL must end with a /
    this.applicationUrl = this.config.applicationUrl;
    if (this.applicationUrl) {
      if (!this.applicationUrl.endsWith('/')) {
        this.applicationUrl = this.applicationUrl + '/';
      }
    } else {
      this.applicationUrl = this.urlBase;
    }

    if (this.sonarrApi) {
      try {
        this.hostConfig = await getSonarrHostConfig(this.sonarrApi);
      } catch {
        // get config failed so assume API is unusable
        this.sonarrApi = undefined;
      }
    }
  }

  #loadHistory() {
    return readFile(this.resolvedHistoryFile,  { encoding: 'utf8' }).then(historyJson => {
      this.history = JSON.parse(historyJson);
      this.events = this.history.reduce((events, event, index) => {
        event.index = index;
        events[event.id] = event;
        return events;
      }, {} as Events);
    }).catch((e) => {
      if (isErrorWithCode(e)) {
        // readFile error, no file is OK since we assume no events have been processed yet
        if (e.code !== 'ENOENT') {
          logger.warn(`History file ${this.resolvedHistoryFile} cannot be read. ${e.message}`);
          logger.warn('Starting with empty history');
        }
      } else if (e instanceof Error) {
        // JSON parse error
        logger.warn(`History file ${this.resolvedHistoryFile} cannot be read. ${e.message}`);
        logger.warn('Starting with empty history');
      } else {
        logger.warn(`History file ${this.resolvedHistoryFile} cannot be read. ${e}`);
        logger.warn('Starting with empty history');
      }

      this.history = [];
    });
  }

  async init() {
    await this.updateFromConfig();
    await this.#loadHistory();
    if (this.config.sessionSecrets.length === 0) {
      this.config.sessionSecrets.push(await randomString(32, 's'));
    }
    return this;
  }

  async ensureSeries(seriesIds: Set<number>) {
    if (!this.sonarrApi) {
      return;
    }
    if (seriesIds.size) {
      const promises = [];
      for (const seriesId of seriesIds) {
        promises.push(this.sonarrApi.getJson<SeriesResourceExt>(`series/${seriesId}?includeSeasonImages=true`).then(data => {
          data.cachedImages = new Map<string, ImageCache>;
          this.seriesData.set(seriesId, data);
        }));
      }

      return Promise.all(promises).catch((e) => {
        logger.info(`Error retrieving series data ${e}`);
      });
    }
  }

  resolveUrlPath(path: string)
  {
    return `${this.urlBase}${path.startsWith('/') ? path.slice(1) : path}`;
  }

  resolveApplicationUrl(path: string)
  {
    return `${this.applicationUrl}${path.startsWith('/') ? path.slice(1) : path}`;
  }

  get handlebarsHelpers() {
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
        return applicationUrl ? this.resolveApplicationUrl(path) : this.resolveUrlPath(path);
      },
      nextUrl: (page: number, count: number, ascending: boolean, applicationUrl: boolean = false) => {
        const path = `browse/${Math.max(page+1, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
        return applicationUrl ? this.resolveApplicationUrl(path) : this.resolveUrlPath(path);
      },
      prevUrl: (page: number, count: number, ascending: boolean, applicationUrl: boolean = false) => {
        const path = `browse/${Math.max(page-1, 0)}/${count}${ascending ? '?sort=ascending' : ''}`;
        return applicationUrl ? this.resolveApplicationUrl(path) : this.resolveUrlPath(path);
      },
      eventUrl: (eventId: string, count: number|undefined, ascending: boolean|undefined, applicationUrl: boolean = false) => {
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
        return applicationUrl ? this.resolveApplicationUrl(path) : this.resolveUrlPath(path);
      },
      bannerUrl: (seriedId: string, applicationUrl: boolean = false) => {
        const path = `banner/${seriedId}`;
        return applicationUrl ? this.resolveApplicationUrl(path) : this.resolveUrlPath(path);
      },
      testSonarrUrl: () => {
        return this.resolveUrlPath('/api/testSonarrUrl');
      },
      saveConfigUrl: () => {
        return this.resolveUrlPath('/api/saveConfig');
      },
      localUrl: (url: string) => {
        return this.resolveUrlPath(url);
      },
      showBanner: (event: WebHookPayload) => {
        return event.series && event.eventType !== 'SeriesDelete' && event.eventType !== 'Test' && this.seriesData.has(event.series.id);
      },
      ifEqual: (lhs: any, rhs: any, isTrue: any, isFalse: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        return lhs == rhs ? isTrue : isFalse;
      },
      ifInArray: (value:any, array: Array<any>, isFound: any, isNotFound: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        return array.findIndex(element => value === element) < 0 ? isNotFound : isFound;
      },
      colorScheme: (forFeed: boolean) => {
        if (forFeed) {
          return this.config.feedTheme === 'auto' ? 'light dark' : this.config.feedTheme;
        } else {
          return 'light dark';
        }
      },
      defaultColor: (color: string, forFeed: boolean) => {
        const isLight = !forFeed || this.config.feedTheme !== 'dark';
        return `var(--${isLight ? 'light' : 'dark'}-${color})`;
      },
      defaultColorInvert: (color: string, forFeed: boolean) => {
        const isDark = !forFeed || this.config.feedTheme !== 'dark';
        return `var(--${isDark ? 'dark' : 'light'}-${color})`;
      }
    };
  }

  handlebarOptions(options: Record<string,unknown>, req: Request & { isAuthenticated?: () => boolean }) {
    if (!options.helpers) {
      options.helpers = this.handlebarsHelpers;
    }
    options.instanceName = this.hostConfig?.instanceName ?? 'Sonarr';
    options.sonarrBaseUrl =  this.config.sonarrBaseUrl;
    options.config = this.config;
    options.hostConfig = this.hostConfig;
    options.authenticated = req.isAuthenticated?.();
    return options;
  }

  regeneratePingId() {
    this.pingId = randomString();
  }

  static async create(defaultConfig: Config) {
    const configFilename = path.resolve(process.argv.length > 2 ? process.argv[2] : './config.json');
    const config = { ...defaultConfig };
    try {
      const configJson = await readFile(configFilename,  { encoding: 'utf8' });
      Object.assign(config, JSON.parse(configJson));
    } catch (e) {
      if (isErrorWithCode(e)) {
        // readFile error, no file is OK since we'll show config UI
        if (e.code !== 'ENOENT') {
          throw `Config file ${configFilename} cannot be read. ${e.message}`;
        }
      } else if (e instanceof Error) {
        // JSON parse error
        throw `Config file ${configFilename} cannot be read. ${e.message}`;
      } else {
        throw e;
      }
    }
    const state = new State(configFilename, config);

    try {
      await mkdir(state.resolvedSessionDirectory, { recursive: true, mode: 0o700 });
    } catch (e) {
      if (e instanceof Error) {
        throw `Failed to create session directory ${state.resolvedSessionDirectory}. ${e.message}`;
      } else {
        throw e;
      }
    }

    return state.init();
  }
}

