import fs from 'node:fs';
import path from 'node:path';
import {hash, requireThat, nonempty, confirmedRefs} from './contracts.mjs';

const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
// 글자 크기 (가독성): 본문 16px, 소제목 24px 굵게, 조건표 15px. 셋 다 네이버 스마트에디터 기본 크기 목록에 있는 값이다.
// Dr-Min 2026-08-24 실측: 붙여넣기는 span의 font-size(→se-fs19 등)·font-weight·배경색을 살린다.
// 문단마다 크기를 직접 적지 않으면 변환기가 직전 소제목(크게·굵게) 스타일을 다음 문단까지 이어 붙인다.
// 강조도 실측으로 살아남은 형태(굵게 = font-weight:700 span, 형광 = 배경색 span)로 넣는다.
export const FONT = {body: 16, heading: 24, table: 15};
const inline = text => esc(text).replace(/\*\*([^*]+)\*\*/g, '<span style="font-weight:700;">$1</span>').replace(/==([^=]+)==/g, '<span style="background-color:#fff3b0;">$1</span>');
const centerStyle = 'text-align: center';
const sized = (content, px, bold = false) => `<span style="font-size:${px}px;${bold ? 'font-weight:700;' : ''}">${content}</span>`;
const blankLine = `<p style="${centerStyle}">${sized('<br>', FONT.body)}</p>`;
const tableStyle = 'border-collapse:collapse;width:100%';
const cellStyle = `border:1px solid #d9dde2;padding:8px;${centerStyle};`;
const centered = (content, kind = 'body') => `<p style="${centerStyle}">${kind === 'heading' ? sized(content, FONT.heading, true) : sized(content, FONT.body)}</p>\n${blankLine}`;
// 숫자 비교 전 정규화 (2026-10-10 실행에서 prepare가 오탐으로 3번 실패):
// - 쉼표는 천 단위(뒤에 정확히 3자리)일 때만 지운다. "현대1,2차"를 12로 합치지 않는다.
// - 날짜 1976.06.07 / 1976-6-7 / 1976년 6월 7일을 같은 숫자로 본다. 앞자리 0은 무시한다.
const normalizeNumbers = text => String(text).normalize('NFKC')
  .replace(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?/g, '$1년 $2월 $3일')
  .replace(/(?<=\d),(?=\d{3}(?!\d))/g, '');
const numbers = text => (normalizeNumbers(text).match(/\d+(?:\.\d+)?/g) || []).map(x => x.replace(/^0+(?=\d)/, ''));
const measurements = text => (normalizeNumbers(text).match(/\d+(?:\.\d+)?\s*(?:만\s*원|억\s*원|천\s*원|억|만원|원|m2|평|층|분|시간|km|m|룸|개|톤|%)/g) || []).map(x=>x.replace(/\s/g,'').replace(/(억|만|천)원$/,'$1'));
export const officeFingerprint = office => hash(office);
export function telephone(value) {
  const number = String(value ?? '').replace(/[\s()-]/g, '');
  requireThat(/^\+?\d{8,15}$/.test(number), 'profile needs a valid public telephone number');
  return number;
}
function checkText(item, listing, office, {contact = false} = {}) {
  requireThat(nonempty(item.text), 'empty content text');
  requireThat(!/[<>\r\n]/.test(item.text), 'text must be one block without HTML');
  requireThat(!/@@(?:IMG|MAP):/.test(item.text), 'reserved marker in content');
  confirmedRefs(item.fact_ids, listing, false);
  const evidence = item.fact_ids.map(id => listing.facts.find(f => f.id === id).value).join(' ');
  const allowed = new Set(numbers(evidence + (contact ? ' ' + Object.values(office).join(' ') : '')));
  for (const value of numbers(item.text)) requireThat(allowed.has(value), `unsupported number ${value}: ${item.text}`);
  const units = new Set(measurements(evidence));
  for (const value of measurements(item.text)) requireThat(units.has(value), `unsupported measurement ${value}: ${item.text}`);
  requireThat(!/(검색량|상위\s*노출|검색\s*순위).{0,15}(보장|확실|높|\d)/.test(item.text), 'unsupported SEO claim');
  return item.text;
}

