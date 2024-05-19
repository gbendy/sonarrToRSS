import { Config, Events, History, RSSFeed, SonarrApi } from './types';
import { HostConfigResource, SeriesResource, WebHookPayload } from './sonarrApiV3';
import { getSonarrApi, getSonarrHostConfig, isErrorWithCode, randomString, validateUserConfig } from './utils';
import type { Server } from 'node:http';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { Request } from 'express';
import { forCategory, setLevel } from './logger';
import version from './version';
import { ImageCache } from './imageCache';

const logger = forCategory('state');

const eventTypePartials = {
  ApplicationUpdate: 'applicationUpdate',
  Download: 'download',
  EpisodeFileDelete: 'episodeFileDelete',
  Grab: 'grab',
  Health: 'health',
  HealthRestored: 'healthRestored',
  ManualInteractionRequired: 'manualInteractionRequired',
  Rename: 'rename',
  SeriesAdd: 'seriesAdd',
  SeriesDelete: 'seriesDelete',
  Test: 'test'
};


export class State {
  configFilename: string;
  config: Config;
  urlBase: string = '';
  applicationUrl: string = '';
  dataDirectory: string;
  resolvedHistoryFile: string;
  resolvedPasswordFile: string;
  resolvedSessionDirectory: string;
  history!: History;
  events!: Events;
  seriesData: Map<number, SeriesResource> = new Map<number, SeriesResource>;
  queuedSeriesData: Map<number, Promise<void>> = new Map<number, Promise<void>>;
  feed!: RSSFeed;
  server!: Server;
  passportStrategies: { local: string, basic: string };
  hostConfig?: HostConfigResource;
  sonarrApi?: SonarrApi;
  pingId!: string;
  imageCache: ImageCache;

  constructor(
    configFilename: string,
    config: Config,
  ) {
    this.configFilename = path.resolve(configFilename);
    this.config = config;

    this.passportStrategies = { local: '', basic: '' };

    this.dataDirectory = path.dirname(this.configFilename);
    logger.info(`Data directory: ${this.dataDirectory}`);
    this.resolvedHistoryFile = path.join(this.dataDirectory, this.config.historyFile);
    this.resolvedPasswordFile = path.join(this.dataDirectory, this.config.passwordFile);
    this.resolvedSessionDirectory = path.join(this.dataDirectory, this.config.sessionDirectory);

    this.imageCache = new ImageCache(this);

    this.regeneratePingId();
  }

  get version() {
    return version;
  }

  async updateFromConfig() {
    this.sonarrApi = undefined;
    await this.ensureSonarrApi();

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
  }

  async ensureSonarrApi() {
    if (!this.sonarrApi && this.config.sonarrBaseUrl && this.config.sonarrApiKey) {
      try {
        // there should be a Sonarr Api but isn't
        this.hostConfig = undefined;
        this.sonarrApi = getSonarrApi(this.config);
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
      this.events = {};
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

  /**
   * Makes sure that we have series data for the given series ids
   * @param seriesIds
   * @returns
   */
  async ensureSeries(seriesIds: Set<number>) {
    await this.ensureSonarrApi();
    if (!this.sonarrApi) {
      return;
    }
    if (seriesIds.size) {
      const promises = [];
      for (const seriesId of seriesIds) {
        if (this.seriesData.has(seriesId)) {
          continue;
        }
        if (!this.queuedSeriesData.has(seriesId)) {
          this.queuedSeriesData.set(seriesId, this.sonarrApi.getJson<SeriesResource>(`series/${seriesId}?includeSeasonImages=true`).then(data => {
            this.seriesData.set(seriesId, data);
            this.queuedSeriesData.delete(seriesId);
          }));
        }
        promises.push(this.queuedSeriesData.get(seriesId));
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

  get rssUrl() {
    return '/rss';
  }

  get atomUrl() {
    return '/atom';
  }

  get jsonUrl() {
    return '/json';
  }

  get sonarrUrl() {
    return '/sonarr';
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
      localUrl: (url: string) => {
        return this.resolveUrlPath(url);
      },
      applicationUrl: (url: string) => {
        return this.resolveApplicationUrl(url);
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

  handlebarOptions(options: Record<string,unknown>, req: Request) {
    if (!options.helpers) {
      options.helpers = this.handlebarsHelpers;
    }
    if (!options.title) {
      options.title = 'Sonarr Webhooks';
    }
    options.instanceName = this.hostConfig?.instanceName ?? 'Sonarr';
    options.sonarrBaseUrl =  this.config.sonarrBaseUrl;
    options.config = this.config;
    options.hostConfig = this.hostConfig;
    options.authenticated = req.isAuthenticated?.();
    options.version = version;
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
      const validation = validateUserConfig(config, true);
      if (validation.warnings.length) {
        for (const message of validation.warnings) {
          logger.warn(message);
        }
      }
      if (validation.errors.length) {
        for (const message of validation.errors) {
          logger.error(message);
        }
        throw 'Invalid config';
      }
      setLevel(config.logLevel);
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


