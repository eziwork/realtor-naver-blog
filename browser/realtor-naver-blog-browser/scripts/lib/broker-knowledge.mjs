import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {TYPES, hash, readJSON, writeJSON, nonempty, requireThat, validateListing} from './contracts.mjs';

const normalized = text => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const same = (a, b) => hash(a) === hash(b);
const now = () => new Date().toISOString();
const unique = values => [...new Set(values)];
function checkPrivacy(value) {
  requireThat(!/(?:01[016789][\s-]?\d{3,4}[\s-]?\d{4}|\b0\d{1,2}-\d{3,4}-\d{4}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\d{6}-[1-4]\d{6})/i.test(JSON.stringify(value)), 'remove personal contact/identifier data from knowledge');
}
const SOURCE_KEYS = ['kind', 'locator', 'excerpt'];
function userSource(source) {
  requireThat(source?.kind === 'user' && nonempty(source.locator) && nonempty(source.excerpt), 'actual user source locator/excerpt required');
  return Object.fromEntries(SOURCE_KEYS.map(key => [key, source[key]]));
}
function plainStrings(values, label) {
  requireThat(Array.isArray(values) && values.every(nonempty), `${label} must be a string array`);
  return unique(values.map(normalized)).sort();
}

export function validateContext(input, listing) {
  validateListing(listing);
  requireThat(input.schema_version === '1.0' && input.listing_hash === hash(listing), 'context must belong to the current listing');
  requireThat(['sufficient', 'needed'].includes(input.assessment), 'context assessment must be sufficient or needed');
  requireThat(nonempty(input.reason), 'context assessment reason required');
  requireThat(['not_needed', 'asked', 'answered', 'skipped', 'unanswered'].includes(input.status), 'invalid context question status');
  requireThat(Array.isArray(input.questions) && input.questions.length <= 2, 'at most two field questions');
  const keys = input.questions.map(q => q.key);
  requireThat(new Set(keys).size === keys.length && keys.every(k => ['recommendation', 'reaction'].includes(k)), 'field questions must have distinct recommendation/reaction keys');
  requireThat(input.questions.every(q => nonempty(q.text)) && new Set(input.questions.map(q=>normalized(q.text))).size === keys.length, 'duplicate or empty field question');
  if (input.assessment === 'sufficient') requireThat(input.status === 'not_needed' && !keys.length, 'sufficient input must not trigger questions');
  else requireThat(input.status !== 'not_needed' && keys.length > 0, 'needed assessment requires recorded questions');
  requireThat(Array.isArray(input.items), 'context items required');
  requireThat(new Set(input.items.map(i=>i.id)).size === input.items.length, 'duplicate context item');
  const items = input.items.map(item => {
    requireThat(nonempty(item.id) && ['fact','evaluation','customer_reaction'].includes(item.kind) && nonempty(item.text), 'invalid context item');
    const source = userSource(item.source);
    requireThat(Array.isArray(item.fact_ids), 'context item fact_ids required');
    if (item.kind !== 'fact') requireThat(item.fact_ids.length === 0, 'evaluations and reactions cannot become listing facts');
    else {
      requireThat(item.fact_ids.length > 0, 'fact context must link confirmed user facts');
      for (const id of item.fact_ids) {
        const fact = listing.facts.find(f=>f.id===id);
        requireThat(fact?.status === 'confirmed' && fact.source_ids.some(sid=>{
          const s=listing.sources.find(s=>s.id===sid);
          return s?.kind==='user' && s.locator===source.locator && s.excerpt===source.excerpt;
        }), 'context facts must use the actual matching user source');
      }
    }
    return {id:item.id, kind:item.kind, text:item.text, source, fact_ids:unique(item.fact_ids)};
  });
  return {schema_version:'1.0', listing_hash:input.listing_hash, assessment:input.assessment, reason:input.reason, status:input.status, questions:input.questions.map(q=>({key:q.key,text:q.text})), items};
}

