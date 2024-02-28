import { Feed } from 'feed';
import { Context, Event } from './types';
import { ensureSeries, generateHelpers, resolveApplicationUrl } from './server';
import { WebHookPayload } from './sonarrApiV3';
import { create } from 'express-handlebars';

export function eventTitle(event: WebHookPayload) {
  if (event.eventType === 'ApplicationUpdate') {
    return `Application update - ${event.message}`;
  } else if (event.eventType === 'SeriesAdd') {
    return `New series added - ${event.series?.title}`;
  } else if (event.eventType === 'SeriesDelete') {
    return `Series deleted - ${event.series?.title}`;
  } else if (event.eventType === 'Download') {
    return `Downloaded ${event.series?.title} S${event.episodes?.[0].seasonNumber} E${event.episodes?.[0].episodeNumber} - ${event.episodes?.[0].title}${event.isUpgrade ? ' - upgrade' : ''}`;
  } else if (event.eventType === 'EpisodeFileDelete') {
    return `Deleted ${event.series?.title} Episode S${event.episodes?.[0].seasonNumber} E${event.episodes?.[0].episodeNumber} - ${event.episodes?.[0].title} - ${event.deleteReason}`;
  } else if (event.eventType === 'Grab') {
    return `Grabbed ${event.series?.title} S${event.episodes?.[0].seasonNumber} E${event.episodes?.[0].episodeNumber} - ${event.episodes?.[0].title}`;
  } else if (event.eventType === 'Health') {
    return 'Health';
  } else if (event.eventType === 'HealthRestored') {
    return 'Health Restored';
  } else if (event.eventType === 'Test') {
    return 'Test';
  }
  return event.eventType;
}

export async function addEvent(context: Context, event: Event) {
  try {
    const content = await context.feed.handlebars.renderView('./src/views/event.handlebars', {
      instanceName: context.hostConfig?.instanceName ?? 'Sonarr',
      event: {
        ...event,
        indexDisplay: event.index + 1,
        ascendingIndex: context.history.length - event.index - 1,
        ascendingIndexDisplay: context.history.length - event.index
      },
      sonarrBaseUrl: context.config.sonarrBaseUrl,
      useApplicationUrl: true
    });
    context.feed.feed.addItem({
      title: eventTitle(event.event),
      date: new Date(event.timestamp),
      link: resolveApplicationUrl(context, `event/${event.id}`),
      content
    });
  } catch (e) {
    console.log(e);
  }
}

export async function init(context: Context) {
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
    handlebars: create({
      layoutsDir: './src/views/layouts',
      partialsDir: './src/views/partials',
      defaultLayout: 'rss',
      helpers: generateHelpers(context)
    })
  };

  const promises: Array<Promise<any>> = []; //eslint-disable-line @typescript-eslint/no-explicit-any
  const lastIndex = Math.max(context.history.length - 20 - 1, 0);
  const seriesIds = new Set<number>;
  for (let index=context.history.length-1; index > lastIndex; index--) {
    const seriesId = context.history[index].event.series?.id;
    if (seriesId !== undefined && !context.seriesData.has(seriesId)) {
      seriesIds.add(seriesId);
    }
    promises.push(addEvent(context, context.history[index]));
  }

  promises.push(ensureSeries(context, seriesIds));
  return Promise.all(promises);
}

export default {
  init, addEvent
}
