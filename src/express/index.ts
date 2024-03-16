import express, { Express } from 'express';
import { engine } from 'express-handlebars';
import { State } from '../state';
import { forCategory } from '../logger';
import feed from '../feed';
import { HealthTypes } from '../utils';
import { noCache } from './middleware';
import api from './routes/api';
import sonarr from './routes/sonarr';
import feeds from './routes/feeds';
import browse from './routes/browse';

const logger = forCategory('server');

export async function start(state: State) {
  const app: Express = express();
  await feed.init(state);

  app.engine('handlebars', engine());
  app.set('view engine', 'handlebars');
  app.set('views', './src/views');
  app.disable('x-powered-by');
  if (!state.config.configured) {
    logger.info('Server not configured, starting in configuration only mode');

    app.use(noCache);
    app.use('/api/', api(state));
    app.get('/', (req, res) => {
      res.render('config', {
        layout: 'config',
        state: state,
        healthTypes: HealthTypes,
        helpers: state.handlebarsHelpers
      });
    });
  } else {
    app.use(browse(state));
    app.use(feeds(state));
    app.use(sonarr(state));
    app.use('/api/', api(state));
  }

  state.server = app.listen(state.config.port, state.config.address, () => {
    logger.info(`Server listening on http://${state.config.address}:${state.config.port}`);
  });
}