export function saveContext(runDir, input, listing) {
  const context = validateContext(input, listing), file = path.join(runDir,'broker-context.json');
  if (fs.existsSync(file)) {
    const old = readJSON(file);
    // One question batch per listing run. Answers can add detail, not another interview.
    if (old.questions.length) requireThat(same(old.questions,context.questions), 'do not ask another field-question batch in this run');
    if (old.status !== 'asked') requireThat(context.status !== 'asked', 'do not re-open a completed or skipped question batch');
  }
  writeJSON(file,{...context,updated_at:now()});
  return context;
}

const knowledgeFile = profileDir => path.join(profileDir,'office-knowledge.json');
function readStore(profileDir) {
  const file = knowledgeFile(profileDir);
  const store = fs.existsSync(file) ? readJSON(file) : {schema_version:'1.0',items:[]};
  requireThat(store.schema_version === '1.0' && Array.isArray(store.items), 'unsupported office knowledge store');
  return store;
}
function normalizeKnowledge(input) {
  requireThat(['consultation_question','explanation_priority'].includes(input.kind) && nonempty(input.text), 'knowledge must be a consultation question or explanation priority');
  const source = userSource(input.source);
  requireThat(input.source.scope === 'office_pattern', 'only explicit recurring office patterns can be remembered');
  requireThat(input.privacy_reviewed === true, 'remove customer names and contacts before remembering');
  const scope = {
    property_types:plainStrings(input.scope?.property_types,'property_types'),
    regions:plainStrings(input.scope?.regions,'regions'),
    transactions:plainStrings(input.scope?.transactions,'transactions'),
  };
  requireThat(scope.property_types.every(t=>TYPES.includes(t)), 'unknown property type in knowledge scope');
  // Scope is reviewed by Codex against the quote. Empty arrays mean the user meant all.
  requireThat(nonempty(input.scope_reason), 'explain the user-stated scope; do not broaden it');
  const safe = {kind:input.kind,text:input.text.trim(),scope,scope_reason:input.scope_reason,source:{...source,scope:'office_pattern'},privacy_reviewed:true};
  checkPrivacy(safe);
  return safe;
}
const dedupeKey = item => hash({kind:item.kind,text:normalized(item.text).replace(/[\p{P}\p{Z}]/gu,''),scope:item.scope});
export const knowledgeSnapshot = item => ({id:item.id,revision:item.revision,kind:item.kind,text:item.text,scope:item.scope,source:item.source});

export function saveKnowledge(profileDir, input) {
  const safe=normalizeKnowledge(input), store=readStore(profileDir), stamp=now();
  requireThat(Array.isArray(input.replaces ?? []) && Array.isArray(input.conflicts_with ?? []), 'replaces/conflicts_with must be arrays');
  const replaces=unique(input.replaces ?? []), conflicts=unique(input.conflicts_with ?? []);
  requireThat(!replaces.length || !conflicts.length, 'choose correction or conflict, not both');
  for (const id of [...replaces,...conflicts]) requireThat(store.items.some(i=>i.id===id && i.status!=='inactive'), `missing active/conflicted knowledge: ${id}`);
  if (replaces.length) requireThat(nonempty(input.change_request), 'explicit correction request required');
  if (conflicts.length) requireThat(nonempty(input.conflict_reason), 'ambiguous conflict reason required');
  checkPrivacy({change_request:input.change_request,conflict_reason:input.conflict_reason});
  const duplicate=[...store.items].reverse().find(i=>dedupeKey(i)===dedupeKey(safe));
  if (duplicate && !replaces.length && !conflicts.length) {
    return {action:'unchanged',item:duplicate,notice:duplicate.status==='inactive'?'잊기로 한 항목은 자동으로 다시 활성화하지 않습니다.':'이미 기록된 상담 노하우입니다.'};
  }
  // A correction must resolve a whole conflicting group, not silently pick one half.
  const required = unique(replaces.flatMap(id=>store.items.find(i=>i.id===id)?.conflicts_with ?? []));
  requireThat(required.every(id=>replaces.includes(id) || store.items.find(i=>i.id===id)?.status==='inactive'), 'resolve all conflicting items in the explicit correction');
  const entry={...safe,id:'know-'+crypto.randomUUID(),revision:1,status:conflicts.length?'conflict':'active',created_at:stamp,updated_at:stamp,replaces,conflicts_with:conflicts};
  if (replaces.length) entry.change_request=input.change_request;
  if (conflicts.length) entry.conflict_reason=input.conflict_reason;
  for (const id of replaces) Object.assign(store.items.find(i=>i.id===id),{status:'inactive',superseded_by:entry.id,updated_at:stamp});
  for (const id of conflicts) {
    const old=store.items.find(i=>i.id===id);
    Object.assign(old,{status:'conflict',conflicts_with:unique([...(old.conflicts_with ?? []),entry.id]),updated_at:stamp});
  }
  store.items.push(entry); writeJSON(knowledgeFile(profileDir),store);
  return {action:conflicts.length?'conflict':replaces.length?'replaced':'saved',item:entry,notice:conflicts.length?'상충하는 상담 노하우는 적용을 보류했습니다.':`사무소 상담 노하우로 기억했습니다: ${entry.text}`};
}

