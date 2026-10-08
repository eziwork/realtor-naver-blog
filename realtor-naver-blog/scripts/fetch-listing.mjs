#!/usr/bin/env node
// 네이버부동산 매물번호(articleNo)로 매물 상세를 수집해 listing.json으로 저장한다.
//
//   node scripts/fetch-listing.mjs --article 2610279820 --out <run-dir> [--photos]
//
// 2026-08 현재 네이버부동산은 fin.land.naver.com으로 통합됐고, 데이터 API는
// 헤드리스 브라우저를 차단한다(실측: 헤드리스=429, 헤드=200). 그래서 이 수집기는
// post-draft와 같은 지속 프로필의 실창 브라우저로 상세 페이지를 열어 렌더된
// 데이터를 읽는다. 토큰은 쓰지 않는다. 로그인 계정에 네이버파이낸셜 약관 동의가
// 되어 있어야 한다 (중개사 계정은 보통 이미 동의 상태).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {chromium} from "playwright";

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeListingImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!/(?:landthumb-phinf|land\.phinf|estate)/.test(url.hostname + url.pathname)) return null;
    // 갤러리 내비게이터는 같은 사진에 리사이즈 쿼리만 달아 노출한다.
    // 쿼리를 제거하면 원본을 받을 수 있고 중복도 안정적으로 제거된다.
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extensionOf(contentType, url) {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  if (/gif/i.test(contentType)) return "gif";
  const ext = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return /^(?:jpe?g|png|webp|gif)$/.test(ext) ? ext.replace("jpeg", "jpg") : "jpg";
}

const args = argsOf(process.argv.slice(2));
const article = String(args.article || "").trim();
if (!/^\d{6,}$/.test(article)) {
  process.stdout.write(JSON.stringify({ok: false, error: "--article must be a Naver land articleNo (digits)"}) + "\n");
  process.exit(1);
}
const outDir = path.resolve(String(args.out || "."));
fs.mkdirSync(outDir, {recursive: true});
const PROFILE = path.join(os.homedir(), ".codex", "naver-realtor-blog", "browser-profile");

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: {width: 1400, height: 1000},
  args: ["--disable-blink-features=AutomationControlled"]
});
const page = ctx.pages()[0] || await ctx.newPage();

// 상세 데이터가 실려 오는 API 응답을 그대로 가로챈다 — 파싱이 가장 정확한 지점
const apiPayloads = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/front-api/.test(u) && res.status() === 200 && new RegExp(article).test(u)) {
    try { apiPayloads.push({url: u, body: await res.json()}); } catch { /* json 아님 */ }
  }
});

