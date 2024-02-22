import { HostConfigResource, getApi } from './sonarrApiV3';
import { Context, SeriesResourceExt } from './types';
import { start } from './server';
import { readFile } from 'node:fs/promises';

async function loadConfig(): Promise<Context> {
  const context = {} as Context;
  const configJson = await readFile('./config.json',  { encoding: 'utf8' });
  context.config = Object.assign({
    port: 3000,
    host: '0.0.0.0',
    historyFile: './history.json'
  }, JSON.parse(configJson));
  if (!context.config.sonarrBaseUrl) {
    throw `sonarrBaseUrl not specified`;
  }
  if (!context.config.apiKey) {
    throw `apiKey not specified`;
  }
  
  context.sonarrApi = getApi(context.config.sonarrBaseUrl, context.config.apiKey);
  context.seriesData = new Map<number, SeriesResourceExt>();

  return context;
}

function loadHistory(context: Context): Promise<Context> {
  return readFile(context.config.historyFile,  { encoding: 'utf8' }).then(historyJson => {
    context.history = JSON.parse(historyJson);
    return context;
  }).catch(()=>{
    context.history = [];
    return context;
  });
}

function getSonarrHostConfig(context: Context): Promise<Context> {
  return context.sonarrApi.getJson<HostConfigResource>(`config/host`).then(hostConfig => {
    context.hostConfig = hostConfig;
    return context;
  }).catch(()=> {
    return context;
  });
}

loadConfig().then(loadHistory).then(getSonarrHostConfig).then(start);
