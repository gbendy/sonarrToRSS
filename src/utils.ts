import { HostConfigResource, getApi } from './sonarrApiV3';
import { SonarrApiConfig, SonarrApi, Config } from './types';
import crypto from 'node:crypto';

export const HealthTypes = [
  'ApiKeyValidationCheck',
  'AppDataLocationCheck',
  'DownloadClientCheck',
  'DownloadClientRemovesCompletedDownloadsCheck',
  'DownloadClientRootFolderCheck',
  'DownloadClientSortingCheck',
  'DownloadClientStatusCheck',
  'ImportListRootFolderCheck',
  'ImportListStatusCheck',
  'ImportMechanismCheck',
  'IndexerDownloadClientCheck',
  'IndexerJackettAllCheck',
  'IndexerLongTermStatusCheck',
  'IndexerRssCheck',
  'IndexerSearchCheck',
  'IndexerStatusCheck',
  'MountCheck',
  'NotificationStatusCheck',
  'PackageGlobalMessageCheck',
  'ProxyCheck',
  'RecyclingBinCheck',
  'RemotePathMappingCheck',
  'RemovedSeriesCheck',
  'RootFolderCheck',
  'ServerSideNotificationService',
  'SystemTimeCheck',
  'UpdateCheck'
];

export function isErrorWithCode(err: unknown): err is Error & { code: unknown } {
  return err instanceof Error && 'code' in (err as any); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function isString(value: unknown): value is string {
  return value?.constructor === String;
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value !== '';
}

function isUrl(value: unknown): URL | false {
  try {
    return new URL(value as string);
  } catch {
    return false;
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function isArray(value: unknown): value is [] {
  return Array.isArray(value);
}

function isHttpUrl(value: unknown): value is string {
  const url = isUrl(value);
  return url ? (url.protocol === 'http:' || url.protocol === 'https:') : false;
}

function isHttpUrlOrEmptyString(value: unknown): value is string {
  return isHttpUrl(value) || (isString(value) && value === '');
}

export function validateSonarrApiConfig(config: SonarrApiConfig, strict: boolean) {
  return (strict ? isHttpUrl(config?.sonarrBaseUrl) : isHttpUrlOrEmptyString(config?.sonarrBaseUrl)) && isString(config?.sonarrApiKey) && isBoolean(config?.sonarrInsecure);
}

export function validateUserConfig(config: Config) {
  return validateSonarrApiConfig(config, false) &&
    isNumber(config?.port) && isString(config?.address) &&
    isHttpUrl(config?.applicationUrl) && isString(config?.urlBase) &&
    isString(config?.username) &&
    isNumber(config?.sessionExpire) &&
    isString(config?.feedTitle) &&
    (config?.feedTheme === 'auto' || config?.feedTheme === 'light' || config?.feedTheme === 'dark') &&
    isBoolean(config?.feedRss) && isBoolean(config?.feedAtom) && isBoolean(config?.feedJson) &&
    isNumber(config?.feedHealthDelay) && isArray(config?.feedHealthDelayTypes);
}

export const sonarrApiKeys = [ 'sonarrBaseUrl', 'sonarrApiKey' , 'sonarrInsecure' ];

export const userConfigKeys = [ ...sonarrApiKeys, 'port', 'address', 'applicationUrl', 'urlBase' ];

export function validateConfig(config: Config) {
  return validateUserConfig(config) && isString(config?.historyFile) && isBoolean(config?.configured);
}

export function getSonarrApi(config: SonarrApiConfig) {
  return getApi(config.sonarrBaseUrl, config.sonarrApiKey, {
    rejectUnauthorized: !config.sonarrInsecure
  });
}

export function getSonarrHostConfig(sonarrApi: SonarrApi): Promise<HostConfigResource> {
  return sonarrApi.getJson<HostConfigResource>('config/host');
}

export function arraysEqual(lhs: Array<unknown>, rhs: Array<unknown>): boolean {
  if (lhs.length === rhs.length) {
    const rhsSet = new Set(rhs);
    return lhs.every(element => rhsSet.has(element));
  }
  return false;
}

export function randomString(length: number = 12, prefix: string = 'e') {
  return `${prefix}${crypto.randomBytes(length).toString('hex')}`;
}
