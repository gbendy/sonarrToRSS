import { Feed } from 'feed';
import { FeedEventManager } from './feedEventManager';
import { State } from './state';


export async function init(state: State) {
  state.feed?.eventManager?.clear();

  state.feed = {
    feed: new Feed({
      title: 'Sonarr to RSS',
      description: `Events for ${state.hostConfig?.instanceName ?? 'Sonarr'}`,
      id: state.config.applicationUrl,
      link: state.config.applicationUrl,
      language: 'en',
      copyright: '',
      feedLinks: {
        rss: state.resolveApplicationUrl('rss')
      },
    }),
    eventManager: new FeedEventManager(state)
  };

  const events = state.feed.eventManager.generateHistorical(20);
  const promises: Array<Promise<unknown>> = [];
  const seriesIds = new Set<number>;

  events.forEach(event => {
    const seriesId = event.event.series?.id;
    if (seriesId !== undefined && !state.seriesData.has(seriesId)) {
      seriesIds.add(seriesId);
    }
    promises.push(state.feed.eventManager.addEvent(event));
  });
  promises.push(state.ensureSeries(seriesIds));
  return Promise.all(promises);
}

export default {
  init
};
