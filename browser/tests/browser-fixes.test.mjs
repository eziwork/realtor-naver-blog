import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Workflow} from '../realtor-naver-blog-browser/scripts/lib/workflow.mjs';
import {hash} from '../realtor-naver-blog-browser/scripts/lib/contracts.mjs';
import {fixture, scenarios, office} from './fixtures.mjs';

const factory = scenarios.find(s => s.type === '공장·창고');

function prepared(t, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-fix-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'sample.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==', 'base64'));
  const flow = new Workflow(dir);
  const {listing, strategy, post} = fixture(factory);
  mutate?.(post);
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(strategy), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  flow.prepare(post, office, 'fixture-blog');
  return fs.readFileSync(path.join(dir, 'blog-post.md'), 'utf8');
}

test('공장·창고 is a supported property type', t => {
  const md = prepared(t);
  assert.ok(md.includes('층고 8.5m'));
});

test('"23억" in prose is accepted when the fact says "23억 원"', t => {
  const md = prepared(t, post => {
    post.title.text = '파주 공장 창고 매매 23억';
    post.title.fact_ids = ['location', 'type', 'conditions'];
  });
  assert.match(md, /^# 파주 공장 창고 매매 23억$/m);
});

test('a price that is not in the facts is still rejected', t => {
  assert.throws(() => prepared(t, post => {
    post.title.text = '파주 공장 창고 매매 25억';
    post.title.fact_ids = ['location', 'type', 'conditions'];
  }), /unsupported number 25/);
});

import {pathToFileURL} from 'node:url';
import {validateStrategy} from '../realtor-naver-blog-browser/scripts/lib/contracts.mjs';
const importer = () => import(pathToFileURL(path.resolve('realtor-naver-blog-browser/scripts/import-listing.mjs')).href);

function thumbCapture(dir, extra = {}) {
  fs.writeFileSync(path.join(dir, 'one.jpg'), 'thumb');
  return {
    schema_version: 'browser-capture-1.0', article_no: '2654275369', method: 'dom', api: null,
    ui_photo_count: null,
    photos: [{url: 'https://landthumb-phinf.pstatic.net/2026/a.jpg?type=m562', file: path.join(dir, 'one.jpg')}],
    ...extra
  };
}

test('the 2026-10-10 failure (DOM only, no count, one thumbnail) is marked incomplete and blocks facts', async t => {
  const {importCapture} = await importer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-incomplete-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const out = importCapture(dir, thumbCapture(dir));
  assert.equal(out.complete, false);
  assert.equal(out.next, 'recollect_or_ask_user');
  for (const code of ['api_not_attempted', 'ui_count_missing', 'thumbnail_only']) {
    assert.ok(out.incomplete_reasons.some(r => r.startsWith(code)), code);
  }
  const {listing} = fixture(factory);
  assert.throws(() => new Workflow(dir).listing(listing), /PHOTO_COLLECTION_INCOMPLETE/);
});

test('incomplete collection can proceed only with a recorded user answer', async t => {
  const {importCapture} = await importer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-accept-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  assert.equal(importCapture(dir, thumbCapture(dir), {acceptIncomplete: '  '}).accepted_incomplete, false);
  const out = importCapture(dir, thumbCapture(dir), {acceptIncomplete: '사진 1장으로 진행해줘'});
  assert.equal(out.accepted_incomplete, true);
  const {listing} = fixture(factory);
  new Workflow(dir).listing(listing);
});

test('a full collection with an API attempt and matching count is complete', async t => {
  const {importCapture} = await importer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-complete-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'a'); fs.writeFileSync(path.join(dir, 'b.jpg'), 'b');
  const out = importCapture(dir, {
    schema_version: 'browser-capture-1.0', article_no: '2654275369', method: 'dom',
    api_attempt: {tried: true, ok: false, error: 'fetch blocked in read-only scope'}, ui_photo_count: 2,
    photos: [{url: 'https://landthumb-phinf.pstatic.net/a.jpg', file: path.join(dir, 'a.jpg')},
             {url: 'https://landthumb-phinf.pstatic.net/b.jpg', file: path.join(dir, 'b.jpg')}]
  });
  assert.equal(out.complete, true);
});

test('strategy must classify every confirmed fact as use or exclude with a reason', () => {
  const {listing, strategy} = fixture(factory);
  assert.doesNotThrow(() => validateStrategy(strategy, listing));
  const dropped = {...strategy, fact_coverage: strategy.fact_coverage.slice(1)};
  assert.throws(() => validateStrategy(dropped, listing), /fact_coverage missing confirmed facts/);
  const noReason = {...strategy, fact_coverage: strategy.fact_coverage.map((r, i) => i ? r : {...r, decision: 'exclude', reason: ''})};
  assert.throws(() => validateStrategy(noReason, listing), /needs a reason/);
  const {fact_coverage, ...missing} = strategy;
  assert.throws(() => validateStrategy(missing, listing), /fact_coverage required/);
});
