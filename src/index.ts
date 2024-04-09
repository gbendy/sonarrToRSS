import { forCategory } from './logger';
import { Config } from './types';
import { State } from './state';
import { start } from './express';
import version from './version';

const logger = forCategory('startup');

const defaultConfig: Config = {
  port: 18989,
  address: '0.0.0.0',
  sonarrBaseUrl: '',
  sonarrApiKey:'',
  sonarrInsecure: false,
  historyFile: './history.json',
  sessionDirectory: './sessions',
  passwordFile: './passwd',
  applicationUrl: '',
  urlBase: '',
  username: '',
  sessionExpire: 7,
  feedTitle: 'Sonarr to RSS',
  feedTheme: 'auto',
  feedHealthDelay: 0,
  feedHealthDelayTypes: [],
  feedRss: true,
  feedAtom: true,
  feedJson: false,
  discardResolvedHealthEvents: false,
  maxImageCacheSize: 50,
  logLevel: 'info',
  sessionSecrets: [],
  configured: false
};

logger.info(`Starting Sonarr to RSS server version ${version}`);

State.create(defaultConfig).then(start).catch(e => {
  logger.error(e);
  logger.error('Fatal startup error, exiting');
  process.exit(-1);
});