// 미해결 실측(2026-08-24): 홈에 노출되는 VR 매물의 articleNo는
// /articles/{no}와 /article/{no} 모두 404였고 /articles/{no}/tour만 열렸다.
// 일반 매물의 상세 라우트가 다를 수 있다 — 유효한 중개사 매물번호로
// 재실측해 후보 URL을 갱신할 것. 그때까지 실패 시 자연어 경로가 폴백이다.
const candidates = [
  `https://fin.land.naver.com/articles/${article}`,
  `https://fin.land.naver.com/article/${article}`
];
let landed = null;
try {
  for (const url of candidates) {
    await page.goto(url, {waitUntil: "domcontentloaded", timeout: 40000});
    await page.waitForTimeout(6000);
    const cur = page.url();
    const body = await page.evaluate(() => document.body.innerText).catch(() => "");
    // 실측: fin.land 404 문구는 "찾을 수 없어요" — 축약형으로 두 표기를 모두 잡는다
    if (!/404|agreement/.test(cur) && !/찾을 수 없/.test(body)) { landed = {url: cur, body}; break; }
  }

  if (!landed) {
    await ctx.close();
    process.stdout.write(JSON.stringify({
      ok: false, stage: "page",
      hint: "매물 상세를 열 수 없습니다. 번호가 만료됐거나(광고 종료) 계정에 네이버파이낸셜 약관 동의가 안 된 상태일 수 있습니다."
    }) + "\n");
    process.exit(1);
  }

  // 매물 대표 이미지의 "N개 보기"를 열면 ivx 내비게이터에 갤러리 전체가
  // 한꺼번에 로드된다. 최초 DOM의 img만 읽으면 대표 사진 몇 장만 잡히므로
  // 반드시 갤러리를 먼저 연다.
  let galleryExpectedCount = null;
  let galleryOpened = false;
  let galleryWarning = null;
  const gallerySeenUrls = new Set();
  const rememberGalleryImages = async () => {
    const urls = await page.evaluate(() => {
      const src = (image) => image.currentSrc || image.src || image.getAttribute("src") || "";
      return [...document.querySelectorAll(
        'img[class*="ivx__index-navigator__item__image"], img[class*="ivx__image-item"]'
      )].map(src);
    }).catch(() => []);
    for (const url of urls) {
      const normalized = normalizeListingImageUrl(url);
      if (normalized) gallerySeenUrls.add(normalized);
    }
    return gallerySeenUrls.size;
  };
  try {
    const galleryButton = page.getByRole("button", {name: /\d+\s*개\s*보기/}).first();
    if (await galleryButton.count()) {
      const label = (await galleryButton.innerText()).replace(/\s+/g, " ").trim();
      const match = label.match(/(\d+)\s*개\s*보기/);
      if (match) galleryExpectedCount = Number(match[1]);
      await galleryButton.click({timeout: 5000});
      galleryOpened = true;
      await page.locator('img[class*="ivx__index-navigator__item__image"]').first()
        .waitFor({timeout: 7000}).catch(() => {});
      await page.waitForTimeout(700);
      await rememberGalleryImages();

      // 모바일 뷰는 내비게이터에 6~8장만 가상 렌더링한다. 다음 버튼을
      // 순회하며 매 단계의 URL을 누적해야 N장 전체를 얻을 수 있다.
      const nextButton = page.locator('button[class*="ivx__navigation-next__next-button"]').first();
      const maxSteps = galleryExpectedCount == null ? 40 : Math.max(10, galleryExpectedCount * 2);
      let stagnant = 0;
      for (let step = 0; step < maxSteps; step += 1) {
        if (galleryExpectedCount != null && gallerySeenUrls.size >= galleryExpectedCount) break;
        if (!await nextButton.count() || !await nextButton.isVisible().catch(() => false)) break;
        const before = gallerySeenUrls.size;
        await nextButton.click({timeout: 3000}).catch(() => {});
        await page.waitForTimeout(160);
        const after = await rememberGalleryImages();
        stagnant = after === before ? stagnant + 1 : 0;
        if (galleryExpectedCount == null && stagnant >= 5) break;
      }
    }
  } catch (error) {
    galleryWarning = String(error.message).slice(0, 180);
  }

  // NEXT_DATA(SSR 상태)도 보조 소스로 확보
  const nextData = await page.evaluate(() => {
    const el = document.querySelector("#__NEXT_DATA__");
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  });

  const discoveredImages = await page.evaluate(() => {
    const src = (image) => image.currentSrc || image.src || image.getAttribute("src") || "";
    const gallery = [...document.querySelectorAll(
      'img[class*="ivx__index-navigator__item__image"], img[class*="ivx__image-item"]'
    )].map(src);
    const supporting = [...document.querySelectorAll('img[alt="평면도"]')].map(src);
    const fallback = [...document.querySelectorAll("img")]
      .map(src)
      .filter((value) => /landthumb|land\.phinf|estate/.test(value) && value.startsWith("http"));
    return {gallery, supporting, fallback};
  });

  const galleryImageUrls = unique([
    ...gallerySeenUrls,
    ...discoveredImages.gallery.map(normalizeListingImageUrl)
  ]);
  const supportingImageUrls = unique(discoveredImages.supporting.map(normalizeListingImageUrl))
    .filter((url) => !galleryImageUrls.includes(url));
  const fallbackImageUrls = unique(discoveredImages.fallback.map(normalizeListingImageUrl));
  const imageUrls = galleryImageUrls.length
    ? [...galleryImageUrls, ...supportingImageUrls]
    : fallbackImageUrls;
  const galleryDiscoveryComplete = galleryExpectedCount == null
    ? null
    : galleryImageUrls.length >= galleryExpectedCount;

  const listing = {
    schema_version: "2.0",
    source: "naver-land(fin)",
    article_no: article,
    source_url: landed.url,
    fetched_at: new Date().toISOString(),
    page_text: landed.body.slice(0, 6000),
    api_payloads: apiPayloads.map((p) => ({url: p.url.slice(0, 120), body: p.body})).slice(0, 6),
    next_data_present: Boolean(nextData),
    gallery_expected_count: galleryExpectedCount,
    gallery_opened: galleryOpened,
    gallery_warning: galleryWarning,
    gallery_discovered_count: galleryImageUrls.length,
    gallery_discovery_complete: galleryDiscoveryComplete,
    gallery_image_urls: galleryImageUrls,
    supporting_image_urls: supportingImageUrls,
    image_urls: imageUrls,
    note: "page_text와 api_payloads의 사실만 사용한다. 없는 값은 지어내지 않는다."
  };
  if (nextData) {
    try { fs.writeFileSync(path.join(outDir, "next-data.json"), JSON.stringify(nextData).slice(0, 2_000_000)); } catch { /* optional */ }
  }
  const saved = [];
  const photoManifest = [];
  const failures = [];
  if (args.photos) {
    const photoDir = path.join(outDir, "photos");
    const galleryDir = path.join(photoDir, "gallery");
    const supportingDir = path.join(photoDir, "supporting");
    fs.mkdirSync(galleryDir, {recursive: true});
    fs.mkdirSync(supportingDir, {recursive: true});

    const records = [
      ...galleryImageUrls.map((url, index) => ({kind: "gallery", index: index + 1, url})),
      ...supportingImageUrls.map((url, index) => ({kind: "supporting", index: index + 1, url}))
    ];
    if (!galleryImageUrls.length) {
      records.push(...fallbackImageUrls.map((url, index) => ({kind: "fallback", index: index + 1, url})));
    }

    for (const record of records) {
      const variants = unique([
        record.url,
        `${record.url}?type=m562`
      ]);
      let lastError = null;
      let savedRecord = null;
      for (const url of variants) {
        try {
          const response = await ctx.request.get(url, {
            headers: {Referer: landed.url},
            timeout: 30000
          });
          if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
          const contentType = response.headers()["content-type"] || "";
          if (!/^image\//i.test(contentType)) throw new Error(`not image: ${contentType || "unknown"}`);
          const body = await response.body();
          if (body.length < 1024) throw new Error(`image too small: ${body.length} bytes`);
          const ext = extensionOf(contentType, url);
          const dir = record.kind === "gallery" ? galleryDir : supportingDir;
          const file = path.join(dir, `${String(record.index).padStart(2, "0")}.${ext}`);
          fs.writeFileSync(file, body);
          saved.push(file);
          savedRecord = {
            kind: record.kind,
            index: record.index,
            source_url: record.url,
            saved_file: path.relative(outDir, file).replaceAll("\\", "/"),
            bytes: body.length
          };
          photoManifest.push(savedRecord);
          break;
        } catch (error) {
          lastError = String(error.message).slice(0, 160);
        }
      }
      if (!savedRecord) {
        const failure = {kind: record.kind, index: record.index, url: record.url, error: lastError || "unknown"};
        failures.push(failure);
        photoManifest.push({...failure, saved_file: null});
      }
    }
  }

  const galleryPhotosSaved = photoManifest.filter((item) => item.kind === "gallery" && item.saved_file).length;
  const galleryComplete = galleryExpectedCount == null
    ? null
    : galleryDiscoveryComplete === true && (!args.photos || galleryPhotosSaved >= galleryExpectedCount);
  Object.assign(listing, {
    gallery_photos_saved: args.photos ? galleryPhotosSaved : null,
    gallery_complete: galleryComplete,
    photo_manifest: photoManifest,
    photo_download_failures: failures
  });

  const outFile = path.join(outDir, "listing.json");
  fs.writeFileSync(outFile, JSON.stringify(listing, null, 2));
  if (args.photos) {
    fs.writeFileSync(path.join(outDir, "photo-manifest.json"), JSON.stringify(photoManifest, null, 2));
  }

  await ctx.close();
  const ok = !args.photos || galleryComplete !== false;
  process.stdout.write(JSON.stringify({
    ok,
    stage: ok ? "complete" : "gallery",
    listing: outFile,
    api_payloads: apiPayloads.length,
    text_chars: landed.body.length,
    image_count: listing.image_urls.length,
    gallery_expected_count: galleryExpectedCount,
    gallery_discovered_count: galleryImageUrls.length,
    gallery_photos_saved: galleryPhotosSaved,
    supporting_photos_saved: photoManifest.filter((item) => item.kind !== "gallery" && item.saved_file).length,
    photos_saved: saved.length,
    photo_failures: failures.length,
    gallery_complete: galleryComplete
  }, null, 2) + "\n");
  if (!ok) process.exit(1);
} catch (error) {
  await ctx.close().catch(() => {});
  process.stdout.write(JSON.stringify({ok: false, stage: "error", error: String(error.message).slice(0, 200)}) + "\n");
  process.exit(1);
}
