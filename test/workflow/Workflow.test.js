import assert from 'assert';
import os from 'os';
import { fox } from '../../src/index.js';
import { redditSampleHtml } from './data.js';
import { testCache } from '../lib/util.js';
import { OpenAI } from '../../src/index.js';
import { Fetcher } from '../../src/index.js';

describe('Workflow', function() {
  this.timeout(30 * 1000);

  it('should load steps from json @run', async () => {
    const data = {
      "steps": [
        {
          "name": "const",
          "args": {
            "items": [
              {
                "url": "https://thehackernews.com/"
              }
            ],
            "maxPages": "10"
          }
        },
        {
          "name": "crawl",
          "args": {
            "query": "Find links to articles about malware and other vulnerabilities",
            "limit": "5",
            "maxPages": "10"
          }
        },
        {
          "name": "extract",
          "args": {
            "questions": {
              summary: "Summarize the malware/vulnerability in 5-20 words",
              technical: "What are the technical identifiers like filenames, indicators of compromise, etc.?",
              url: "What is the URL? Format: Absolute URL"
            },
            "maxPages": "10"
          }
        },
        {
          "name": "limit",
          "args": {
            "limit": "2"
          }
        },
        {
          "name": "exportURLs",
          "args": {
            "field": "url",
            "format": "pdf",
            "destination": "google",
            "filename": "a-{url}.pdf",
            "directory": "1_pLorzwxFLXZrQA8DNHPDcqCX5p3szvb"
          }
        }
      ],
    };

    const f = await fox
      .config({ cache: testCache() })
      .load(data);

    assert.equal(
      JSON.stringify(f.dump().steps, null, 2),
      JSON.stringify(data.steps, null, 2));
  });

  it('should publish all steps @run', async () => {
    const f = await fox
      .config({ cache: testCache() })
      .init('https://pokemondb.net/pokedex/national')
      .extract({
        name: 'What is the name of the pokemon?',
        number: 'What is the pokedex number?',
      })
      .limit(3);

    let count = 0;
    let countLoading = 0;

    await f.run(null, (partial) => {
      count++
      if (partial.item?._meta?.status == 'loading') {
        countLoading2++;
      }
    });

    assert.equal(count, 3);
    assert.equal(countLoading, 0, 'loading by default should not publish');

    const f2 = await fox
      .config({
        cache: testCache(),
        publishAllSteps: true,
      })
      .init('https://pokemondb.net/pokedex/national')
      .extract({
        name: 'What is the name of the pokemon?',
        number: 'What is the pokedex number?',
      })
      .limit(3);

    let count2 = 0;
    let countLoading2 = 0;

    await f2.run(null, (partial) => {
      count2++
      if (partial.item?._meta?.status == 'loading') {
        countLoading2++;
      }
    });

    assert.equal(count2, 17, 'all partials received');
    assert.ok(countLoading2 >= 3, 'all loading received');
  });

  it('should describe @run', async () => {
    const data = {
      "steps": [
        {
          "name": "const",
          "args": {
            "items": [
              {
                "url": "https://thehackernews.com/"
              }
            ]
          }
        },
        {
          "name": "crawl",
          "args": {
            "query": "Find links to articles about malware and other vulnerabilities",
            "limit": "5"
          }
        },
        {
          "name": "extract",
          "args": {
            "questions": {
              summary: "Summarize the malware/vulnerability in 5-20 words",
              technical: "What are the technical identifiers like filenames, indicators of compromise, etc.?",
              url: "What is the URL? Format: Absolute URL"
            }
          }
        },
        {
          "name": "limit",
          "args": {
            "limit": "2"
          }
        },
        {
          "name": "exportURLs",
          "args": {
            "field": "url",
            "format": "pdf",
            "destination": "google",
            "filename": "a-{url}.pdf",
            "directory": "1_pLorzwxFLXZrQA8DNHPDcqCX5p3szvb"
          }
        }
      ],
    };

    const wf = await fox
      .config({ cache: testCache() })
      .load(data)
      .plan();
    await wf.describe();

    assert.ok(
      wf.name.toLowerCase().indexOf('hacker') != -1 ||
      wf.name.toLowerCase().indexOf('vuln') != -1 ||
      wf.name.toLowerCase().indexOf('malware') != -1,
      'name sanity check');
    assert.ok(
      wf.description.toLowerCase().indexOf('hacker') != -1,
      'description sanity check');
  });

  // This test doesn't interact well with caching, because caching
  // circumvents the concurrent request tally. Disabled to not run
  // a slow test.
  it('should limit number of fetch requests @disabled', async function() {
    const f = await fox
      .init('https://pokemondb.net/pokedex/national')
      .crawl({
        query: 'Find links to specific Pokemon characters',
      })
      .extract({
        name: 'What is the name of the pokemon?',
        number: 'What is the pokedex number?',
        stats: 'What are the basic stats of this pokemon?',
        single: true,
      })
      .limit(5);

    const out = await f.run();

    assert.equal(out.items.length, 5);

    const max = 20;

    assert.ok(f.ctx.fetcher.usage.completed <= max, 'under max completed');
    assert.ok(f.ctx.fetcher.usage.requests > 10, 'at least 10 requests made');
    assert.ok(f.ctx.crawler.usage.count > 10, 'at least 10 links found');
  });

  it('should plan with html @run', async () => {
    const wf = await fox
      .config({ cache: testCache() })
      .plan({
        url: 'https://www.reddit.com/r/nfl/',
        prompt: 'scrape articles',
        html: redditSampleHtml,
      });
    await wf.describe();

    assert.ok(
      wf.name.toLowerCase().indexOf('nfl') != -1,
      'name should contain nfl');
    assert.ok(
      wf.description.toLowerCase().indexOf('nfl') != -1,
      'description should contain nfl');
  });

  it('should use global limit @run', async function() {
    const data = {
      "options": {
        "limit": 2,
      },
      "steps": [
        {
          "name": "const",
          "args": {
            "items": [
              {
                "url": "https://thehackernews.com/"
              }
            ]
          }
        },
        {
          "name": "crawl",
          "args": {
            "query": "Find links to articles about malware and other vulnerabilities",
          }
        },
        {
          "name": "extract",
          "args": {
            "questions": {
              summary: "Summarize the malware/vulnerability in 5-20 words",
              technical: "What are the technical identifiers like filenames, indicators of compromise, etc.?",
              url: "What is the URL? Format: Absolute URL"
            }
          }
        }
      ],
    };

    const f = await fox
      .config({ cache: testCache() })
      .load(data);
    let count = 0;
    const out = await f.run(null, (partial) => {
      count++;

      if (count > 2) {
        assert.ok(false, 'over limit in partials callback');
      }
    });

    assert.equal(out.items.length, 2);
    assert.equal(count, 2);
  });

  it('should finish with flakey fetcher @run', async function () {
    this.timeout(45 * 1000);

    let count = 0;
    const FlakeyFetcher = class extends Fetcher {
      async *fetch(...args) {
        for await (const out of super.fetch(...args)) {
          if (++count % 2 == 0) {
            throw new Error('flakey fetch');
          } else {
            yield Promise.resolve(out);
          }
        }
      }
    };

    const f = await fox
      .config({
        cache: testCache(),
        fetcher: new FlakeyFetcher({
          concurrency: 4,
          intervalCap: 4,
          interval: 1000,
        }),
      })
      .init('https://pokemondb.net/pokedex/national')
      .crawl('find links to individual character pokemon pages')
      .extract({
        name: 'What is the name of the pokemon? Start with the first one',
        number: 'What is the pokedex number?',
      })
      .limit(5);

    const out = await f.run();
    assert.equal(out.items.length, 5);
  });

  it('should finish incomplete with flakey AI @run', async function () {
    this.timeout(45 * 1000);

    let count = 0;
    const FlakeyAI = class extends OpenAI {
      async *inner(...args) {
        for await (const out of super.inner(...args)) {
          if (++count % 50 == 0) {
            throw new Error('flakey AI');
          } else {
            yield Promise.resolve(out);
          }
        }
      }
    };

    const f = await fox
      .config({
        cache: testCache(),
        ai: new FlakeyAI(),
      })
      .init('https://pokemondb.net/pokedex/national')
      .extract({
        name: 'What is the name of the pokemon? Start with the first one',
        number: 'What is the pokedex number?',
      })
      .limit(5);

    const out = await f.run();

    // Expect 2 because AI error stops the entire stream
    assert.equal(out.items.length, 2);
  });

  it('should finish crawl with flakey AI @run', async function () {
    this.timeout(45 * 1000);

    let count = 0;
    const FlakeyAI = class extends OpenAI {
      async *inner(...args) {
        for await (const out of super.inner(...args)) {
          if (++count % 50 == 0) {
            throw new Error('flakey AI');
          } else {
            yield Promise.resolve(out);
          }
        }
      }
    };

    const f = await fox
      .config({
        cache: testCache(),
        ai: new FlakeyAI(),
      })
      .init('https://pokemondb.net/pokedex/national')
      .crawl('find links to individual character pokemon pages')
      .extract({
        name: 'What is the name of the pokemon? Start with the first one',
        number: 'What is the pokedex number?',
      })
      .limit(5);

    const out = await f.run();

    // TODO: Make this deterministic, and assert a specific number
    assert.ok(out.items.length >= 1);
  });

});
