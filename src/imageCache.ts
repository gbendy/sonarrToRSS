import type { Response } from 'express';
import { SeriesResource } from './sonarrApiV3';
import { State } from './state';
//import { forCategory } from './logger';

//const logger = forCategory('cache');

export type ImageStore = {
  image?: Buffer;
  contentType?: string;
  waiting: Array<Response>;
  getting: boolean;
};

function sendBuffer(buffer: Buffer, contentType: string|undefined, res: Response) {
  res.statusCode = 200;
  if (contentType) {
    res.setHeader('content-type', contentType);
  }
  res.end(buffer);
}

export class ImageCache {
  #state: State;
  #currentSize: number;
  #cachedImages: Map<string, ImageStore> = new Map<string, ImageStore>;

  constructor(state: State) {
    this.#state = state;
    this.#currentSize = 0;
  }

  #getSeriesImageId(series: SeriesResource, filename: string) {
    return `${series.id}:${filename}`;
  }

  async getSeriesImage(series: SeriesResource, filename: string, res: Response) {
    const imageId = this.#getSeriesImageId(series, filename);
    let cached = this.#cachedImages.get(imageId);
    if (cached && cached.image) {
      sendBuffer(cached.image, cached.contentType, res);
      // delete and reset to update LRU.
      this.#cachedImages.delete(imageId);
      this.#cachedImages.set(imageId, cached);
      return;
    }
    if (!this.#state.sonarrApi) {
      // no API and we don't have the image. Just 500 it.
      res.statusCode = 500;
      res.end();
      return;
    }
    if (!cached) {
      this.#cachedImages.set(imageId, {
        waiting: [],
        getting: false
      });
      cached = this.#cachedImages.get(imageId) as ImageStore;
    }
    cached.waiting.push(res);

    if (!cached.getting) {
      cached.getting = true;
      try {
        const result = await this.#state.sonarrApi.getBuffer(`mediacover/${series.id}/${filename}`);
        cached.getting = false;

        for (const waitingRes of cached.waiting) {
          sendBuffer(result.buffer, result.contentType, waitingRes);
        }
        const maxCacheSize = this.#state.config.maxImageCacheSize * 1048576;
        if (result.buffer.byteLength > maxCacheSize) {
          //logger.debug(`image ${imageId} (${result.buffer.byteLength}) too large for cache ${maxCacheSize}`);
          // image is larger than cache size, discard it
          this.#cachedImages.delete(imageId);
        } else {
          cached.image = result.buffer;
          cached.contentType = result.contentType;
          this.#currentSize += result.buffer.byteLength;

          // remove images in cache in LRU order until below max size
          while (this.#currentSize > maxCacheSize && this.#cachedImages.size) {
            const key = this.#cachedImages.keys().next().value;
            const dropping = this.#cachedImages.get(key) as ImageStore;
            //logger.debug(`cache overflow ${this.#currentSize}/${maxCacheSize} when storing ${imageId} (${result.buffer.byteLength}). Dropping ${key} (${dropping.image?.byteLength})`);
            // we know that key exists and that it has a buffer
            this.#currentSize -= (dropping.image as Buffer).byteLength;
            this.#cachedImages.delete(key);
          }
          //logger.debug(`added ${imageId} (${result.buffer.byteLength}) to cache ${this.#currentSize}/${maxCacheSize}.`);
        }
      } catch(e) {
        for (const waitingRes of cached.waiting) {
          waitingRes.statusCode = 500;
          waitingRes.status = e as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          waitingRes.end();
        }
        cached.waiting.length = 0;
      }
    }
  }
}

