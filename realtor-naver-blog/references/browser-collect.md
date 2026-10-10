# 내장 브라우저 매물 수집 절차

매물번호·네이버부동산 링크 입력은 Codex 내장 브라우저(Browser 플러그인의 `tab.playwright` API)만으로 수집한다. 셸에서 브라우저를 띄우지 않는다. Playwright·Chromium 설치가 필요 없다. 아래 API 이름은 2026-10-10 기준 Browser 플러그인 문서(`docs/api.json`, `docs/file-uploads.md`, `docs/capabilities/tab/pageAssets.md`)에서 확인한 것이다. 매번 현재 도구 문서를 먼저 확인하고, 이름이 바뀌었으면 현재 문서를 따른다.

## 0. 입력 해석

`node scripts/import-listing.mjs resolve --input "<사용자 입력>"`

- `ok:true` → `article_no`, `detail_url`로 진행한다.
- `map_url_has_no_article_number` → 지도 공유 링크에는 번호가 없다(실측). 상세 링크나 '기본 정보' 표 하단의 매물번호를 한 번 요청한다.
- `not_naver_listing_url` / `no_article_number` → 자연어·사진 입력 경로로 진행한다.

## 빠른 경로 (기본): 브라우저 호출 2번으로 수집 끝내기

아래 두 셀은 2026-10-10 실제 실행에서 동작이 확인된 API(`cua.createBrowserTab("iab", …)`, `tab.playwright.evaluate`, `tab.playwright.domSnapshot`, `tab.capabilities.get('pageAssets')`, `list()`, `bundle()`)만 쓴다. 페이지 안 `fetch` 허용 여부는 아직 미확인이라 결과를 그대로 기록한다. 셀을 쪼개 한 단계씩 실행하지 않는다. 실패한 부분만 아래 상세 절차로 보완한다.

**셀 1 — 열기 + API 3종 + 장수 + 화면 글자**

```js
const no = "<매물번호>";
var listingTab = await cua.createBrowserTab("iab", `https://fin.land.naver.com/articles/${no}`, {visible: true});
var collected = await listingTab.playwright.evaluate(async (no) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 20 && !document.body.innerText.includes('매물번호'); i++) await wait(300);
  const get = async (p) => {
    let last = {status: 0, body: null};
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch('/front-api/v1/' + p, {headers: {accept: 'application/json'}});
        last = {status: r.status, body: r.status === 200 ? await r.json() : null};
        if (r.status === 200) return last;
      } catch (e) { last = {status: 0, body: null, error: String(e)}; }
      await wait(1200);
    }
    return last;
  };
  const key = await get(`article/key?articleNumber=${no}`);
  const t = key.body?.result?.type || {};
  const basic_info = await get(`article/basicInfo?articleNumber=${no}&realEstateType=${t.realEstateType || ''}&tradeType=${t.tradeType || ''}`);
  const gallery = await get(`article/galleryImages?articleNumber=${no}`);
  const text = document.body.innerText;
  const ui = text.match(/이미지\s*(\d+)\s*개/);
  return {key, basic_info, gallery, not_found: /찾을 수 없/.test(text), ui_photo_count: ui ? Number(ui[1]) : null, page_text: text.slice(0, 6000)};
}, no).catch(e => ({evaluate_error: String(e)}));
nodeRepl.write(JSON.stringify({evaluate_error: collected.evaluate_error, statuses: [collected.key?.status, collected.basic_info?.status, collected.gallery?.status], gallery_count: collected.gallery?.body?.result?.length ?? null, ui_photo_count: collected.ui_photo_count, not_found: collected.not_found}));
```

**셀 2 — 갤러리 전부 로드 + 한 번에 저장**

```js
const want = collected.gallery?.body?.result?.length || collected.ui_photo_count || 1;
await listingTab.playwright.getByRole('button', {name: /이미지\s*\d+\s*개|매물 대표 이미지/}).first().click().catch(() => {});
for (let i = 0; i < want; i++) { await listingTab.pressKey(null, 'ArrowRight').catch(() => {}); await new Promise(r => setTimeout(r, 250)); }
const photoAssets = await listingTab.capabilities.get('pageAssets');
const inv = await photoAssets.list();
const isListingPhoto = a => a.kind === 'image' && /landthumb-phinf|land-phinf/.test(a.url);
// 같은 사진의 여러 크기 중 가장 큰 것 하나만 고른다(?type= 숫자가 크거나 파라미터 없는 원본 우선).
const sizeOf = u => { const m = u.match(/[?&]type=[a-z]*(\d+)/i); return m ? Number(m[1]) : 1e9; };
const best = new Map();
for (const a of inv.assets.filter(isListingPhoto)) { const k = a.url.split('?')[0]; if (!best.has(k) || sizeOf(a.url) > sizeOf(best.get(k).url)) best.set(k, a); }
var photoBundle = await photoAssets.bundle({inventoryId: inv.id, assetIds: [...best.values()].map(a => a.id)});
nodeRepl.write(JSON.stringify({want, found: best.size, downloaded: photoBundle.summary, failures: photoBundle.failures.length}));
```

그다음 셸에서 `browser-capture.json`을 **한 번에** 쓰고(`api_attempt: {tried:true, ok:<세 status가 모두 200>, error:<evaluate_error 또는 null>}`, `method: ok ? "page_fetch" : "dom"`, `photos: photoBundle.assets.map(a => ({url:a.url, file:a.path, reason:null}))` + `failures`는 `file:null`), 바로 `import-listing.mjs import`를 실행한다. `complete:true`면 상세 절차는 건너뛴다.

## 1. 상세 페이지 열기

1. 작업 탭에서 `detail_url`을 연다. 이미 같은 URL이면 다시 goto하지 않는다.
2. 화면에 "찾을 수 없어요"가 보이면 삭제·종료 매물이다. `not_found:true`로 capture를 기록하고 자연어 입력으로 전환한다.
3. 로그인이나 약관 동의 화면이 나오면 사용자에게 직접 처리해 달라고 요청한다(아래 '로그인' 참고).

## 2. 매물 사실 — 페이지 API 우선, 화면 텍스트 보조

실측(2026-08-26): 상세 데이터는 front-api 3종에서 온다.

- `https://fin.land.naver.com/front-api/v1/article/key?articleNumber={번호}` → `result.type.realEstateType`, `result.type.tradeType`
- `https://fin.land.naver.com/front-api/v1/article/basicInfo?articleNumber={번호}&realEstateType={..}&tradeType={..}`
- `https://fin.land.naver.com/front-api/v1/article/galleryImages?articleNumber={번호}` → 사진 원본 URL 전체(`imageUrl`, `sortingOrder`, `isRepresentative`)

