import { HostConfigResource } from './sonarrApiV3';
import { Config, Events, History, ImageCache, RSSFeed, SeriesResourceExt, SonarrApi } from './types';
import type { Server } from 'node:http';
import { getSonarrApi, getSonarrHostConfig, isErrorWithCode, randomString } from './utils';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { forCategory } from './logger';

const logger = forCategory('state');

export class State {
  configFilename: string;
  config: Config;
  urlBase: string = '';
  applicationUrl: string = '';
  resolvedHistoryFile: string;
  history!: History;
  events!: Events;
  seriesData: Map<number, SeriesResourceExt> = new Map<number, SeriesResourceExt>;
  feed!: RSSFeed;
  server!: Server;
  hostConfig?: HostConfigResource;
  sonarrApi?: SonarrApi;
  pingId!: string;

  constructor(
    configFilename: string,
    config: Config,
  ) {
    this.configFilename = configFilename;
    this.config = config;

    this.resolvedHistoryFile = path.resolve(this.config.historyFile);
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
    return state.init();
  }

  regeneratePingId() {
    this.pingId = randomString();
  }
}


