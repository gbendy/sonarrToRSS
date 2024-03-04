import { HostConfigResource, getApi } from './sonarrApiV3';
import { Context, SonarrApiConfig, SonarrApi, Config } from './types';

export function isErrorWithCode(err: unknown): err is Error & { code: unknown } {
  return err instanceof Error && 'code' in (err as any); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function isString(value: unknown): value is string {
  return value?.constructor === String;
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
    isHttpUrl(config?.applicationUrl) && isString(config?.urlBase)
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

export async function updateContextFromConfig(context: Context) {
  context.sonarrApi = undefined;
  if (context.config.sonarrBaseUrl && context.config.sonarrApiKey) {
    try {
      context.sonarrApi = getSonarrApi(context.config);
    } catch {} // eslint-disable-line no-empty
  }

  context.urlBase = context.config.urlBase;
  // URL base must start and end with a /
  if (context.urlBase) {
    if (context.urlBase !== '/') {
      if (!context.urlBase.startsWith('/')) {
        context.urlBase = '/' + context.urlBase;
      }
      if (!context.urlBase.endsWith('/')) {
        context.urlBase = context.urlBase + '/';
      }
    }
  } else {
    context.urlBase = '/';
  }
  // Application URL must end with a /
  context.applicationUrl = context.config.applicationUrl;
  if (context.applicationUrl) {
    if (!context.applicationUrl.endsWith('/')) {
      context.applicationUrl = context.applicationUrl + '/';
    }
  } else {
    context.applicationUrl = context.urlBase;
  }
  if (context.sonarrApi) {
    try {
      context.hostConfig = await getSonarrHostConfig(context.sonarrApi);
    } catch {
      // get config failed so assume API is unusable
      context.sonarrApi = undefined;
    }
  }
}

export function getSonarrHostConfig(sonarrApi: SonarrApi): Promise<HostConfigResource> {
  return sonarrApi.getJson<HostConfigResource>('config/host');
}
