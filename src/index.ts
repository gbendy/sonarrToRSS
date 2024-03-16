import { Config } from './types';
import { start } from './server';
import { forCategory } from './logger';
import { State } from './state';

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
  feedTitle: 'Sonarr to RSS',
  feedTheme: 'auto',
  feedHealthDelay: 0,
  feedHealthDelayTypes: [],
  configured: false
};

State.create(defaultConfig).then(start).catch(e => {
  logger.error(e);
  logger.error('Fatal startup error, exiting');
  process.exit(-1);
});
