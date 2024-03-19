import  express, { Router } from 'express';
import { Config, SonarrApiConfig } from '../../types';
import { arraysEqual, getSonarrApi, getSonarrHostConfig, isErrorWithCode, isNonEmptyString, validateSonarrApiConfig, validateUserConfig } from '../../utils';
import { JSONObject } from '../../sonarrApiV3';
import { writeFile } from 'node:fs/promises';
import { forCategory } from '../../logger';
import feed from '../../feed';
import { start } from '..';
import { State } from '../../state';
import { noCache } from '../middleware';
import { authenticated, updatePassword } from '../authentication';

const logger = forCategory('api');

function extractPassword(config: Config & { password?: string }) {
  const password = config.password;
  if (password !== undefined) {
    delete config.password;
  }
  return isNonEmptyString(password) ? password : undefined;
}

export default function (state: State) {
  const router = Router();

  // copy ping id so we always use the one associated with this
  // instance of the express server.
  const pingId = state.pingId;
  router.get('/ping', noCache, (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('x-ping-id', pingId);
    res.end();
  });

  router.post('/testSonarrUrl', authenticated(state), express.json(), async (req, res) => {
    logger.info('Testing Sonarr URL');
    const sonarrApi = req.body as SonarrApiConfig;
    if (!validateSonarrApiConfig(sonarrApi, true)) {
      logger.error('Invalid Sonarr server data');
      res.statusCode = 400;
      res.statusMessage = 'Invalid Body';
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json; charset=UTF-8');
    try {
      logger.info(`Testing Sonarr at ${sonarrApi.sonarrBaseUrl}`);
      const api = getSonarrApi(sonarrApi);
      const result = await getSonarrHostConfig(api);
      logger.info(`Testing Sonarr at ${sonarrApi.sonarrBaseUrl} succeeded`);
      res.write(JSON.stringify({
        result: 'OK',
        instanceName: result.instanceName ?? 'Sonarr'
      }));
      res.end();
    } catch (message) {
      logger.error(`Testing Sonarr at ${sonarrApi.sonarrBaseUrl} failed`);
      logger.error(message as string);
      res.write(JSON.stringify({
        result: 'FAILED',
        message
      }));
      res.end();
    }
  });

  router.post('/saveConfig', authenticated(state), express.json(), async (req, res) => {
    const postedConfig = req.body as Config;
    logger.info('Updating configuration');
    const password = extractPassword(postedConfig);

    if (!validateUserConfig(postedConfig) || (!state.config.configured && !password)) {
      logger.error('Invalid configuration');
      res.statusCode = 400;
      res.statusMessage = 'Invalid Body';
      res.end();
      return;
    }

    res.setHeader('content-type', 'application/json; charset=UTF-8');
    try {
      const newConfig = { ...state.config };
      const initialConfig = !newConfig.configured;

      let changedListen = false;
      if (newConfig.port !== postedConfig.port) {
        newConfig.port = postedConfig.port;
        changedListen = true;
      }
      if (newConfig.address !== postedConfig.address) {
        newConfig.address = postedConfig.address;
        changedListen = true;
      }
      let regenerateFeed = false;
      const changedApplicationUrl = newConfig.applicationUrl !== postedConfig.applicationUrl;
      if (changedApplicationUrl) {
        newConfig.applicationUrl = postedConfig.applicationUrl;
        regenerateFeed = true;
      }
      const changedUrlBase = newConfig.urlBase !== postedConfig.urlBase;
      if (changedUrlBase) {
        newConfig.urlBase = postedConfig.urlBase;
      }
      const changedUsername = newConfig.username !== postedConfig.username;
      if (changedUsername) {
        newConfig.username = postedConfig.username;
      }
      if (newConfig.sessionExpire !== postedConfig.sessionExpire) {
        newConfig.sessionExpire = postedConfig.sessionExpire;
        changedListen = true;
      }
      let changedSonarrApi = false;
      if (newConfig.sonarrBaseUrl !== postedConfig.sonarrBaseUrl) {
        newConfig.sonarrBaseUrl = postedConfig.sonarrBaseUrl;
        changedSonarrApi = true;
      }
      if (newConfig.sonarrInsecure !== postedConfig.sonarrInsecure) {
        newConfig.sonarrInsecure = postedConfig.sonarrInsecure;
        changedSonarrApi = true;
      }
      if (newConfig.sonarrApiKey !== postedConfig.sonarrApiKey) {
        newConfig.sonarrApiKey = postedConfig.sonarrApiKey;
        changedSonarrApi = true;
      }
      if (newConfig.feedTitle !== postedConfig.feedTitle) {
        newConfig.feedTitle = postedConfig.feedTitle;
        regenerateFeed = true;
      }
      if (newConfig.feedTheme !== postedConfig.feedTheme) {
        newConfig.feedTheme = postedConfig.feedTheme;
        regenerateFeed = true;
      }
      if (newConfig.feedHealthDelay !== postedConfig.feedHealthDelay) {
        newConfig.feedHealthDelay = postedConfig.feedHealthDelay;
        regenerateFeed = true;
      }
      if (!arraysEqual(newConfig.feedHealthDelayTypes, postedConfig.feedHealthDelayTypes)) {
        newConfig.feedHealthDelayTypes = postedConfig.feedHealthDelayTypes;
        regenerateFeed = true;
      }
      if (!newConfig.configured) {
        logger.info('Initial configuration complete');
      }
      newConfig.configured = true;
      const responseData: JSONObject = {
        result: 'OK',
      };

      const configChanged = initialConfig || changedListen || changedApplicationUrl || changedUrlBase || changedUsername || changedSonarrApi || regenerateFeed;
      if (configChanged || password) {
        // write out new config to config file.
        if (configChanged) {
          try {
            await writeFile(state.configFilename, JSON.stringify(newConfig, null, 2), { encoding: 'utf8' });
          } catch (e) {
            if (isErrorWithCode(e)) {
              // write file error, this is the only throw that should happen
              logger.error(`Config file ${state.configFilename} cannot be written. ${e.code} ${e.message}`);
            } else if (e instanceof Error) {
              logger.error(`Config file ${state.configFilename} cannot be written. ${e.message}`);
            } else {
              logger.error(`Config file ${state.configFilename} cannot be written. ${e}`);
            }
            throw 'Could not write config file';
          }
          // update local config
          state.config = newConfig;

          await state.updateFromConfig();
        }
        if (password) {
          updatePassword(state, password);
        }
        logger.info('Configuration update complete');

        // work out what we need to restart to use new config
        if (initialConfig || changedListen) {
          // restart server, will also restart feed
          logger.info(`Server connection configuration changed. Restarting to listen on ${newConfig.address}:${newConfig.port}`);

          state.regeneratePingId();
          state.server.close(() => {
            start(state);
          });
          responseData.reload = true;
          responseData.pingId = state.pingId;
        } else {
          if (changedApplicationUrl) {
            responseData.reload = true;
            responseData.pingId = state.pingId;
          }
          if (regenerateFeed || changedSonarrApi) {
            logger.info('Regenerating feed');
            await feed.init(state);
          }
        }
        // other changes will be picked up immediately
      } else {
        logger.info('No config changes found');
      }
      res.write(JSON.stringify(responseData));
      res.end();
    } catch (message) {
      res.write(JSON.stringify({
        result: 'FAILED',
        message
      }));
      res.end();
    }
  });

  return router;
}
