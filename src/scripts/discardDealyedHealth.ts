import { forCategory } from '../logger';
import { Config } from '../types';
import { State } from '../state';
import version from '../version';
import { parseInteger } from '../utils';
import { init } from '../feed';
import { writeFile } from 'node:fs/promises';

const logger = forCategory('discard');

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
  feedLowWaterMark: 20,
  feedHighWaterMark: 50,
  discardResolvedHealthEvents: false,
  maxImageCacheSize: 0,
  logLevel: 'info',
  sessionSecrets: [],
  configured: false
};


const args: {
  outputFilename?: string;
  delayOverride?: number;
  configFile?: string;
} = {};


function usage(code: number) {
  console.log(`usage: node ${process.argv[1]} [--help] [--delay minutes] [--config configFile] outputFilename`);
  console.log('  --help: show help message');
  console.log('  --delay minutes: override the delay time specified in the config file');
  console.log('  --config configFile: load this config file rather than ./config.json');
  console.log('  outputFilename: modified history is written out to this file');
  process.exit(code);
}

if (process.argv.length < 3 || process.argv.length > 8) {
  usage(1);
}
for (let i=2; i<process.argv.length;++i) {
  if (process.argv[i] === '--help') {
    usage(0);
  } else if (process.argv[i] === '--delay') {
    if (i === process.argv.length-1) {
      console.log('error: --delay has no value');
      process.exit(1);
    }
    args.delayOverride = parseInteger(process.argv[i+1], undefined);
    if (args.delayOverride === undefined) {
      console.log('error: value for --delay is not an integer');
      process.exit(1);
    }
    i++;
  } else if (process.argv[i] === '--config') {
    if (i === process.argv.length-1) {
      console.log('error: --config has no value');
      process.exit(1);
    }
    args.configFile = process.argv[i+1];
    i++;
  } else {
    args.outputFilename = process.argv[i];
  }
}

if (args.outputFilename === undefined) {
  console.log('No outputFilename provided');
  process.exit(1);
}

// discard arguments otherwise State will try and load
process.argv.length = 2;
if (args.configFile) {
  process.argv.push(args.configFile);
}
logger.info(`discardDelayedHealth ${version}`);

State.create(defaultConfig).then(async state => {
  if (args.delayOverride === undefined) {
    args.delayOverride = state.config.feedHealthDelay;
  }
  logger.info(`outputFilename: ${args.outputFilename}`);
  logger.info(`delay time: ${args.delayOverride} minutes`);
  if (args.delayOverride <= 0) {
    logger.info('Delay time is 0 minutes, no work to do.');
    process.exit(0);
  }

  // enable discard
  state.config.feedHealthDelay = args.delayOverride;
  state.config.discardResolvedHealthEvents = true;

  // init feed
  init(state);

  // don't install the actual timeouts
  state.feed.eventManager.installDelayTimeouts = false;

  // grab and clear history
  const history = state.history;
  state.history = [];
  state.events = {};

  // recreate history
  for (const event of history) {
    event.index = state.history.length;
    state.history.push(event);
    state.events[event.id] = event;

    state.feed.eventManager.processNew(event);
  }

  logger.info(`Done, purged ${history.length - state.history.length} events`);
  try {
    await writeFile(args.outputFilename as string, JSON.stringify(state.history), { encoding: 'utf8' });
  } catch(err) {
    logger.error(`error writing output file ${args.outputFilename}: ${(err as Error).message}`);
  }
}).catch(e => {
  logger.error(e);
  logger.error('Fatal startup error, exiting');
  process.exit(-1);
});
