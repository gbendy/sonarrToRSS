import { HostConfigResource, getApi } from "./sonarrApiV3";
import { Context } from "./types";

export function isErrorWithCode(err: unknown): err is Error & { code: unknown } {
  return err instanceof Error && 'code' in (err as any);
}

export function updateContextFromConfig(context: Context) {
  if (context.config.sonarrBaseUrl && context.config.apiKey) {
    context.sonarrApi = getApi(context.config.sonarrBaseUrl, context.config.apiKey);
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
}

export async function getSonarrHostConfig(context: Context): Promise<Context> {
  if (context.sonarrApi) {
    return context.sonarrApi.getJson<HostConfigResource>('config/host').then(hostConfig => {
      context.hostConfig = hostConfig;
      return context;
    }).catch(()=> {
      return context;
    });
  }
  return context;
}
