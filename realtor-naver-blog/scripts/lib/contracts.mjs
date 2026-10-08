import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TYPES = ['아파트', '빌라', '오피스텔', '주택', '상가', '사무실', '창고', '공장', '토지'];
export const STYLE_FIELDS = ['honorifics', 'sentence_length', 'paragraph_rhythm', 'opening', 'headings', 'terminology', 'emphasis', 'emoji', 'consultation'];
export function requireThat(value, message) { if (!value) throw new Error(message); }
export function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}
function uniqueIDs(items, label) {
  requireThat(Array.isArray(items), `${label} must be an array`);
  const ids = items.map(x => x.id);
  requireThat(ids.every(nonempty) && new Set(ids).size === ids.length, `${label}: unique nonempty IDs required`);
  return new Set(ids);
}
export function validateListing(listing) {
  requireThat(listing.schema_version === '1.0', 'listing schema_version must be 1.0');
  requireThat(TYPES.includes(listing.property_type), 'unsupported property_type');
  const sourceIDs = uniqueIDs(listing.sources, 'sources');
  for (const source of listing.sources) {
    requireThat(['user', 'listing', 'photo', 'document'].includes(source.kind) && nonempty(source.locator) && nonempty(source.excerpt), 'source needs kind, locator, and original excerpt');
  }
  const factIDs = uniqueIDs(listing.facts, 'facts');
  for (const fact of listing.facts) {
    requireThat(nonempty(fact.label) && ['confirmed', 'unknown', 'conflict'].includes(fact.status), 'fact label/status required');
    requireThat(Array.isArray(fact.source_ids) && fact.source_ids.every(id => sourceIDs.has(id)), `invalid sources: ${fact.id}`);
    if (fact.status === 'confirmed') requireThat(nonempty(fact.value) && fact.source_ids.length, `confirmed fact lacks evidence: ${fact.id}`);
    if (fact.status === 'conflict') requireThat(Array.isArray(fact.alternatives) && fact.alternatives.length >= 2, `conflict needs alternatives: ${fact.id}`);
  }
  for (const [key, expected] of [['type_fact_id', listing.property_type], ['transaction_fact_id', listing.transaction]]) {
    const fact = listing.facts.find(f => f.id === listing[key]);
    requireThat(nonempty(expected) && fact?.status === 'confirmed' && fact.value === expected, `${key} must identify the confirmed classification fact`);
  }
  const photos = listing.photos ?? [];
  uniqueIDs(photos, 'photos');
  for (const photo of photos) requireThat(nonempty(photo.path) && nonempty(photo.label) && sourceIDs.has(photo.source_id), 'photo needs path, observed label, and source_id');
  requireThat(Array.isArray(listing.unknowns) && listing.unknowns.every(nonempty), 'unknowns must be a string array');
  return {factIDs, sourceIDs};
}
export function confirmedRefs(ids, listing, required = true) {
  requireThat(Array.isArray(ids) && (!required || ids.length), 'fact_ids must cite evidence');
  for (const id of ids) requireThat(listing.facts.some(f => f.id === id && f.status === 'confirmed'), `unconfirmed or missing fact: ${id}`);
}
export function validateStrategy(strategy, listing) {
  validateListing(listing);
  requireThat(strategy.schema_version === '1.0', 'strategy schema_version must be 1.0');
  requireThat(strategy.seo_mode === 'inferred_candidates', 'only inferred keyword candidates are supported');
  requireThat(!/(search_volume|competition_score|ranking_estimate)/i.test(JSON.stringify(strategy)), 'do not invent SEO metrics');
  for (const field of ['interpretation', 'primary_target', 'hook']) {
    requireThat(nonempty(strategy[field]?.text), `missing ${field}`);
    confirmedRefs(strategy[field].fact_ids, listing);
  }
  requireThat(nonempty(strategy.primary_target.reason) && nonempty(strategy.search_intent), 'target reasoning and search intent required');
  requireThat(nonempty(strategy.keywords?.main) && strategy.keywords.label === '추천 후보', 'label keywords as 추천 후보');
  requireThat(Array.isArray(strategy.keywords.related) && strategy.keywords.related.length >= 2 && strategy.keywords.related.length <= 4 && strategy.keywords.related.every(nonempty), '2–4 related keyword candidates required');
  requireThat(new Set([strategy.keywords.main, ...strategy.keywords.related]).size === strategy.keywords.related.length + 1, 'keyword candidates must be distinct');
  requireThat(nonempty(strategy.title_direction) && nonempty(strategy.intro_direction), 'title/intro directions required');
  uniqueIDs(strategy.sections, 'sections');
  requireThat(strategy.sections.length > 0, 'content sections required');
  for (const section of strategy.sections) {
    requireThat(nonempty(section.question) && nonempty(section.direction), 'section needs reader question and direction');
    confirmedRefs(section.fact_ids, listing, false);
    requireThat(Array.isArray(section.photo_ids) && section.photo_ids.every(id => listing.photos?.some(p => p.id === id)), 'unknown section photo');
  }
  requireThat(nonempty(strategy.cta?.benefit) && ['phone', 'registered'].includes(strategy.cta.channel), 'CTA needs consultation benefit and channel');
  requireThat(Array.isArray(strategy.checks) && strategy.checks.every(nonempty), 'strategy checks required');
  // Unknowns must remain visible in the strategy instead of silently disappearing.
  for (const unknown of listing.unknowns) requireThat(strategy.checks.includes(unknown), `missing check: ${unknown}`);
  for (const fact of listing.facts.filter(f => f.status !== 'confirmed')) requireThat(strategy.checks.some(x => x.includes(fact.label)), `missing check for ${fact.label}`);
  return strategy;
}
export function blogKey(value) {
  requireThat(nonempty(value), 'blog ID or URL required');
  let id = value.trim();
  if (/^https?:/i.test(id)) {
    const url = new URL(id);
    requireThat(['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname), 'expected a Naver Blog URL');
    id = url.searchParams.get('blogId') || url.pathname.split('/').filter(Boolean)[0] || '';
  }
  requireThat(/^[a-zA-Z0-9_-]+$/.test(id), 'invalid blog ID');
  return id.toLowerCase();
}
export function validateStyle(style) {
  requireThat(style.schema_version === '1.0', 'style schema_version must be 1.0');
  blogKey(style.blog_id);
  for (const field of STYLE_FIELDS) requireThat(nonempty(style.features?.[field]), `missing style feature: ${field}`);
  requireThat(['analyzed', 'default'].includes(style.origin), 'style origin must be analyzed or default');
  requireThat(Array.isArray(style.sources) && style.sources.length <= 5, 'at most five analyzed posts');
  requireThat(Number.isFinite(Date.parse(style.analyzed_at)), 'analysis timestamp required');
  for (const source of style.sources) {
    requireThat(blogKey(source.url) === blogKey(style.blog_id) && nonempty(source.text_excerpt), 'style needs accessible text evidence from this blog');
    const url = new URL(source.url);
    requireThat(/^\d+$/.test(url.searchParams.get('logNo') || url.pathname.split('/').filter(Boolean)[1] || ''), 'style source must identify a public post, not just a blog home');
  }
  requireThat(new Set(style.sources.map(s => s.url)).size === style.sources.length, 'style source URLs must be distinct');
  requireThat(style.origin !== 'analyzed' || style.sources.length > 0, 'no accessible text: use default style');
  requireThat(style.origin !== 'default' || nonempty(style.fallback_reason), 'default style needs fallback reason');
  return {...style, blog_id: blogKey(style.blog_id), limited_sample: style.sources.length < 3};
}
