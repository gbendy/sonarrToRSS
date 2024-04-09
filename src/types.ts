import type { WebHookPayload, getApi } from './sonarrApiV3';
import type { Feed, EventManager } from './feed';

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
  username: string;
  sessionExpire: number;
  feedTitle: string;
  feedTheme: 'auto' | 'light' | 'dark';
  feedHealthDelay: number;
  feedHealthDelayTypes: Array<string>;
  feedRss: boolean;
  feedAtom: boolean;
  feedJson: boolean;
  discardResolvedHealthEvents: boolean;
  maxImageCacheSize: number;
}

export interface Config extends UserConfig {
  historyFile: string;
  sessionDirectory: string;
  passwordFile: string;
  sessionSecrets: Array<string>;
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

export interface RSSFeed {
  feed: Feed;
  eventManager: EventManager;
}

export type SonarrApi = ReturnType<typeof getApi>;
