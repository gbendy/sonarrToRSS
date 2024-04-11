import { Item } from 'feed';
import { Event } from '../types';
import { create } from 'express-handlebars';
import { forCategory } from '../logger';
import { State } from '../state';
import { WebHookPayload } from '../sonarrApiV3';
import { randomString } from '../utils';
import { writeFileSync } from 'node:fs';

const logger = forCategory('feed');

type HealthTimer = {
  event: Event;
  timer?: ReturnType<typeof setTimeout>;
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

export class EventManager {
  #state: State;
  #delayedHealthEvents: Map<string, HealthTimer>;
  #typesToDelay: Set<string>;
  #handlebars: ReturnType<typeof create>;
  installDelayTimeouts = true;

  constructor(state: State) {
    this.#state = state;
    this.#delayedHealthEvents = new Map<string, HealthTimer>();
    this.#typesToDelay = new Set(state.config.feedHealthDelay > 0 ? state.config.feedHealthDelayTypes : []);
    this.#handlebars = create({
      layoutsDir: './src/views/layouts',
      partialsDir: './src/views/partials',
      defaultLayout: 'rss',
      helpers: state.handlebarsHelpers
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
    return timeDifference > fromMinutes(this.#state.config.feedHealthDelay);
  }

  #registerDelayedHealthEvent(id: string, event: Event, historic: boolean=false) {
    if (historic) {
      const historicDelay = Math.ceil(this.#state.config.feedHealthDelay - toMinutes(Date.now() - event.timestamp));
      logger.info(`Delaying historic health event '${id}' for ${historicDelay} more minutes`);
    } else {
      logger.info(`Delaying feed health event '${id}' for ${this.#state.config.feedHealthDelay} minutes`);

    }
    this.#delayedHealthEvents.set(id, {
      event,
      startTime: event.timestamp,
      timer: this.installDelayTimeouts ?
        setTimeout(async () => {
          // delay timed out
          logger.info(`Health event '${id}' did not receive restore event within ${this.#state.config.feedHealthDelay} minutes so sending to feed`);
          this.#delayedHealthEvents.delete(id);
          this.addEventToFeed(event);
        }, fromMinutes(this.#state.config.feedHealthDelay) - (Date.now() - event.timestamp)) :
        undefined
    });
  }

  async #createFeedItem(event: Event): Promise<Item> {
    const content = await this.#handlebars.renderView('./src/views/event.handlebars', {
      instanceName: this.#state.hostConfig?.instanceName ?? 'Sonarr',
      event,
      sonarrBaseUrl: this.#state.config.sonarrBaseUrl,
      useApplicationUrl: true,
      forFeed: true
    });
    return  {
      title: eventTitle(event),
      date: new Date(event.timestamp),
      published: new Date(event.timestamp),
      link: this.#state.resolveApplicationUrl(`event/${event.id}`),
      content
    };
  }

  async addEvent(payload: WebHookPayload) {
    const timestamp = Date.now();
    const id = randomString();
    const event: Event = {
      timestamp,
      id,
      index: this.#state.history.length,
      event: payload
    };
    this.#state.history.push(event);
    this.#state.events[event.id] = event;

    if (event.event.series?.id !== undefined && !this.#state.seriesData.has(event.event.series.id)) {
      this.#state.ensureSeries(new Set([ event.event.series?.id ]));
    }
    try {
      await this.processNew(event);
    } catch (e) {
      logger.info(`Error sending event to feed: ${e}`);
    }

    this.#writeHistoryFile();
  }

  #writeHistoryFile() {
    writeFileSync(this.#state.resolvedHistoryFile, JSON.stringify(this.#state.history), { encoding: 'utf8' });
  }

  /**
   * Processes a newly received event. If a delayed health event this will manage
   * delaying the push otherwise immediately adds the event to the feeds
   * @param event
   */
  async processNew(event: Event) {
    if (this.#state.config.feedHealthDelay <= 0) {
      // delay disabled
      return this.addEventToFeed(event);
    }

    if (this.#isHealthEvent(event)) {
      const id = healthId(event);
      this.#registerDelayedHealthEvent(id, event);
      return;
    } else if (this.#isHealthRestoredEvent(event)) {
      const id = healthId(event);
      let healthEventTimer = this.#delayedHealthEvents.get(id);
      if (!this.installDelayTimeouts && healthEventTimer) {
        const restoreTime = (event.timestamp - healthEventTimer.event.timestamp);
        if (this.#expired(restoreTime)) {
          // restore time was longer than delay time. So we want to keep the events.
          this.#delayedHealthEvents.delete(id);
          healthEventTimer = undefined;
        }
      }
      if (healthEventTimer !== undefined) {
        // There's a matching health event so is within the
        // timeout period so don't send the restored event.
        // Clear and remove the timer so that the health event doesn't get
        // sent either.
        const time = Math.ceil(toMinutes(event.timestamp - healthEventTimer.startTime));

        clearTimeout(healthEventTimer.timer);
        this.#delayedHealthEvents.delete(id);

        if (this.#state.config.discardResolvedHealthEvents) {
          // remove both this event and the original one from history.

          // event.index will be greater than the original health event so remove
          // the restore event first.
          this.#state.history.splice(event.index, 1);
          this.#state.history.splice(healthEventTimer.event.index, 1);

          // update indices of all events after the original one.
          for (let idx=healthEventTimer.event.index; idx < this.#state.history.length; ++idx) {
            this.#state.history[idx].index = idx;
          }

          delete this.#state.events[event.id];
          delete this.#state.events[healthEventTimer.event.id];
          logger.info(`Health event '${id}' restored after ${time} minutes. Purging from history.`);
        } else {
          logger.info(`Health event '${id}' restored after ${time} minutes. Suppressing from feed.`);
        }

        return;
      }
    }
    return this.addEventToFeed(event);
  }

  /**
   * Generates historical events from state history to initialise the feed with.
   * If unexpired health events exist then these are registered for health
   * restore processing.
   * @param count max number of events to populate.
   */
  generateHistorical(count: number): Array<Event> {
    const events: Array<Event> = [];
    const restoreEvents = new Map<string, Event>();

    for (let index=this.#state.history.length-1; index >=0 && events.length < count; index--) {
      const event = this.#state.history[index];
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
  async addEventToFeed(event: Event) {
    if (event.event.series?.id !== undefined && !this.#state.seriesData.has(event.event.series.id)) {
      await this.#state.ensureSeries(new Set([ event.event.series?.id ]));
    }
    this.#state.feed.feed.addItem(await this.#createFeedItem(event));
    if (this.#state.feed.feed.items.length > this.#state.config.feedHighWaterMark) {
      logger.debug(`Feed exceeded high watermark of ${this.#state.config.feedHighWaterMark} items, reducing to ${this.#state.config.feedLowWaterMark}`);
      this.#state.feed.feed.items.splice(0,this.#state.feed.feed.items.length-this.#state.config.feedLowWaterMark);
    }
  }
}
