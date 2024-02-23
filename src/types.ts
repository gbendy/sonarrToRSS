import type { HostConfigResource, SeriesResouce, WebHookPayload, getApi } from "./sonarrApiV3";
import type { Response } from "express";

export interface Config {
  sonarrBaseUrl: string;
  apiKey: string;
  port: number;
  host: string;
  historyFile: string;
}

export interface Event {
  id: string;
  timestamp: number;
  event: WebHookPayload;
}

export type History = Array<Event>;

export type ImageCache = {
  image?: Buffer;
  contentType?: string;
  waiting: Array<Response>;
  getting: boolean;
};

export interface SeriesResourceExt extends SeriesResouce {
  cachedImages: Map<string, ImageCache>;
}

export interface Context {
  config: Config;
  hostConfig: HostConfigResource;
  sonarrApi: ReturnType<typeof getApi>;
  history: History;
  seriesData: Map<number, SeriesResourceExt>;
}
