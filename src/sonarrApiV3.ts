import https from 'node:https';
import http, { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { urlToHttpOptions } from 'node:url';

export interface AddSeriesOptions {
  ignoreEpisodesWithFiles: boolean;
  ignoreEpisodesWithoutFiles: boolean;
  monitor: 'unknown' | 'all' | 'future' | 'missing' | 'existing' | 'firstSeason' | 'lastSeason' | 'latestSeason' | 'pilot' | 'recent' | 'monitorSpecials' | 'unmonitorSpecials' | 'none';
  searchForMissingEpisodes: boolean;
  searchForCutoffUnmetEpisodes: boolean;
}

export interface AlternateTitleResource {
  title?: string;
  seasonNumber?: number;
  sceneSeasonNumber?: number;
  sceneOrigin?: string;
  comment?: string;
}

export interface SelectOption {
  value:number;
  name?: string;
  order:number;
  hint?: string;
}

export type PrivacyLevelEnum = 'normal' | 'password' | 'apiKey' | 'userName';

export interface Field {
order: number;
name?: string;
label?: string;
unit?: string;
helpText?: string;
helpTextWarning?: string;
helpLink?: string;
value?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
type?: string;
advanced: boolean;
selectOptions?: SelectOption;
selectOptionsProviderAction?: string;
section?: string;
hidden?: string;
privacy: PrivacyLevelEnum;
placeholder?: string;
isFloat: boolean;
}

export interface CustomFormatSpecificationSchema {
  id: number;
  name?: string;
  implementation?: string;
  implementationName?: string;
  infoLink?: string;
  negate: boolean;
  required: boolean;
  fields: Array<Field>;
  presets?: Array<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CustomFormatResource {
  id:	number;
  name?:	string;
  includeCustomFormatWhenRenaming?:	boolean;
  specifications?: Array<CustomFormatSpecificationSchema>;
}

export interface HostConfigResource {
  id: number;
  bindAddress?: string;
  port: number;
  sslPort: number;
  enableSsl: boolean;
  launchBrowser: boolean;
  authenticationMethod:  'none | basic | forms | external';
  authenticationRequired: 'enabled' | 'disabledForLocalAddresses';
  analyticsEnabled: boolean;
  username?: string;
  password?: string;
  passwordConfirmation?: string;
  logLevel?: string;
  consoleLogLevel?: string;
  branch?: string;
  apiKey?: string;
  sslCertPath?: string;
  sslCertPassword?: string;
  urlBase?: string;
  instanceName?: string;
  applicationUrl?: string;
  updateAutomatically: boolean;
  updateMechanism: 'builtIn' | 'script' | 'external' | 'apt' | 'docker';
  updateScriptPath?: string;
  proxyEnabled: boolean;
  proxyType: 'http' | 'socks4' | 'socks5';
  proxyHostname?: string;
  proxyPort: number;
  proxyUsername?: string;
  proxyPassword?: string;
  proxyBypassFilter?: string;
  proxyBypassLocalAddresses: boolean;
  certificateValidation:	'enabled' | 'disabledForLocalAddresses' | 'disabled';
  backupFolder?: string;
  backupInterval: number;
  backupRetention: number;
}

export interface Language {
  id: number;
  name: string;
}

export interface MediaCover {
  coverType: 'unknown' | 'poster' | 'banner' | 'fanart' | 'screenshot' | 'headshot' | 'clearlogo';
  url?: string;
  remoteUrl?: string;
}

export interface Ratings {
  votes: number;
  value: number;
}

export interface SeasonResource {
  seasonNumber: number;
  monitored: false;
  statistics: SeasonStatisticsResource;
  images?: Array<MediaCover>;
}

export interface SeasonStatisticsResource {
  nextAiring?: string;
  previousAiring?: string;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  releaseGroups?: Array<string>;
  percentOfEpisodes: number;
}

export interface SeriesStatisticsResource {
  seasonCount: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  releaseGroups?: Array<string>;
  percentOfEpisodes: number;
}

export type SeriesType = 'standard' | 'daily' | 'anime';

export interface SeriesResouce {
  id: number;
  title?: string;
  alternateTitles?: Array<AlternateTitleResource>;
  sortTitle?: string;
  status: 'continuing' | 'ended' | 'upcoming' | 'deleted';
  ended: boolean;
  profileName?: string;
  overview?: string;
  nextAiring?: string;
  previousAiring?: string;
  network?: string;
  airTime?: string;
  images?: Array<MediaCover>;
  originalLanguage?: Language;
  remotePoster?: string;
  seasons: Array<SeasonResource>;
  year: number;
  path?: string;
  qualityProfileId: number;
  seasonFolder: boolean;
  monitored: boolean;
  monitorNewItems: 'all' | 'none';
  useSceneNumbering: boolean;
  runtime: number;
  tvdbId: number;
  tvRageId: number;
  tvMazeId: number;
  firstAired?: string;
  lastAired?: string;
  seriesType: SeriesType;
  cleanTitle?: string;
  imdbId?: string;
  titleSlug?: string;
  rootFolderPath?: string;
  folder?: string;
  certification?: string;
  genres?: Array<string>;
  tags?: Array<number>;
  added: string;
  addOptions: AddSeriesOptions;
  ratings: Ratings;
  statistics: SeriesStatisticsResource;
  languageProfileId: number;
  episodesChanged?: boolean;
}

export interface WebHookSeries {
  id: number;
  title?: string;
  titleSlug?: string;
  path?: string;
  tvdbId?: number;
  tvMazeId?: number;
  imdbId?: number;
  type: SeriesType;
  year: number;
}

export interface WebHookEpisode {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  title?: string,
  overview?: string;
  airDate?: string;
  airDateUtc?: string;
  seriesId: number;
  tvdbId?: number;
}

export interface WebHookRelease {
  releaseTitle: string;
  indexer: string;
  size: number;
  quality?: string;
  qualityVersion?: number;
  releaseGroup?: string;
  customFormats?: Array<CustomFormatResource>;
  customFormatScore?: number;
}

export interface CustomFormatInfo {
  customFormats?: Array<CustomFormatResource>;
  customFormatScore?: number;
}


export interface WebHookMediaInfo {
  audioChannels: number;
  audioCodec: string;
  audioLanguages: Array<string>,
  height: number;
  width: number;
  subtitles: Array<string>;
  videoCodec: string;
  videoDynamicRange: string;
  videoDynamicRangeType: string;
}

export interface WebHookEpisodeFile {
  id: number;
  relativePath: string;
  path: string;
  quality: string;
  qualityVersion: number;
  releaseGroup: string;
  sceneName: string;
  size: number;
  dateAdded: string;
  mediaInfo: WebHookMediaInfo;
}

export interface WebHookPayload {
  eventType: 'ApplicationUpdate' | 'Download' | 'EpisodeFileDelete' | 'Grab' | 'Health' | 'HealthRestored' | 'SeriesAdd' | 'SeriesDelete' | 'Test',
  instanceName: string,
  applicationUrl: string;
  series?: WebHookSeries,
  episodes?: Array<WebHookEpisode>;
  episodeFile: WebHookEpisodeFile;
  release?: WebHookRelease;
  isUpgrade?: boolean;
  downloadClient?: string,
  downloadClientType?: string,
  downloadId?: string,
  customFormatInfo?: CustomFormatInfo;
  level?: 'warning' | 'error';
  message?: string;
  type?: string;
  wikiUrl?: string;
  deleteReason?: string;
  previousVersion?: string;
  newVersion?: string;
}

type HttpContext = {
  httpInterface: typeof https | typeof http;
  sonarrBaseUrl: string;
  apiKey: string;
  defaultOptions: http.RequestOptions | https.RequestOptions;
}

function addHeaders(options:http.RequestOptions | https.RequestOptions, headers: OutgoingHttpHeaders) {
  options.headers = Object.assign({}, options.headers, headers);
}

export type JSONValue =
 | string
 | number
 | boolean
 | null
 | JSONValue[]
 | {[key: string]: JSONValue}

export interface JSONObject {
  [k: string]: JSONValue
}
export interface JSONArray extends Array<JSONValue> {}

function apiGetJson<JsonType=JSONValue>(context: HttpContext, path: string): Promise<JsonType> {
  return new Promise((resolve, reject) => {
    const options = Object.assign({}, context.defaultOptions,urlToHttpOptions(new URL(`${context.sonarrBaseUrl}/api/v3/${path}`)));
    addHeaders(options, {
      'accept': 'application/json',
      'X-Api-Key': context.apiKey
    });
    context.httpInterface.get(options, res => {
      const { statusCode } = res;
      if (statusCode !== 200) {
        res.resume();
        reject(`unexpected status code: ${statusCode}`);
        return;
      }
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (e) {
          reject((e as JSONObject).message);
        }
      });
    }).on('error', (e) => {
      reject(e.message);
    });
  })
}

