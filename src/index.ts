import { Config, Context, Events, SeriesResourceExt } from './types';
import { start } from './server';
import { readFile } from 'node:fs/promises';
import { isErrorWithCode, updateContextFromConfig } from './utils';
import { forCategory } from './logger';
import path from 'node:path';

const logger = forCategory('startup');

const defaultConfig: Config = {
  port: 18989,
  address: '0.0.0.0',
  sonarrBaseUrl: '',
  sonarrApiKey:'',
  sonarrInsecure: false,
  historyFile: './history.json',
  applicationUrl: '',
  urlBase: '',
  feedTheme: 'auto',
  feedHealthDelay: 0,
  feedHealthDelayTypes: [],
  configured: false
};

async function loadConfig(): Promise<Context> {
  const context = {
    configFilename: path.resolve(process.argv.length > 2 ? process.argv[2] : './config.json'),
    config: defaultConfig
  } as Context;

  try {
    const configJson = await readFile(context.configFilename,  { encoding: 'utf8' });
    Object.assign(context.config, JSON.parse(configJson));
  } catch (e) {
    if (isErrorWithCode(e)) {
      // readFile error, no file is OK since we'll show config UI
      if (e.code !== 'ENOENT') {
        throw `Config file ${context.configFilename} cannot be read. ${e.message}`;
      }
    } else if (e instanceof Error) {
      // JSON parse error
      throw `Config file ${context.configFilename} cannot be read. ${e.message}`;
    } else {
      throw e;
    }
  }

  context.resolvedHistoryFile = path.resolve(context.config.historyFile);

  context.seriesData = new Map<number, SeriesResourceExt>();

  await updateContextFromConfig(context);

  return context;
}

function loadHistory(context: Context): Promise<Context> {
  return readFile(context.resolvedHistoryFile,  { encoding: 'utf8' }).then(historyJson => {
    context.history = JSON.parse(historyJson);
    context.events = context.history.reduce((events, event, index) => {
      event.index = index;
      events[event.id] = event;
      return events;
    }, {} as Events);

    return context;
  }).catch((e) => {
    if (isErrorWithCode(e)) {
      // readFile error, no file is OK since we assume no events have been processed yet
      if (e.code !== 'ENOENT') {
        logger.warn(`History file ${context.resolvedHistoryFile} cannot be read. ${e.message}`);
        logger.warn('Starting with empty history');
      }
    } else if (e instanceof Error) {
      // JSON parse error
      logger.warn(`History file ${context.resolvedHistoryFile} cannot be read. ${e.message}`);
      logger.warn('Starting with empty history');
    } else {
      logger.warn(`History file ${context.resolvedHistoryFile} cannot be read. ${e}`);
      logger.warn('Starting with empty history');
    }

    context.history = [];
    return context;
  });
}

loadConfig().then(loadHistory).then(start).catch(e => {
  logger.error(e);
  logger.error('Fatal startup error, exiting');
  process.exit(-1);
});
