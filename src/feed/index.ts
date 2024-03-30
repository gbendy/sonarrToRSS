import { Feed } from 'feed';
import { State } from '../state';
import { EventManager } from './eventManager';

export { Feed, EventManager };

export async function init(state: State) {
  state.feed?.eventManager?.clear();

  state.feed = {
    feed: new Feed({
      title: state.config.feedTitle,
      description: `Events for ${state.hostConfig?.instanceName ?? 'Sonarr'}`,
      id: state.config.applicationUrl,
      link: state.config.applicationUrl,
      language: 'en',
      copyright: '',
      image: state.resolveApplicationUrl('/favicon.ico'),
      favicon: state.resolveApplicationUrl('/favicon.ico'),
      feedLinks: {
        rss: state.resolveApplicationUrl('rss')
      },
    }),
    eventManager: new EventManager(state)
  };

  const events = state.feed.eventManager.generateHistorical(20);
  const promises: Array<Promise<unknown>> = [];
  const seriesIds = new Set<number>;

  events.forEach(event => {
    const seriesId = event.event.series?.id;
    if (seriesId !== undefined && !state.seriesData.has(seriesId)) {
      seriesIds.add(seriesId);
    }
    promises.push(state.feed.eventManager.addEventToFeed(event));
  });
  promises.push(state.ensureSeries(seriesIds));
  return Promise.all(promises);
}

export default {
  init,
  EventManager,
  Feed
};
