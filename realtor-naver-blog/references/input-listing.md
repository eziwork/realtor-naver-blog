# Listing-number input contract

매물번호는 네이버부동산(fin.land.naver.com)의 articleNo다. 실측(2026-08-26,
사진 9장 매물 9/9 수집 검증):

- 중개사는 자기 매물의 번호를 **상세 페이지 '기본 정보' 표 하단**에서
  확인한다 (입주가능일 다음 줄, `매물번호` 라벨). 이 번호 = 상세 URL
  `fin.land.naver.com/articles/{번호}` 의 숫자 = API의 articleNumber.
- `fetch-listing.mjs`는 이 번호로 front-api 3종(key → basicInfo →
  **galleryImages**)을 읽어 매물 사실과 **갤러리 사진 전체의 원본 URL**을
  가져온다. 화면에 보이는 대표 사진 1장이 아니라 등록된 사진 전부다.

## Rules

- Digits-only input (6+ digits) → articleNo로 취급하고
  `node scripts/fetch-listing.mjs --article <no> --out <run-dir> --photos` 실행.
- **URL 입력 분기**:
  - `fin.land.naver.com/articles/{번호}` 형태 → 번호를 추출해 `--article`로 전달한다. 저장소 수집기는 `--url`도 지원하지만 이전 로컬 수집기와의 호환을 위해 번호 경로를 우선한다.
  - `fin.land.naver.com/map?...` 지도 공유 URL → **번호가 들어있지 않다(실측)**.
    스크립트가 `map_url_has_no_article_number`로 거절하니, 사용자에게 매물
    상세 페이지 URL 또는 '기본 정보' 표 하단의 매물번호를 한 번 요청한다.
  - 네이버가 아닌 매물 사이트 URL → 자연어 경로 (SKILL.md Stage 0).
- **결과 해석 — 카운트를 그대로 보고한다**: 출력 JSON의
  `photos: {expected, downloaded, failed[]}` 를 읽고, `expected ≠ downloaded`
  이면 실패 목록(사유 포함)을 요약 보고에 그대로 옮긴다. "사진 몇 장은
  못 받았다"를 숨기는 것은 계약 위반이다.
- `listing.json`(schema 3.0) 사실 위치:
  - `facts.basic_info.priceInfo` — 거래유형·보증금·월세·매매가
  - `facts.basic_info.detailInfo.articleDetailInfo` — 매물번호·소개 텍스트
  - `facts.basic_info.detailInfo.spaceInfo / sizeInfo / facilityInfo /
    movingInInfo / verificationInfo` — 면적·공간·시설·입주·검증 정보
  - `page_text` — 렌더된 화면 텍스트 (보조 소스)
  - `gallery.images[].url` — 사진 원본 URL 전체 (다운로드본은 `photos/`)
- The fetched record is used as-is; never embellish it. A field missing from
  the record stays missing — never fill it from guesses.
- 사진은 등록자가 올린 것이므로 사용자가 자기 매물을 시켰다는 전제에서
  그대로 쓴다 (자기 워터마크). 사용자가 별도 사진 파일을 주면 그것이 우선.
- If the fetch fails (deleted listing = HTTP 404 "찾을 수 없어요", blocked
  request, structure change), say so in one line, keep the raw output for
  debugging, and fall back to asking for the facts in natural language — the
  run continues.
- No ownership verification is performed by design; the user is responsible
  for using their own listing number.

## v0.2 정규화와 이전 설치본

수집 원본 listing.json은 유지하고, 확인된 값만 별도 facts.json으로 정리한다.
article_match=false 또는 원문 매물번호가 요청 번호와 다르면 해당 자료로 글을 만들지 않는다.

이전 로컬 수집기는 다른 JSON 형태(api_payloads/page_text, gallery_complete,
gallery_expected_count/gallery_discovered_count/gallery_photos_saved, photo_manifest,
photo_download_failures)를 사용할 수 있다. 실제 JSON을 읽고 필드 경로와 원문 발췌를
출처로 남긴다. schema 3.0의 facts.basic_info가 있다고 가정하지 않는다.

사진은 expected/downloaded/failed 또는 이전 형식의 expected/discovered/saved를 대조한다.
누락이면 한 번 재수집한다. 그래도 누락이면 확보한 자료를 보관하고 누락 목록을 보고한다.
사용자에게 사진 보완 또는 확보분 사용 여부를 묻고, 답 없이 누락을 숨긴 완성본을 만들지 않는다.
gallery_complete가 null이면 전수 수집으로 단정하지 않는다. 사용자가 제외를 선택한 사진은
excluded_photos에 이유를 남긴다.