순서:

1. **페이지 안 GET 시도 (필수).** `tab.playwright.evaluate`로 같은 출처 `fetch(url, {headers:{accept:'application/json'}})`를 실행해 `{status, body}`를 받는다. 실패하면 1.2초 뒤 한 번만 재시도한다. **시도 결과를 성공·실패 모두 `api_attempt`에 기록한다**(`{tried:true, ok, error}`). 시도하지 않고 2번으로 건너뛰지 않는다. evaluate가 읽기 전용 범위라 fetch가 막히면 그 오류 문구를 그대로 남긴다.
   - 막히면 개발자 모드 CDP(`tab.capabilities.get("cdp")`)로 페이지를 다시 읽으며 Network 응답에서 같은 3종 API 본문을 받을 수 있다. CDP는 사이트별 승인이 필요하므로 사용자에게 fin.land.naver.com 읽기 목적임을 밝혀 묻는다. 승인이 없으면 2번으로 간다.
2. **화면 텍스트.** `domSnapshot()` 또는 탭 텍스트로 상세 화면의 '기본 정보' 표와 가격·면적·층·입주 정보를 읽는다. `page_text`에 원문을 그대로 보관한다. 이 경우 `api`는 `null`이다.
3. 화면의 "이미지 N개 보기" 숫자를 **반드시** `ui_photo_count`로 기록한다. 숫자가 화면에 없으면 갤러리 뷰어의 "1/N" 표기를 읽는다. 둘 다 없을 때만 `null`이며 그 이유를 notes에 남긴다.

API 응답의 `basicInfo.result.detailInfo.articleDetailInfo.articleNumber`가 요청 번호와 다르면 그 자료로 글을 만들지 않는다.

## 3. 사진 전체 확보

**대표 사진 1장만 받는 실수를 막는 것이 이 단계의 목적이다.** 화면 DOM은 지연 로딩이라 첫 화면의 img만 읽으면 1장으로 끝난다(이전 수집기 실패 원인).