function apiGetBuffer(context: HttpContext, path: string): Promise<{buffer: Buffer, contentType?: string}> {
  return new Promise((resolve, reject) => {
    const options = Object.assign(context.defaultOptions,urlToHttpOptions(new URL(`${context.sonarrBaseUrl}/api/v3/${path}`)));
    addHeaders(options, {
      'X-Api-Key': context.apiKey
    });
    context.httpInterface.get(options, (res: IncomingMessage) => {
      const { statusCode } = res;
      if (statusCode !== 200) {
        res.resume();
        reject(`unexpected status code: ${statusCode}`);
        return;
      }

      const rawData: Array<Buffer> = [];
      res.on('data', (chunk) => { rawData.push(chunk); });
      res.on('end', () => {

        resolve({
          buffer: Buffer.concat(rawData),
          contentType: res.headersDistinct['content-type']?.[0]
        });
      });
    }).on('error', (e) => {
      reject(e.message);
    });
  })
}

export function getApi(sonarrBaseUrl: string, apiKey: string, defaultOptions: http.RequestOptions | https.RequestOptions = {}) {
  const url = new URL(sonarrBaseUrl);
  const secure = url.protocol === 'https:';
  if (!secure && url.protocol !== 'http:') {
    throw `Unsupported protocol ${url.protocol}`;
  }
  const context = {
    httpInterface: secure ? https : http,
    sonarrBaseUrl,
    apiKey,
    defaultOptions
  }
  return {
    getJson: apiGetJson.bind(global, context) as <JsonType=JSONValue>(path: string) => Promise<JsonType>,
    getBuffer: apiGetBuffer.bind(global, context)
  };
}
