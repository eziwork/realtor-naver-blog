import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readJSON, writeJSON, hash, nonempty, requireThat, validateListing, validateStrategy, validateStyle, blogKey} from './contracts.mjs';
import {renderPost, officeFingerprint} from './content.mjs';

export class Workflow {
  constructor(runDir) { this.dir = path.resolve(runDir); this.file = path.join(this.dir, 'run-state.json'); }
  read(name) { return readJSON(path.join(this.dir, name)); }
  put(name, data) { writeJSON(path.join(this.dir, name), data); }
  state() { return fs.existsSync(this.file) ? readJSON(this.file) : {schema_version: '1.0', phase: 'input', approval: null, attempts: []}; }
  save(state) { state.updated_at = new Date().toISOString(); writeJSON(this.file, state); return state; }
  listing(data) {
    validateListing(data);
    const state = this.state();
    const changed = state.listing_hash !== hash(data);
    this.put('facts.json', data);
    if (changed) { state.approval = null; state.phase = 'facts_ready'; state.prepared = null; state.result = null; }
    state.listing_hash = hash(data);
    return this.save(state);
  }
  propose(data) {
    const listing = this.read('facts.json');
    validateStrategy(data, listing);
    const state = this.state();
    requireThat(state.listing_hash === hash(listing), 'facts changed outside workflow: stage facts again');
    this.put('strategy.json', data);
    state.strategy_hash = hash(data); state.approval = null; state.prepared = null; state.result = null;
    state.phase = 'awaiting_strategy_confirmation';
    return this.save(state);
  }
  approve({strategy_hash, listing_hash, user_quote}) {
    const state = this.state();
    requireThat(state.phase === 'awaiting_strategy_confirmation', 'no strategy awaiting confirmation');
    requireThat(nonempty(user_quote), 'record the actual user confirmation, never infer it');
    requireThat(strategy_hash === state.strategy_hash && listing_hash === state.listing_hash, 'confirmation is for a different revision');
    requireThat(hash(this.read('facts.json')) === listing_hash && hash(this.read('strategy.json')) === strategy_hash, 'files changed since recommendation');
    state.approval = {strategy_hash, listing_hash, user_quote, confirmed_at: new Date().toISOString()};
    state.phase = 'strategy_confirmed';
    return this.save(state);
  }
  approved() {
    const state = this.state();
    requireThat(state.approval && state.approval.listing_hash === hash(this.read('facts.json')) && state.approval.strategy_hash === hash(this.read('strategy.json')), 'STRATEGY_CONFIRMATION_REQUIRED');
    return state;
  }
  prepare(post, office, blog) {
    const state = this.approved();
    const key = blogKey(blog);
    if (state.blog_id && state.blog_id !== key) requireThat(state.attempts.length === 0, 'cannot move an attempted draft to another blog; use a new run');
    const rendered = renderPost(post, this.read('facts.json'), this.read('strategy.json'), office, this.dir);
    this.put('post.json', post);
    fs.writeFileSync(path.join(this.dir, 'blog-post.md'), rendered.markdown);
    fs.writeFileSync(path.join(this.dir, 'transfer.html'), rendered.html);
    this.put('manifest.json', rendered.manifest);
    state.blog_id = key;
    state.prepared = {post_hash: hash(post), html_hash: hash(rendered.html), markdown_hash: hash(rendered.markdown), manifest_hash: hash(rendered.manifest), office_hash: officeFingerprint(office)};
    state.artifacts = {post: 'post.json', draft: 'blog-post.md', html: 'transfer.html', manifest: 'manifest.json'};
    state.phase = 'prepared'; state.result = null;
    return this.save(state);
  }
  begin(office) {
    const state = this.approved();
    requireThat(state.prepared, 'prepare before browser entry');
    requireThat(state.prepared.office_hash === officeFingerprint(office), 'office profile changed: refresh banner and prepare again');
    for (const [file, expected] of [['post.json', state.prepared.post_hash], ['manifest.json', state.prepared.manifest_hash]]) requireThat(hash(this.read(file)) === expected, `artifact changed: ${file}`);
    for (const [file, expected] of [['transfer.html', state.prepared.html_hash], ['blog-post.md', state.prepared.markdown_hash]]) requireThat(hash(fs.readFileSync(path.join(this.dir, file), 'utf8')) === expected, `artifact changed: ${file}`);
    for (const img of this.read('manifest.json').images) requireThat(fs.existsSync(img.path) && hash(fs.readFileSync(img.path).toString('base64')) === img.sha256, 'image changed after review');
    const last = state.attempts.at(-1);
    if (last) requireThat(state.reconciliation?.attempt_id === last.id && nonempty(state.reconciliation.evidence), 'CHECK_DRAFT_LIST_FIRST: previous attempt may already exist');
    const attempt = {id: crypto.randomUUID(), started_at: new Date().toISOString(), resume_draft_identity: state.reconciliation?.matched_identity ?? null, prepared_hash: hash(state.prepared)};
    state.attempts.push(attempt); state.reconciliation = null; state.result = null; state.phase = 'transferring';
    return this.save(state);
  }
  reconcile(evidence) {
    const state = this.state(), last = state.attempts.at(-1);
    requireThat(last && evidence.draft_list_checked === true && nonempty(evidence.evidence), 'inspect draft list and record evidence');
    requireThat(evidence.matched_identity === null || nonempty(evidence.matched_identity), 'matched_identity must be a draft identity or null for verified absence');
    requireThat(!(last.result?.status === 'SAVED' && !evidence.matched_identity), 'saved draft must be reopened, not recreated');
    state.reconciliation = {...evidence, attempt_id: last.id, checked_at: new Date().toISOString()};
    return this.save(state);
  }
  record(evidence) {
    const state = this.state(), last = state.attempts.at(-1);
    requireThat(state.phase === 'transferring' && last && evidence.attempt_id === last.id, 'evidence must match the active browser attempt');
    requireThat(nonempty(evidence.observation), 'describe the observed browser result');
    requireThat(['saved', 'blocked', 'failed', 'unknown'].includes(evidence.outcome), 'invalid outcome');
    const saved = evidence.outcome === 'saved' && nonempty(evidence.save_signal) && nonempty(evidence.saved_identity);
    requireThat(evidence.outcome !== 'saved' || saved, 'SAVED requires observed save signal and draft identity');
    const reopened = saved && evidence.reopened_identity === evidence.saved_identity;
    const checks = ['title', 'body', 'images', 'table', 'map', 'contact'];
    for (const key of checks) if (evidence.checks?.[key]) {
      const check = evidence.checks[key];
      requireThat(['pass', 'fail', 'unknown', 'not_applicable'].includes(check.result) && nonempty(check.evidence), `invalid ${key} check`);
      if (check.result === 'not_applicable') requireThat(key === 'map' && this.read('manifest.json').maps.length === 0, 'only an explicitly omitted map can be not applicable');
    }
    const all = checks.every(k => ['pass', 'not_applicable'].includes(evidence.checks?.[k]?.result));
    const failed = checks.some(k => evidence.checks?.[k]?.result === 'fail');
    // A failure after any attempted write still needs reconciliation, even without a save click.
    const status = saved ? 'SAVED' : ({blocked:'BLOCKED', failed:'FAILED', unknown:'UNVERIFIED'}[evidence.outcome]);
    const quality = reopened && failed ? '보완 필요' : reopened && all ? '완료' : '확인 불가';
    const result = {status, quality, prepared_hash: last.prepared_hash, draft_identity: evidence.saved_identity ?? null, evidence, verified_at: new Date().toISOString()};
    last.result = result; state.result = result; state.phase = quality === '완료' ? 'verified' : 'needs_attention';
    this.put('verification.json', result);
    return this.save(state);
  }
}

export function getStyle(profileDir, blog) {
  const file = path.join(profileDir, 'blog-styles.json');
  return fs.existsSync(file) ? readJSON(file).blogs?.[blogKey(blog)] ?? null : null;
}
export function saveStyle(profileDir, input, changeRequest) {
  const style = validateStyle(input), file = path.join(profileDir, 'blog-styles.json');
  const store = fs.existsSync(file) ? readJSON(file) : {schema_version:'1.0', blogs:{}};
  requireThat(!store.blogs[style.blog_id] || nonempty(changeRequest), 'stored style is stable; updating requires the actual user change request');
  store.blogs[style.blog_id] = {...style, change_request: changeRequest ?? null};
  writeJSON(file, store); return store.blogs[style.blog_id];
}
