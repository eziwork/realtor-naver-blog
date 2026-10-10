#!/usr/bin/env node
// 내장 브라우저로 수집한 매물 자료(capture JSON + 사진 파일)를 listing.json(schema 3.0)으로 정리한다.
// 브라우저를 직접 띄우지 않는다. Node 내장 모듈만 사용한다.
//
//   node scripts/import-listing.mjs resolve --input "<번호 또는 링크>"
//   node scripts/import-listing.mjs import --run <run-dir> --capture <capture.json>
//
// 수집 절차와 capture 형식은 references/browser-collect.md를 따른다.
// 정직한 카운트가 계약이다: 예상 N → 확보 N → 저장 N + 실패·중복 목록을 가공 없이 보고한다.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function done(payload, code = 0) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  process.exit(code);
}

export function resolveListingInput(input) {
  const text = String(input || "").trim();
  if (/^\d{6,}$/.test(text)) {
    return {ok: true, article_no: text, detail_url: `https://fin.land.naver.com/articles/${text}`};
  }
  const article = text.match(/(?:fin\.land\.naver\.com|m\.land\.naver\.com|new\.land\.naver\.com)\/[^\s]*?(?:articles?\/|articleNo=)(\d{6,})/);
  if (article) {
    return {ok: true, article_no: article[1], detail_url: `https://fin.land.naver.com/articles/${article[1]}`};
  }
  if (/fin\.land\.naver\.com\/map/.test(text)) {
    return {
      ok: false,
      error: "map_url_has_no_article_number",
      hint: "지도 공유 링크에는 매물번호가 없습니다(실측). 매물 상세 페이지 링크(fin.land.naver.com/articles/번호)나 상세 화면 '기본 정보' 표 하단의 매물번호를 받아 오세요."
    };
  }
  if (/^https?:\/\//.test(text)) {
    return {ok: false, error: "not_naver_listing_url", hint: "네이버부동산 매물 링크가 아닙니다. 자연어·사진 입력 경로로 진행합니다."};
  }
  return {ok: false, error: "no_article_number", hint: "6자리 이상 숫자 매물번호나 매물 상세 링크가 필요합니다."};
}