1. 갤러리(이미지 N개 보기)를 연다. galleryImages API를 받았으면 그 목록이 기준이다. 못 받았으면 갤러리 뷰어에서 **사진을 한 장씩 넘기며 N장 모두** 크게 연다. 2026-10-10 실제 실행에서 이 단계를 건너뛰어 대표 썸네일 1장(`?type=m562`, 31KB)만 받은 사례가 있다.
2. `const assets = await tab.capabilities.get("pageAssets")` → `const inv = await assets.list()`로 현재 페이지 이미지 목록을 본다. `landthumb-phinf.pstatic.net` 등 매물 사진 URL만 고른다. 원본 URL은 썸네일 URL에서 `?type=...` 파라미터를 뗀 것이다(실측).
3. `assets.bundle({inventoryId: inv.id, assetIds: [...]})`로 로컬 임시 폴더에 내려받는다. 썸네일 크기(`?type=m562` 등 리사이즈 URL에서 받은 파일)는 원본이 아니다. 뷰어에 크게 열린 사진을 `locator.downloadMedia()`로 받는 것이 확실하다. 반환된 `assets[].path`와 `failures[]`를 그대로 기록한다. 원본 크기가 아니라 썸네일만 받아졌으면 갤러리에서 해당 사진을 크게 연 뒤 다시 list/bundle 하거나, `locator.downloadMedia()`로 그 사진을 받는다.
4. 사진 URL로 직접 이동해서 받지 않는다(Browser 플러그인 지침: asset URL로 직접 navigate 금지).

## 4. capture 기록 → 정리

run 폴더에 `browser-capture.json`을 쓴다.

```json
{
  "schema_version": "browser-capture-1.0",
  "article_no": "2645188091",
  "source_url": "https://fin.land.naver.com/articles/2645188091",
  "captured_at": "2026-10-10T12:00:00+09:00",
  "not_found": false,
  "method": "page_fetch",
  "api_attempt": {"tried": true, "ok": true, "error": null},
  "api": {
    "key": {"status": 200, "body": {}},
    "basic_info": {"status": 200, "body": {}},
    "gallery": {"status": 200, "body": {}}
  },
  "page_text": "상세 화면 텍스트 원문",
  "ui_photo_count": 9,
  "photos": [
    {"url": "https://landthumb-phinf.pstatic.net/...jpg", "file": "/abs/path/from/bundle/01.jpg", "reason": null}
  ]
}
```

- `method`: `page_fetch`(1번 성공) 또는 `dom`(2번 경로).
- `photos[].file`: bundle/download가 돌려준 절대 경로. 못 받은 사진은 `file:null`, `reason`에 실제 실패 이유.

그다음 `node scripts/import-listing.mjs import --run <run> --capture <run>/browser-capture.json`을 실행한다.

- 출력이 `complete:false`이면(장수 미기록, 화면 장수와 확보 장수 불일치, 썸네일만 확보, API 시도 기록 없음) **원고 단계로 넘어가지 않는다.** 이유(`incomplete_reasons`)를 보고하고 한 번 재수집한다. 그래도 같으면 사용자에게 확보분으로 진행할지 묻고, 답을 받은 경우에만 `--accept-incomplete "<사용자 응답>"`으로 다시 import한다.

- 사진을 `photos/01.jpg…` 순서로 복사하고, 같은 파일(해시 동일)은 한 장만 남긴다.
- 출력의 `photos: {expected, ui_count, downloaded, failed[], duplicates[]}`를 **가공 없이** 보고한다. `expected ≠ downloaded`면 한 번 재수집한다. 그래도 누락이면 확보분과 누락 목록을 보고하고, 확보분 사용 여부를 사용자에게 묻는다.
- `listing.json`(schema 3.0)의 사실 위치는 [input-listing.md](input-listing.md)를 따른다.

## 로그인

- 비밀번호·인증번호를 채팅으로 받지 않는다. 내장 브라우저가 `browserAuth` 보안 입력을 제공하면 그것을 쓰고, 아니면 사용자가 내장 브라우저 창에서 직접 로그인하도록 인계한다.
- 내장 브라우저는 평소 브라우저와 별도 프로필을 쓴다. 로그인 유지 여부는 다음 작업에서 실제로 다시 확인한다. 유지된다고 가정하지 않는다.
