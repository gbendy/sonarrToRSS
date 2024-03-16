import  express, { Router } from 'express';
import { Config, SonarrApiConfig } from '../types';
import { arraysEqual, getSonarrApi, getSonarrHostConfig, isErrorWithCode, validateSonarrApiConfig, validateUserConfig } from '../utils';
import { JSONObject } from '../sonarrApiV3';
import { writeFile } from 'node:fs/promises';
import { forCategory } from '../logger';
import feed from '../feed';
import { start } from '../server';
import { State } from '../state';
import { noCache } from '../middleware';

const logger = forCategory('api');

export default function (state: State) {
  const router = Router();

  // copy ping id so we always use the one associated with this
  // instance of the express server.
  const pingId = state.pingId;
  router.get('/ping', noCache, (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('x-ping-id', pingId);
    res.end();
  });

  router.post('/testSonarrUrl', express.json(), async (req, res) => {
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

  router.post('/saveConfig', express.json(), async (req, res) => {
    const postedConfig = req.body as Config;
    logger.info('Updating configuration');
    if (!validateUserConfig(postedConfig)) {
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

      if (initialConfig || changedListen || changedApplicationUrl || changedUrlBase || changedSonarrApi || regenerateFeed) {
        // write out new config to config file.
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
