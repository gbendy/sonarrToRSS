import { Item } from 'feed';
import { Context, Event } from './types';
import { generateHelpers, resolveApplicationUrl } from './server';
import { create } from 'express-handlebars';
import { forCategory } from './logger';

const logger = forCategory('feed');

type HealthTimer = {
  timer: ReturnType<typeof setTimeout>;
  startTime: number;
};

function healthId(event: Event) {
  return `${event.event.type}-${event.event.level}-${event.event.message}`;
}

function eventTitle(event: Event) {
  if (event.event.eventType === 'ApplicationUpdate') {
    return `Application update - ${event.event.message}`;
  } else if (event.event.eventType === 'SeriesAdd') {
    return `New series added - ${event.event.series?.title}`;
  } else if (event.event.eventType === 'SeriesDelete') {
    return `Series deleted - ${event.event.series?.title}`;
  } else if (event.event.eventType === 'Download') {
    return `Downloaded ${event.event.series?.title} S${event.event.episodes?.[0].seasonNumber} E${event.event.episodes?.[0].episodeNumber} - ${event.event.episodes?.[0].title}${event.event.isUpgrade ? ' - upgrade' : ''}`;
  } else if (event.event.eventType === 'EpisodeFileDelete') {
    return `Deleted ${event.event.series?.title} Episode S${event.event.episodes?.[0].seasonNumber} E${event.event.episodes?.[0].episodeNumber} - ${event.event.episodes?.[0].title} - ${event.event.deleteReason}`;
  } else if (event.event.eventType === 'Grab') {
    return `Grabbed ${event.event.series?.title} S${event.event.episodes?.[0].seasonNumber} E${event.event.episodes?.[0].episodeNumber} - ${event.event.episodes?.[0].title}`;
  } else if (event.event.eventType === 'Health') {
    return 'Health';
  } else if (event.event.eventType === 'HealthRestored') {
    return 'Health Restored';
  } else if (event.event.eventType === 'Test') {
    return 'Test';
  }
  return event.event.eventType;
}

function toMinutes(milliseconds: number) {
  return milliseconds / 60000;
}

function fromMinutes(minutes: number) {
  return minutes * 60000;
}

export class FeedEventManager {
  #context: Context;
  #delayedHealthEvents: Map<string, HealthTimer>;
  #typesToDelay: Set<string>;
  #handlebars: ReturnType<typeof create>;

