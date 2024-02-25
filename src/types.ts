import type { Feed } from 'feed';
import type { HostConfigResource, SeriesResouce, WebHookPayload, getApi } from './sonarrApiV3';
import type { Response } from 'express';
import type { ExpressHandlebars } from 'express-handlebars';

export interface Config {
  sonarrBaseUrl: string;
  apiKey: string;
  port: number;
  host: string;
  historyFile: string;
  applicationUrl: string;
  urlBase: string;
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
  handlebars: ExpressHandlebars;
}

export interface Context {
  config: Config;
  hostConfig: HostConfigResource;
  sonarrApi: ReturnType<typeof getApi>;
  history: History;
  events: Events;
  seriesData: Map<number, SeriesResourceExt>;
  feed: RSSFeed;
}
