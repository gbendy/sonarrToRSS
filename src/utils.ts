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

/**
 * Parses the given string and returns it as an Integer.
 * Defaults to defaultvalue if parsing fails
 */
export function parseInteger<T>(str: string, defaultValue: T): number | T
{
  const value = Number.parseInt(str);
  return Number.isNaN(value) ? defaultValue : value;
}


export function validateSonarrApiConfig(config: SonarrApiConfig, strict: boolean) {
  return (strict ? isHttpUrl(config?.sonarrBaseUrl) : isHttpUrlOrEmptyString(config?.sonarrBaseUrl)) && isString(config?.sonarrApiKey) && isBoolean(config?.sonarrInsecure);
}

export function validateLogLevel(config: Config, strict: boolean) {
  return strict ? (config?.logLevel === 'error' || config?.logLevel === 'warn' || config?.logLevel === 'info' ||
      config?.logLevel === 'verbose' || config?.logLevel === 'debug' || config?.logLevel === 'trace') : isString(config?.logLevel);
}

export function validateUserConfig(config: Config, fixSoftErrors: boolean) {
  const errors: Array<string> = [];
  const warnings: Array<string> = [];
  if (!validateSonarrApiConfig(config, config.configured)) {
    errors.push('Invalid Sonarr API config');
  }
  if (!isNumber(config.port) || config.port <= 0 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}. Must be between 0 and 65535`);
  }
  if (!isNonEmptyString(config.address)) {
    errors.push(`Invalid address: ${config.address}. Must be a listen host address`);
  }
  if (config.configured) {
    if (!isHttpUrl(config.applicationUrl)) {
      errors.push(`Invalid applicationUrl: ${config.applicationUrl}. Must be a URL`);
    }
    if (!isNonEmptyString(config.username)) {
      errors.push(`Invalid username: ${config.username}. Must be a non empty string`);
    }
  } else {
    if (!isString(config.applicationUrl)) {
      errors.push(`Invalid applicationUrl: ${config.applicationUrl}. Must be a string`);
    }
    if (!isString(config.username)) {
      errors.push(`Invalid username: ${config.username}. Must be a string`);
    }
  }
  if (!isString(config.urlBase)) {
    errors.push(`Invalid urlBase: ${config.urlBase}. Must be a string`);
  }
  if (!isNumber(config.sessionExpire) || config.sessionExpire < 0) {
    if (fixSoftErrors) {
      warnings.push(`Invalid sessionExpire: ${config.sessionExpire}. Setting to 7`);
      config.sessionExpire = 7;
    } else {
      errors.push(`Invalid sessionExpire: ${config.sessionExpire}. Must be a number >= 0`);
    }
  }
  if (!isString(config.feedTitle)) {
    errors.push(`Invalid feedTitle: ${config.feedTitle}. Must be a string`);
  }
  if (config.feedTheme !== 'auto' && config.feedTheme !== 'light' && config.feedTheme !== 'dark') {
    errors.push(`Invalid feedTheme: ${config.feedTitle}. Must be one of auto, light or dark`);
  }
  if (!isBoolean(config.feedRss)) {
    errors.push(`Invalid feedRss: ${config.feedRss}. Must be a boolean`);
  }
  if (!isBoolean(config.feedAtom)) {
    errors.push(`Invalid feedAtom: ${config.feedAtom}. Must be a boolean`);
  }
  if (!isBoolean(config.feedJson)) {
    errors.push(`Invalid feedJson: ${config.feedJson}. Must be a boolean`);
  }
  if (!isNumber(config.maxImageCacheSize) || config.maxImageCacheSize < 0) {
    if (fixSoftErrors) {
      warnings.push(`Invalid maxImageCacheSize: ${config.maxImageCacheSize}. Setting to 50`);
      config.maxImageCacheSize = 50;
    } else {
      errors.push(`Invalid maxImageCacheSize: ${config.maxImageCacheSize}. Must be a number >= 0`);
    }
  }
  if (!isNumber(config.feedHealthDelay) || config.feedHealthDelay < 0) {
    if (fixSoftErrors) {
      warnings.push(`Invalid feedHealthDelay: ${config.feedHealthDelay}. Setting to 0`);
      config.feedHealthDelay = 0;
    } else {
      errors.push(`Invalid feedHealthDelay: ${config.feedHealthDelay}. Must be a number >= 0`);
    }
  }
  if (!isArray(config.feedHealthDelayTypes)) {
    errors.push(`Invalid feedHealthDelayTypes: ${config.feedHealthDelayTypes}. Must be an array of strings`);
  }
  if (!isBoolean(config.discardResolvedHealthEvents)) {
    errors.push(`Invalid discardResolvedHealthEvents: ${config.discardResolvedHealthEvents}. Must be a boolean`);
  }
  if (!isNumber(config.feedLowWaterMark) || config.feedLowWaterMark < 1) {
    if (fixSoftErrors) {
      warnings.push(`Invalid feedLowWaterMark: ${config.feedLowWaterMark}. Setting to 20`);
      config.feedLowWaterMark = 20;
    } else {
      errors.push(`Invalid feedLowWaterMark: ${config.feedLowWaterMark}. Must be an integer > 0`);
    }
  }
  if (!isNumber(config.feedHighWaterMark) || config.feedHighWaterMark < config.feedLowWaterMark) {
    if (fixSoftErrors) {
      warnings.push(`Invalid feedHighWaterMark: ${config.feedHighWaterMark}. Setting to ${config.feedLowWaterMark + 20}`);
      config.feedHighWaterMark = config.feedLowWaterMark + 20;
    } else {
      errors.push(`Invalid feedHighWaterMark: ${config.feedHighWaterMark}. Must be an integer >= feedLowWaterMark`);
    }
  }
  if (!validateLogLevel(config, true)) {
    if (fixSoftErrors) {
      warnings.push(`Invalid logLevel: ${config.logLevel}, defaulting to info`);
      config.logLevel = 'info';
    } else {
      errors.push(`Invalid logLevel: ${config.logLevel}. Must be one of error, warn, info, verbose, debug or trace`);
    }
  }
  return {
    errors,
    warnings
  };
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
