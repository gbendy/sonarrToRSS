import { Feed } from 'feed';
import { Context } from './types';
import { ensureSeries, resolveApplicationUrl } from './server';
import { FeedEventManager } from './feedEventManager';


export async function init(context: Context) {
  context.feed?.eventManager?.clear();

  context.feed = {
    feed: new Feed({
      title: 'Sonarr to RSS',
      description: `Events for ${context.hostConfig?.instanceName ?? 'Sonarr'}`,
      id: context.config.applicationUrl,
      link: context.config.applicationUrl,
      language: 'en',
      copyright: '',
      feedLinks: {
        rss: resolveApplicationUrl(context, 'rss')
      },
    }),
    eventManager: new FeedEventManager(context)
  };

  const events = context.feed.eventManager.generateHistorical(20);
  const promises: Array<Promise<unknown>> = [];
  const seriesIds = new Set<number>;

  events.forEach(event => {
    const seriesId = event.event.series?.id;
    if (seriesId !== undefined && !context.seriesData.has(seriesId)) {
      seriesIds.add(seriesId);
    }
    promises.push(context.feed.eventManager.addEvent(event));
  });
  promises.push(ensureSeries(context, seriesIds));
  return Promise.all(promises);
}

export default {
  init
};
