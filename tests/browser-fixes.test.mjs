import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Workflow} from '../realtor-naver-blog/scripts/lib/workflow.mjs';
import {hash} from '../realtor-naver-blog/scripts/lib/contracts.mjs';
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
import {validateStrategy} from '../realtor-naver-blog/scripts/lib/contracts.mjs';
const importer = () => import(pathToFileURL(path.resolve('realtor-naver-blog/scripts/import-listing.mjs')).href);

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

test('post-template pre-fills hashes, every photo, the fact table and the banner hash', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-template-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==', 'base64');
  fs.mkdirSync(path.join(dir, 'photos'));
  for (const f of ['thumbnail.png', 'cta-banner.png', 'photos/01.png', 'photos/02.png']) fs.writeFileSync(path.join(dir, f), png);
  const {listing, strategy} = fixture(factory);
  listing.photos = [{id: 'p1', path: 'photos/01.png', label: '외관', source_id: 'input'}, {id: 'p2', path: 'photos/02.png', label: '내부', source_id: 'input'}];
  strategy.sections[0].photo_ids = ['p2'];
  const flow = new Workflow(dir);
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(strategy), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  const out = flow.postTemplate(office);
  assert.equal(out.photos, 2);
  const tpl = JSON.parse(fs.readFileSync(out.template, 'utf8'));
  const photoIds = tpl.blocks.filter(b => b.role === 'photo').map(b => b.photo_id);
  assert.deepEqual(photoIds, ['p2', 'p1'], 'section photo first, then every remaining photo');
  assert.throws(() => flow.prepare(tpl, office, 'fixture-blog'), /TODO/);
  const filled = JSON.parse(JSON.stringify(tpl).replace(/"TODO[^"]*"/g, '"채운 문장입니다."'));
  filled.style = {origin: 'default', summary: '차분한 존댓말'};
  filled.fact_review = {completed: true, notes: '테스트 검수'};
  filled.title = {text: '파주 공장 창고 매매 23억', fact_ids: ['location', 'type', 'conditions']};
  filled.map_omission_reason = '테스트 입력에 상세 위치 없음';
  for (const b of filled.blocks) if (b.type === 'image') b.reviewed = true;
  flow.prepare(filled, office, 'fixture-blog');
  const md = fs.readFileSync(path.join(dir, 'blog-post.md'), 'utf8');
  assert.ok(md.includes('| conditions | 매매가 23억 원, 연면적 594㎡, 층고 8.5m |'));
});

test('condition table keeps the measured Naver styling: borders, shaded bold label column, 28:72, no 항목/내용 row', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-table-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'sample.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==', 'base64'));
  const flow = new Workflow(dir);
  const {listing, strategy, post} = fixture(factory);
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(strategy), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  flow.prepare(post, office, 'fixture-blog');
  const html = fs.readFileSync(path.join(dir, 'transfer.html'), 'utf8');
  const table = html.match(/<table[\s\S]*?<\/table>/)[0];
  assert.match(table, /border-collapse:collapse/);
  assert.match(table, /border:1px solid #d9dde2/);
  assert.match(table, /background-color:#f5f6f8;width:28%"><span style="font-size:15px;font-weight:700;">/);
  assert.match(table, /width:72%/);
  assert.doesNotMatch(table, /<th|>항목</);
  assert.match(table, /text-align: center/);
});

test('font sizes are explicit on every block: body 16px, headings 24px bold, table 15px; emphasis uses measured spans', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-font-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'sample.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==', 'base64'));
  const flow = new Workflow(dir);
  const {listing, strategy, post} = fixture(factory);
  post.blocks.splice(1, 0, {type: 'paragraph', text: '층고는 **8.5m**이고 ==40피트== 진입이 됩니다.', fact_ids: ['conditions']});
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(strategy), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  try { flow.prepare(post, office, 'fixture-blog'); } catch (e) { if (!/unsupported number 40/.test(e.message)) throw e; post.blocks[1].text = '층고는 **8.5m**이고 ==높은 층고==가 장점입니다.'; flow.prepare(post, office, 'fixture-blog'); }
  const html = fs.readFileSync(path.join(dir, 'transfer.html'), 'utf8');
  const paras = html.split('\n').filter(l => l.startsWith('<p'));
  assert.ok(paras.length > 5);
  for (const p of paras) assert.match(p, /<span style="font-size:(16|24)px;/, p);
  assert.match(html, /<span style="font-size:24px;font-weight:700;">/);
  assert.doesNotMatch(html, /<h2|<strong>|<mark>/);
  assert.match(html, /<span style="font-weight:700;">8\.5m<\/span>/);
  assert.match(html, /<span style="background-color:#fff3b0;">/);
});