export function retireKnowledge(profileDir, {id,user_request}) {
  requireThat(nonempty(user_request), 'actual forget request required');
  const store=readStore(profileDir), item=store.items.find(i=>i.id===id);
  requireThat(item,'knowledge item not found');
  // Keep only the instruction to retire, not a customer-identifying conversation dump.
  checkPrivacy(user_request);
  Object.assign(item,{status:'inactive',retired_at:now(),updated_at:now(),retire_request:user_request});
  writeJSON(knowledgeFile(profileDir),store);
  return {action:'retired',id,notice:'이 상담 노하우를 다음 작업에 적용하지 않습니다.'};
}

export function matchesKnowledge(item, listing) {
  const {scope}=item;
  if(scope.property_types.length && !scope.property_types.includes(normalized(listing.property_type)))return false;
  if(scope.transactions.length && !scope.transactions.includes(normalized(listing.transaction)))return false;
  // Exact confirmed region facts only. No substring guesses (e.g. 강남 vs 강남길).
  const regions=listing.facts.filter(f=>f.status==='confirmed' && /^(지역|주소|소재지|시도|시군구|읍면동|location|region|address)$/i.test(f.label)).map(f=>normalized(f.value));
  return !scope.regions.length || scope.regions.some(r=>regions.includes(r));
}
export function listKnowledge(profileDir, listing) {
  if (listing) validateListing(listing);
  const items=readStore(profileDir).items;
  if(!listing)return {items}; // Management view includes inactive/conflicting entries.
  return {items:items.filter(i=>i.status==='active' && matchesKnowledge(i,listing)),conflicts:items.filter(i=>i.status==='conflict' && matchesKnowledge(i,listing))};
}

export function validateAdviceRefs(strategy, listing, context, knowledgeItems) {
  for(const [key,items] of [['context_refs',context?.items ?? []],['knowledge_refs',knowledgeItems ?? []]]) {
    const refs=strategy[key] ?? [];
    requireThat(Array.isArray(refs) && new Set(refs.map(r=>r.id)).size===refs.length, `invalid ${key}`);
    if(key==='context_refs' && refs.length) requireThat(context?.listing_hash===hash(listing), 'context is from another listing revision');
    for(const ref of refs) {
      const item=items.find(i=>i.id===ref.id);
      requireThat(item,`unavailable ${key} item: ${ref.id}`);
      const snapshot=key==='knowledge_refs'?knowledgeSnapshot(item):item;
      requireThat(same(ref.snapshot,snapshot),`stale or changed ${key} snapshot`);
      requireThat(Array.isArray(ref.usage) && ref.usage.length && ref.usage.every(x=>['primary_target','hook','sections','cta','keywords','intro_direction'].includes(x)), 'advice is for strategy only, never fact evidence');
      requireThat(nonempty(ref.reason),'explain how the advice affected the strategy');
    }
  }
}
