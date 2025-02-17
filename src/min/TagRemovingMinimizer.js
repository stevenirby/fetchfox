import { parse } from 'node-html-parser';
import pretty from 'pretty';
import { logger } from '../log/logger.js';
import { Document } from '../document/Document.js';
import { BaseMinimizer } from './BaseMinimizer.js';

export const TagRemovingMinimizer = class extends BaseMinimizer {
  constructor(options) {
    super(options);
    this.removeTags = (options || {}).removeTags || ['script', 'style', 'svg', 'symbol', 'link', 'meta'];
  }

  async _min(doc) {
    let removeTags = this.removeTags;
    if (doc.url.indexOf('youtube.com') != -1) {
      logger.debug(`Not removing <script> on youtube.com`);
      removeTags = removeTags.filter(t => t != 'script');
    }

    logger.info(`Minimizing ${doc} by removing tags: ${removeTags.join(', ')}`);

    let initial = (doc.html || '').replace(/[ \t\n]+/g, ' '); // remove extra whitespace
    const root = parse(initial);

    removeTags.forEach(tag => {
      root.querySelectorAll(tag).forEach(element => {
        element.replaceWith('');
      });
    });

    const removeAttributes = ['style'];
    root.querySelectorAll('*').forEach(element => {
      removeAttributes.forEach(attr => {
        element.removeAttribute(attr);
      });
    });

    const data = await doc.dump();
    const html = pretty(root.toString(), { ocd: true });
    data.body = html;
    data.html = html;

    const min = new Document();
    await min.loadData(data);

    min.parse();

    return min;
  }
}