export function normalizeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    // 실측: 원본 URL = 썸네일 URL에서 ?type=... 리사이즈 파라미터만 뗀 것.
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extensionOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return /^(?:jpe?g|png|webp|gif)$/.test(ext) ? ext.replace("jpeg", "jpg") : "jpg";
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function importCapture(runDir, capture, {acceptIncomplete = null} = {}) {
  const warnings = [];
  if (capture?.schema_version !== "browser-capture-1.0") throw new Error("capture schema_version must be browser-capture-1.0");
  const article = String(capture.article_no || "");
  if (!/^\d{6,}$/.test(article)) throw new Error("capture.article_no must be 6+ digits");
  if (capture.not_found) {
    return {ok: false, stage: "page", error: "listing_not_found", hint: "매물번호가 유효하지 않거나 광고가 종료·삭제된 상태입니다."};
  }

  const api = capture.api || {};
  const basic = api.basic_info?.body?.result ?? null;
  const apiNo = String(basic?.detailInfo?.articleDetailInfo?.articleNumber || "");
  const articleMatch = apiNo ? apiNo === article : null;
  if (articleMatch === false) warnings.push(`basicInfo의 articleNumber(${apiNo})가 요청 번호(${article})와 다릅니다 — 이 자료로 글을 만들지 않는다`);
  for (const [name, entry] of Object.entries(api)) {
    if (entry && entry.status !== 200) warnings.push(`${name} HTTP ${entry.status}`);
  }

  // 갤러리 API가 있으면 그 순서가 기준이다. 없으면 capture.photos 순서를 쓴다.
  const apiImages = Array.isArray(api.gallery?.body?.result)
    ? api.gallery.body.result.slice().sort((a, b) => (a.sortingOrder ?? 0) - (b.sortingOrder ?? 0))
    : null;
  const captured = Array.isArray(capture.photos) ? capture.photos : [];
  const byUrl = new Map();
  const thumbnailUrls = new Set();
  for (const item of captured) {
    const url = normalizeImageUrl(item.url);
    if (url && /[?&]type=/.test(String(item.url))) thumbnailUrls.add(url);
    if (url && !byUrl.has(url)) byUrl.set(url, item);
  }
  const expectedUrls = apiImages
    ? [...new Set(apiImages.map((r) => normalizeImageUrl(r.imageUrl)).filter(Boolean))]
    : [...byUrl.keys()];
  const source = apiImages ? "galleryImages_api" : "page_assets";

  const uiCount = Number.isInteger(capture.ui_photo_count) ? capture.ui_photo_count : null;
  if (uiCount !== null && uiCount !== expectedUrls.length) {
    warnings.push(`화면 표기 ${uiCount}장 ≠ 수집 목록 ${expectedUrls.length}장 — 두 값을 보고에 그대로 남길 것`);
  }

  const photoDir = path.join(runDir, "photos");
  fs.mkdirSync(photoDir, {recursive: true});
  const images = [];
  const failed = [];
  const duplicates = [];
  const seenHashes = new Map();
  for (const url of expectedUrls) {
    const item = byUrl.get(url);
    const file = item?.file ? path.resolve(String(item.file)) : null;
    if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) {
      failed.push({url: url.slice(0, 160), reason: item?.reason || (file ? "file missing or empty" : "not downloaded")});
      continue;
    }
    const digest = sha256(file);
    if (seenHashes.has(digest)) {
      duplicates.push({url: url.slice(0, 160), same_as: seenHashes.get(digest)});
      continue;
    }
    const target = path.join(photoDir, `${String(images.length + 1).padStart(2, "0")}.${extensionOf(file)}`);
    fs.copyFileSync(file, target);
    seenHashes.set(digest, path.basename(target));
    images.push({url, file: target, sha256: digest});
  }
  if (failed.length) warnings.push(`사진 ${failed.length}장 확보 실패 — 한 번 재수집하고, 그래도 누락이면 목록을 보고한다`);
  if (duplicates.length) warnings.push(`같은 사진 ${duplicates.length}장은 한 장만 저장했습니다`);

  // 완전성 판정: 하나라도 걸리면 원고 단계로 넘어가지 않는다 (2026-10-10 실제 실행에서 썸네일 1장만 받은 사례).
  const incomplete = [];
  if (!capture.api_attempt?.tried) incomplete.push("api_not_attempted: 페이지 안 API 시도 기록(api_attempt.tried)이 없습니다");
  if (uiCount === null) incomplete.push("ui_count_missing: 화면의 사진 장수를 기록하지 않았습니다");
  else if (images.length + duplicates.length < uiCount) incomplete.push(`photos_short: 화면 ${uiCount}장 중 ${images.length + duplicates.length}장만 확보했습니다`);
  if (failed.length) incomplete.push(`photos_failed: ${failed.length}장 확보 실패`);
  const thumbs = images.filter((img) => thumbnailUrls.has(img.url));
  if (thumbs.length) incomplete.push(`thumbnail_only: ${thumbs.length}장이 리사이즈 썸네일(?type=)에서 받은 파일입니다`);
  const accepted = incomplete.length > 0 && typeof acceptIncomplete === "string" && acceptIncomplete.trim() !== "";
  const complete = incomplete.length === 0;

  const listing = {
    schema_version: "3.0",
    source: "naver-land(fin)",
    collector: "codex-built-in-browser",
    capture_method: capture.method || null,
    article_no: article,
    source_url: capture.source_url || `https://fin.land.naver.com/articles/${article}`,
    fetched_at: capture.captured_at || new Date().toISOString(),
    facts: {
      key: api.key?.body?.result ?? null,
      basic_info: basic
    },
    page_text: String(capture.page_text || "").slice(0, 6000),
    gallery: {
      source,
      expected: expectedUrls.length,
      ui_count: uiCount,
      images,
      downloaded: images.length,
      failed,
      duplicates,
      complete,
      incomplete_reasons: incomplete,
      accepted_incomplete: accepted ? {user_quote: acceptIncomplete.trim()} : null
    },
    note: "facts와 page_text에 있는 사실만 사용한다. 없는 값은 지어내지 않는다."
  };
  const outFile = path.join(runDir, "listing.json");
  fs.writeFileSync(outFile, JSON.stringify(listing, null, 2));
  return {
    ok: true,
    listing: outFile,
    article_no: article,
    article_match: articleMatch,
    photos: {expected: expectedUrls.length, ui_count: uiCount, downloaded: images.length, failed, duplicates},
    image_source: source,
    complete,
    incomplete_reasons: incomplete,
    accepted_incomplete: accepted,
    next: complete || accepted ? "facts" : "recollect_or_ask_user",
    warnings
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const args = argsOf(rest);
  try {
    if (command === "resolve") {
      const result = resolveListingInput(args.input);
      done(result, result.ok ? 0 : 1);
    } else if (command === "import") {
      if (!args.run || !args.capture) throw new Error("--run and --capture are required");
      const capture = JSON.parse(fs.readFileSync(path.resolve(args.capture), "utf8"));
      const result = importCapture(path.resolve(args.run), capture, {acceptIncomplete: args["accept-incomplete"] ?? null});
      done(result, result.ok ? 0 : 1);
    } else {
      throw new Error("Commands: resolve import");
    }
  } catch (error) {
    done({ok: false, error: String(error.message || error).slice(0, 300)}, 1);
  }
}