  constructor(context: Context) {
    this.#context = context;
    this.#delayedHealthEvents = new Map<string, HealthTimer>();
    this.#typesToDelay = new Set(context.config.feedHealthDelay > 0 ? context.config.feedHealthDelayTypes : []);
    this.#handlebars = create({
      layoutsDir: './src/views/layouts',
      partialsDir: './src/views/partials',
      defaultLayout: 'rss',
      helpers: generateHelpers(context)
    });
  }

  clear() {
    for (const timer of this.#delayedHealthEvents.values()) {
      clearTimeout(timer.timer);
    }
    this.#delayedHealthEvents.clear();
  }

  #isHealthEvent(event: Event) {
    return event.event.eventType === 'Health' && this.#typesToDelay.has(event.event.type as string);
  }

  #isHealthRestoredEvent(event: Event) {
    return event.event.eventType === 'HealthRestored' && this.#typesToDelay.has(event.event.type as string);
  }

  #expired(timeDifference: number) {
    return timeDifference > fromMinutes(this.#context.config.feedHealthDelay);
  }

  #registerDelayedHealthEvent(id: string, event: Event, historic: boolean=false) {
    if (historic) {
      const historicDelay = Math.ceil(this.#context.config.feedHealthDelay - toMinutes(Date.now() - event.timestamp));
      logger.info(`Delaying historic health event '${id}' for ${historicDelay} more minutes`);
    } else {
      logger.info(`Delaying feed health event '${id}' for ${this.#context.config.feedHealthDelay} minutes`);

    }
    this.#delayedHealthEvents.set(id, {
      startTime: event.timestamp,
      timer: setTimeout(async () => {
        // delay timed out
        logger.info(`Health event '${id}' did not receive restore event within ${this.#context.config.feedHealthDelay} minutes so sending to feed`);
        this.#delayedHealthEvents.delete(id);
        this.addEvent(event);
      }, fromMinutes(this.#context.config.feedHealthDelay) - (Date.now() - event.timestamp))
    });
  }

  async #createFeedItem(event: Event): Promise<Item> {
    const content = await this.#handlebars.renderView('./src/views/event.handlebars', {
      instanceName: this.#context.hostConfig?.instanceName ?? 'Sonarr',
      event,
      sonarrBaseUrl: this.#context.config.sonarrBaseUrl,
      useApplicationUrl: true,
      forFeed: true
    });
    return  {
      title: eventTitle(event),
      date: new Date(event.timestamp),
      published: new Date(event.timestamp),
      link: resolveApplicationUrl(this.#context, `event/${event.id}`),
      content
    };
  }

  /**
   * Processes a newly received event. If a delayed health event this will manage
   * delaying the push otherwise immediately adds the event to the feeds
   * @param event
   */
  async processNew(event: Event) {
    if (this.#context.config.feedHealthDelay <= 0) {
      // delay disabled
      return this.addEvent(event);
    }

    if (this.#isHealthEvent(event)) {
      const id = healthId(event);
      this.#registerDelayedHealthEvent(id, event);
      return;
    } else if (this.#isHealthRestoredEvent(event)) {
      const id = healthId(event);
      const healthEventTimer = this.#delayedHealthEvents.get(id);
      if (healthEventTimer !== undefined) {
        // There's a matching health event so is within the
        // timeout period so don't send the restored event.
        // Clear and remove the timer so that the health event doesn't get
        // sent either.
        const time = Math.ceil(toMinutes(event.timestamp - healthEventTimer.startTime));
        logger.info(`Health event '${id}' restored after ${time} minutes`);

        clearTimeout(healthEventTimer.timer);
        this.#delayedHealthEvents.delete(id);

        return;
      }
    }
    return this.addEvent(event);
  }

  /**
   * Generates historical events from context history to initialise the feed with.
   * If unexpired health events exist then these are registered for health
   * restore processing.
   * @param count max number of events to populate.
   */
  generateHistorical(count: number): Array<Event> {
    const events: Array<Event> = [];
    const restoreEvents = new Map<string, Event>();

    for (let index=this.#context.history.length-1; index >=0 && events.length < count; index--) {
      const event = this.#context.history[index];
      if (this.#isHealthRestoredEvent(event)) {
        restoreEvents.set(healthId(event), event);
      } else if (this.#isHealthEvent(event)) {
        const id = healthId(event);
        const restoreEvent = restoreEvents.get(id);
        if (!restoreEvent) {
          // no restore event seen for this health event yet.
          const timeSpan = Date.now() - event.timestamp;
          if (this.#expired(timeSpan)) {
            // has already been took too long so add the health event
            events.push(event);
          } else {
            // still within the delay limit. register as a waiting event
            // and start expiry timer for it.
            this.#registerDelayedHealthEvent(id, event, true);
          }
        } else {
          // have a restore event for this health event. If it occured within the timeframe
          // then suppress both messages.
          const timeSpan = restoreEvent.timestamp - event.timestamp;
          if (this.#expired(timeSpan)) {
            // took too long so add both events;
            events.push(restoreEvent);
            events.push(event);
          }
          restoreEvents.delete(id);
        }
      } else {
        events.push(event);
      }
    }
    return events;
  }

  /**
   * Immediately adds an event to the feed
   * @param event
   */
  async addEvent(event: Event) {
    this.#context.feed.feed.addItem(await this.#createFeedItem(event));
  }
}