test('number check: "현대1,2차" is not 12, and 1976.06.07 equals 1976년 6월 7일', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-num-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'sample.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==', 'base64'));
  const flow = new Workflow(dir);
  const {listing, strategy, post} = fixture(factory);
  listing.facts.push({id: 'complex', label: '단지', value: '현대1,2차', status: 'confirmed', source_ids: ['input']});
  listing.facts.push({id: 'built', label: '사용승인', value: '1976.06.07', status: 'confirmed', source_ids: ['input']});
  strategy.fact_coverage.push({fact_id: 'complex', decision: 'use', reason: '제목'}, {fact_id: 'built', decision: 'use', reason: '표'});
  post.listing_hash = hash(listing); post.strategy_hash = hash(strategy);
  post.blocks.splice(1, 0, {type: 'paragraph', text: '현대1·2차 단지이며 1976년 6월 7일에 사용승인됐습니다.', fact_ids: ['complex', 'built']});
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(strategy), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  flow.prepare(post, office, 'fixture-blog');
  post.blocks[1].text = '현대12차 단지입니다.';
  assert.throws(() => flow.prepare(post, office, 'fixture-blog'), /unsupported number 12/);
});

test('propose adds missing unknowns to checks instead of failing', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-unk-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const flow = new Workflow(dir);
  const {listing, strategy} = fixture(factory);
  flow.listing(listing);
  flow.propose({...strategy, checks: []});
  assert.deepEqual(flow.read('strategy.json').checks, listing.unknowns);
});

test('post-template keeps the condition table to key specs (max 12) and lists the rest for prose', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-rows-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const flow = new Workflow(dir);
  const {listing, strategy} = fixture(factory);
  for (let i = 0; i < 20; i++) listing.facts.push({id: 'x' + i, label: i % 2 ? '관리비 항목' + i : '주변 시설' + i, value: '값' + i, status: 'confirmed', source_ids: ['input']});
  strategy.fact_coverage = listing.facts.filter(f => f.status === 'confirmed').map(f => ({fact_id: f.id, decision: 'use', reason: '사용'}));
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(flow.read('strategy.json')), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  const out = flow.postTemplate(office);
  assert.ok(out.table_rows <= 12);
  const tpl = JSON.parse(fs.readFileSync(out.template, 'utf8'));
  const rows = tpl.blocks.find(b => b.type === 'table').rows;
  assert.ok(rows.every(r => /관리비/.test(r.label)), 'key specs chosen by label');
  assert.ok(tpl.body_facts_todo.some(f => /주변 시설/.test(f.label)), 'others left for prose');
});

function transferring(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnb-verify-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'sample.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==', 'base64'));
  const flow = new Workflow(dir);
  const {listing, strategy, post} = fixture(factory);
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash: hash(listing), strategy_hash: hash(flow.read('strategy.json')), user_quote: '테스트 시뮬레이션: 이 전략으로 진행'});
  flow.prepare(post, office, 'fixture-blog');
  flow.begin(office);
  const m = flow.read('manifest.json');
  const good = {
    saved: true, save_signal: '임시저장 목록 1→2', saved_identity: 'fixture-blog / 제목 / 19:43', reopened_identity: 'fixture-blog / 제목 / 19:43',
    title: m.title,
    paragraphs: [...m.text_blocks.map(t => ({text: t, bold: m.headings.includes(t), size: m.headings.includes(t) ? 24 : 16})), {text: m.contact.label, bold: false, size: 16}],
    images: m.images.map(() => ({loaded: true})),
    tables: [{rows: m.tables[0], bordered: true}],
    maps: [], links: [{href: m.contact.href}], image_links: [m.contact.href]
  };
  return {flow, m, good};
}

test('verify: a clean reopened draft is SAVED / 완료 without hand comparison', t => {
  const {flow, good} = transferring(t);
  const out = flow.verify(good);
  assert.equal(out.result.status, 'SAVED');
  assert.equal(out.result.quality, '완료');
  assert.deepEqual(out.failed, []);
  assert.match(out.checks.contact.evidence, /배너 이미지 링크도 일치/);
});

test('verify catches the measured failures: bold bleed, leftover placeholder, lost tel link', t => {
  const {flow, m, good} = transferring(t);
  const body = m.text_blocks.find(x => !m.headings.includes(x));
  const bad = {...good,
    paragraphs: [...good.paragraphs.map(p => p.text === body ? {...p, bold: true, size: 24} : p), {text: '@@IMG:2@@'}],
    links: []};
  const out = flow.verify(bad);
  assert.equal(out.result.status, 'SAVED');
  assert.equal(out.result.quality, '보완 필요');
  assert.match(out.checks.body.evidence, /번진 본문/);
  assert.match(out.checks.body.evidence, /@@IMG:2@@/);
  assert.match(out.checks.contact.evidence, /tel 링크 없음/);
});

test('verify never passes what it could not observe', t => {
  const {flow, good} = transferring(t);
  const {paragraphs, images, links, ...partial} = good;
  const out = flow.verify({...partial, body_text: ''});
  assert.equal(out.result.quality, '확인 불가');
  assert.ok(out.unknown.length >= 2);
});