// Codex judges entailment; this code checks source links, numbers, assets, and structure.
// A cited fact does not by itself prove that a qualitative claim follows from it.
export function renderPost(post, listing, strategy, office, runDir) {
  requireThat(post.schema_version === '1.0', 'post schema_version must be 1.0');
  requireThat(!/\bTODO\b/.test(JSON.stringify(post)), 'post still has TODO placeholders from post-template');
  requireThat(post.strategy_hash === hash(strategy), 'post belongs to an outdated strategy');
  requireThat(post.listing_hash === hash(listing), 'post belongs to outdated listing facts');
  requireThat(post.fact_review?.completed === true && nonempty(post.fact_review.notes), 'Codex fact review is required');
  requireThat(['stored','analyzed','default'].includes(post.style?.origin) && nonempty(post.style.summary), 'applied style provenance required');
  const title = checkText(post.title, listing, office);
  const md = [`# ${title}`, ''];
  const html = [], texts = [], images = [], maps = [], tables = [], headings = [];
  requireThat(Array.isArray(post.blocks) && post.blocks.length > 0, 'post blocks required');
  let ctaCount = 0, contactLink = null;
  for (const block of post.blocks) {
    if (['paragraph', 'heading'].includes(block.type)) {
      const text = checkText(block, listing, office);
      if (block.section_id) requireThat(strategy.sections.some(s => s.id === block.section_id), 'unknown strategy section');
      texts.push(text);
      if (block.type === 'heading') headings.push(text);
      md.push((block.type === 'heading' ? '## ' : '') + text, '');
      html.push(centered(inline(text), block.type === 'heading' ? 'heading' : 'body'));
    } else if (block.type === 'image') {
      requireThat(['photo', 'thumbnail', 'cta_banner'].includes(block.role), 'image role required');
      requireThat(nonempty(block.alt) && nonempty(block.path), 'image needs alt/path');
      const file = path.resolve(runDir, block.path);
      requireThat(fs.existsSync(file) && fs.statSync(file).isFile(), `missing image: ${file}`);
      if (block.role === 'photo') requireThat(listing.photos.some(p => p.id === block.photo_id && path.resolve(runDir, p.path) === file), 'photo must match listing photo');
      if (block.role === 'cta_banner') requireThat(block.office_hash === officeFingerprint(office), 'CTA banner profile changed: regenerate and visually verify banner');
      requireThat(block.reviewed === true, 'visually review all images, including generated text');
      images.push({...block, path: file, sha256: hash(fs.readFileSync(file).toString('base64'))});
      const marker = `@@IMG:${images.length}@@`;
      md.push(`![${block.alt}](${file})`, '');
      html.push(centered(marker));
    } else if (block.type === 'table') {
      requireThat(Array.isArray(block.rows) && block.rows.length > 0, 'condition table needs rows');
      const rows = block.rows.map(row => {
        requireThat(nonempty(row.label) && !/[|<>\r\n]/.test(row.label), 'invalid table label');
        checkText(row, listing, office);
        requireThat(row.fact_ids.length && !/\|/.test(row.text), 'table rows must cite confirmed facts');
        return [row.label, row.text];
      });
      tables.push(rows);
      md.push('| 항목 | 내용 |', '|---|---|', ...rows.map(r => `| ${r[0]} | ${r[1]} |`), '');
      // Dr-Min cb866fe 실측: 스타일 없는 표는 네이버 편집기에서 테두리 없는 흰 표(50:50)로 바뀐다.
      // 편집기 변환에서 살아남는 인라인 스타일: 테두리 #d9dde2, 첫 열 배경 #f5f6f8 + 굵게, 28:72 폭, padding 8px.
      // '항목/내용' 머리 행은 잡음이라 넣지 않는다.
      html.push(`<table style="${tableStyle}"><colgroup><col style="width:28%"><col style="width:72%"></colgroup><tbody>${rows.map(r => `<tr><td style="${cellStyle}background-color:#f5f6f8;width:28%">${sized(esc(r[0]), FONT.table, true)}</td><td style="${cellStyle}width:72%">${sized(inline(r[1]), FONT.table)}</td></tr>`).join('')}</tbody></table>\n${blankLine}`);
    } else if (block.type === 'map') {
      checkText({text: block.query, fact_ids: block.fact_ids}, listing, office);
      requireThat(block.fact_ids.length, 'map query needs confirmed location');
      maps.push({query: block.query, fact_ids: block.fact_ids});
      md.push(`지도: ${block.query}`, '');
      html.push(centered(`@@MAP:${maps.length}@@`));
    } else if (block.type === 'cta') {
      ctaCount++;
      checkText(block, listing, office, {contact: true});
      requireThat(block.benefit === strategy.cta.benefit, 'CTA benefit must match approved strategy');
      const phone = strategy.cta.channel === 'phone';
      if (phone) {
        requireThat(!block.text.includes(office.public_contact), 'CTA text must not duplicate the rendered telephone line');
        contactLink = {label:`전화 상담: ${office.public_contact}`, href:`tel:${telephone(office.public_contact)}`};
      } else {
        requireThat(nonempty(office.public_contact_url) && nonempty(office.public_contact_label), 'registered channel needs profile URL and label');
        requireThat(new URL(office.public_contact_url).protocol === 'https:', 'registered contact URL must be HTTPS');
        contactLink = {label:office.public_contact_label, href:office.public_contact_url};
      }
      texts.push(block.text);
      md.push(block.text, '', contactLink.label, '');
      html.push(centered(inline(block.text)), centered(`<a href="${esc(contactLink.href)}">${esc(contactLink.label)}</a>`));
    } else throw new Error(`unsupported block: ${block.type}`);
  }
  requireThat(ctaCount === 1, 'exactly one CTA required');
  requireThat(tables.length > 0, 'verified condition table required');
  for (const section of strategy.sections) requireThat(post.blocks.some(b => b.section_id === section.id), `missing approved section ${section.id}`);
  for (const photo of listing.photos) requireThat(images.some(p => p.photo_id === photo.id) || post.excluded_photos?.some(p => p.id === photo.id && nonempty(p.reason)), `photo silently omitted: ${photo.id}`);
  requireThat(images.some(p => p.role === 'thumbnail') && images.some(p => p.role === 'cta_banner'), 'thumbnail and current contact banner required');
  if (!maps.length) requireThat(nonempty(post.map_omission_reason), 'record why a verified map cannot be included');
  if (post.tags?.length) {
    requireThat(post.tags.every(t => /^#[^\s<>#]+$/.test(t)), 'invalid tags');
    checkText({text: post.tags.join(' '), fact_ids: post.tag_fact_ids ?? []}, listing, office);
    md.push(post.tags.join(' '), ''); html.push(centered(esc(post.tags.join(' '))));
  }
  return {
    markdown: md.join('\n'), html: html.join('\n'),
    manifest: {title, text_blocks: texts, headings, tables, images, maps, contact: contactLink, telephone: strategy.cta.channel === 'phone' ? telephone(office.public_contact) : null, office_hash: officeFingerprint(office), map_omission_reason: post.map_omission_reason ?? null}
  };
}
