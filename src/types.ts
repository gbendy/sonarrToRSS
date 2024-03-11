import type { Feed } from 'feed';
import type { HostConfigResource, SeriesResouce, WebHookPayload, getApi } from './sonarrApiV3';
import type { Response } from 'express';
import type { Server } from 'node:http';
import { FeedEventManager } from './feedEventManager';

export interface SonarrApiConfig {
  sonarrBaseUrl: string;
  sonarrApiKey: string;
  sonarrInsecure: boolean;
}

export interface UserConfig extends SonarrApiConfig {
  port: number;
  address: string;
  applicationUrl: string;
  urlBase: string;
  feedTheme: 'auto' | 'light' | 'dark',
  feedHealthDelay: number,
  feedHealthDelayTypes: Array<string>
}

export interface Config extends UserConfig {
  historyFile: string;
  configured: boolean;
}

export interface Event {
  id: string;
  timestamp: number;
  index: number;
  event: WebHookPayload;
}

export type History = Array<Event>;
export type Events = Record<string, Event>;

export type ImageCache = {
  image?: Buffer;
  contentType?: string;
  waiting: Array<Response>;
  getting: boolean;
};

export interface SeriesResourceExt extends SeriesResouce {
  cachedImages: Map<string, ImageCache>;
}

export interface RSSFeed {
  feed: Feed;
  eventManager: FeedEventManager;
}

export type SonarrApi = ReturnType<typeof getApi>;

export interface Context {
  configFilename: string;
  config: Config;
  hostConfig?: HostConfigResource;
  sonarrApi?: SonarrApi;
  urlBase: string;
  applicationUrl: string;
  resolvedHistoryFile: string;
  history: History;
  events: Events;
  seriesData: Map<number, SeriesResourceExt>;
  feed: RSSFeed;
  server: Server;
}
