import fetch from 'node-fetch';
import { logger } from '../log/logger.js';
import { Document } from '../document/Document.js';
import { Client } from '../relay/Client.js';
import { BaseFetcher } from './BaseFetcher.js';
import { presignS3 } from './util.js';
import ShortUniqueId from 'short-unique-id';

export const RelayFetcher = class extends BaseFetcher {
  constructor(options) {
    super(options);
    this.client = new Client(options?.host);
    this.relayId = options?.relayId;

    this.shouldPresignUrl = options?.shouldPresignUrl;
    this.presignId = options?.presignId || 'rf_' +(new ShortUniqueId({
      length: 10,
      dictionary: 'alphanum_lower',
    })).rnd();
    this.s3bucket = options?.s3bucket || process.env.AWS_S3_BUCKET;

    this.shouldClearCookies = options?.shouldClearCookies;

    this._inFlight = 0;
  }

  async _maybeInit() {
    if (this.client.isConnected()) return;
    logger.info(`Connecting to relay ${this.relayId} on ${this.client.host}`);
    const p = this.client.connect(this.relayId);
    await p;
  }

  async *_fetch(url, options) {
    await this._maybeInit();
    this._inFlight++;
    const active = options?.active;
    const waitForText = options?.waitForText;

    let presignedUrl;
    if (this.shouldPresignUrl) {
      presignedUrl = await presignS3({
        bucket: this.s3bucket,
        key: `relay-fetcher/${this.presignId}/${url}`,
        contentType: 'text/html',
        acl: 'public-read',
      });
    }

    try {
      logger.debug(`Relay fetcher sending message expecting reply for ${url}, inflight: ${this._inFlight}`);

      logger.debug(`Expecting reply for ${url}`);

      let timeout;

      const reply = await Promise.race([
        new Promise((ok) => {
          timeout = setTimeout(
            () => {
              logger.error(`Timeout waiting for reply for ${url}`);
              ok();
            },
            60 * 1000);
        }),

        new Promise((ok) => {
          this.client.send(
            { command: 'fetch', url, presignedUrl, active, waitForText },
            (r) => {
              logger.debug(`Got reply for ${url}`);
              ok(r);
            }
          )}),
      ]);

      clearTimeout(timeout);

      if (this.shouldClearCookies) {
        const parts = (new URL(url)).host.split('.');
        const domain = parts.splice(parts.length - 2).join('.');
        logger.debug(`Clearing cookies on ${domain}`);
        this.client.send(
          { command: 'clearCookies', domain },
          (r) => logger.debug(`Got reply clearing cookies on ${domain}: ${r}`));
      }

      if (!reply) {
        return;
      }

      logger.debug(`Relay fetcher got reply: ${Object.keys(reply).join(', ')}`);
      logger.info(`Relay fetcher response: "${(reply?.html || '').substr(0, 140).replace(/[\n\t ]+/g, ' ')} for ${url}`);

      const doc = new Document();
      await doc.loadData(reply);

      logger.debug(`Relay fetcher loaded document for ${url}: ${doc}`);

      yield Promise.resolve(doc);
    } finally {
      this._inFlight--;
      logger.debug(`Still inflight: ${this._inFlight}`);
      if (this._inFlight == 0) {
        logger.info(`Closing relay, in flight: ${this._inFlight}`);
        await this.client.close();
      }
    }
  }
}
