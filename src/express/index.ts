import express, { Express } from 'express';
import { engine } from 'express-handlebars';
import { State } from '../state';
import { forCategory } from '../logger';
import feed from '../feed';
import { noCache } from './middleware';
import routes from './routes';
import { handlebarOptions as configHandlebarOptions } from './routes/config';
import authentication from './authentication';
import serveFavicon from 'serve-favicon';

const logger = forCategory('server');

export async function start(state: State) {
  const app: Express = express();
  await feed.init(state);

  authentication.preStart(state);

  app.engine('handlebars', engine());
  app.set('view engine', 'handlebars');
  app.set('views', './src/views');
  app.disable('x-powered-by');

  app.use(serveFavicon('./src/favicon.ico'));

  if (!state.config.configured) {
    logger.info('Server not configured, starting in configuration only mode');

    app.use(noCache);
    app.use('/api/', routes.api(state));
    app.get('/', (req, res) => {
      res.render('config', configHandlebarOptions(state, req));
    });
  } else {
    authentication.use(state, app);

    app.use(routes.auth(state));
    app.use(routes.browse(state));
    app.use(routes.config(state));
    app.use(routes.feeds(state));
    app.use(routes.sonarr(state));
    app.use('/api/', routes.api(state));
  }

  state.server = app.listen(state.config.port, state.config.address, () => {
    logger.info(`Server listening on http://${state.config.address}:${state.config.port}`);
  });
}
