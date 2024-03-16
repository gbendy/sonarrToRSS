import  express, { Router } from 'express';
import { Config, SonarrApiConfig } from '../types';
import { arraysEqual, getSonarrApi, getSonarrHostConfig, isErrorWithCode, validateSonarrApiConfig, validateUserConfig } from '../utils';
import { JSONObject } from '../sonarrApiV3';
import { writeFile } from 'node:fs/promises';
import { forCategory } from '../logger';
import feed from '../feed';
import { start } from '../server';
import { State } from '../state';

const logger = forCategory('api');

export default function (state: State) {
  const router = Router();

  router.get('/ping', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end();
  });

  router.post('/testSonarrUrl', express.json(), async (req, res) => {
    const sonarrApi = req.body as SonarrApiConfig;
    if (!validateSonarrApiConfig(sonarrApi, true)) {
      res.statusCode = 400;
      res.statusMessage = 'Invalid Body';
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json; charset=UTF-8');
    try {
      const api = getSonarrApi(sonarrApi);
      const result = await getSonarrHostConfig(api);
      res.write(JSON.stringify({
        result: 'OK',
        instanceName: result.instanceName ?? 'Sonarr'
      }));
      res.end();
    } catch (message) {
      res.write(JSON.stringify({
        result: 'FAILED',
        message
      }));
      res.end();
    }
  });

  router.post('/saveConfig', express.json(), async (req, res) => {
    const postedConfig = req.body as Config;
    if (!validateUserConfig(postedConfig)) {
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
            logger.info(`Config file ${state.configFilename} cannot be written. ${e.code} ${e.message}`);
          } else if (e instanceof Error) {
            logger.info(`Config file ${state.configFilename} cannot be written. ${e.message}`);
          } else {
            logger.info(`Config file ${state.configFilename} cannot be written. ${e}`);
          }
          throw 'Could not write config file';
        }
        // update local config
        state.config = newConfig;

        await state.updateFromConfig();

        if (initialConfig || changedListen) {
          // restart server, will also restart feed
          logger.info(`Server connection configuration changed. Restarting to listen on ${newConfig.address}:${newConfig.port}`);
          state.server.close(() => {
            start(state);
          });
          responseData.reload = true;
        } else {
          if (changedApplicationUrl) {
            responseData.reload = true;
          }
          if (regenerateFeed) {
            await feed.init(state);
          }
        }
        // other changes will be picked up immediately
      }
      // work out what we need to restart to use new config
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
