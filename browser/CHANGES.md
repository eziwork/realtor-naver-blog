# 변경 내역

## v0.5.0-browser (2026-10-10)

2026-10-10 실제 실행(매물 2654275369) 결과: 입력·사진 업로드·저장·재열람은 `SAVED / 완료`로 통과했다. 그러나 수집이 화면 읽기(`dom`)로만 진행돼 **대표 썸네일 1장(`?type=m562`, 31KB)만** 받았고, 화면 사진 장수와 API 시도 기록이 없었다. 이번 버전은 이 문제와 남은 Dr-Min 최적화를 반영한다.

| 변경 | 내용 | 근거 |
|---|---|---|
| 수집 완전성 게이트 | `import-listing`이 `complete`·`incomplete_reasons`를 판정한다: API 시도 기록 없음, 화면 장수 미기록, 확보 장수 부족, 확보 실패, 썸네일만 확보. 불완전하면 `workflow facts`가 `PHOTO_COLLECTION_INCOMPLETE`로 막고, 사용자 응답을 `--accept-incomplete`로 기록한 경우에만 진행 | 10-10 실제 실행 |
| 수집 절차 강화 | 페이지 안 API 시도 필수 + `api_attempt` 기록, 막히면 CDP(사이트별 승인) 대안, 갤러리 뷰어에서 N장 모두 열기, 썸네일 대신 `downloadMedia`로 원본 | 10-10 실제 실행, Dr-Min `585acc6`·`be7bf23` |
| 사진 전부 싣기 기본값 | 비슷한 구도라는 이유로 빼지 않는다. 완전 중복·흔들림·무관 사진만 이유를 남기고 제외 | Dr-Min `07f10ef`, 10-09 파주 테스트(17장 중 5장 제외) |
| 사실 사용/제외 표 | 전략 아래에 확인된 사실 전부를 `사용/제외 + 이유`로 표시. `strategy.json`의 `fact_coverage`를 `propose`가 검사(누락·이유 없음 거부) | 10-09 파주 테스트(대지·전력·사용승인 등 이유 없이 누락) — 새 기능, 효과는 실행으로 확인 필요 |
| 배너 이미지 전화 링크 | 상담 배너 이미지에도 `tel:` 링크를 걸고 DOM으로 확인, 막히면 `banner_link=unsupported` 기록 | Dr-Min `2f3b2a3` |
| 배너 재사용 | `~/.codex/naver-realtor-blog/assets/cta-banner.png`가 현재 사무소명·연락처와 같으면 재사용 | Dr-Min `20b4693` |
| 블로그 아이디 | 한 번 묻고 `office.blog_id`에 저장, 이유와 찾는 법 안내 | Dr-Min `6cb29b3`·`40e3db6` |
| 입력 예시 3종 | 번호 / 링크 붙여넣기 / 말+사진 폴더 (docs/first-post.md) | Dr-Min `7f00f68`·`89f052f` |
| ZIP 배포 | `npm run zip`, docs/zip-install.md | Dr-Min `cb4d701`(수업장 GitHub 차단) |

확인 결과 이미 반영돼 있던 것: 표 셀 `**강조**` 변환(Dr-Min `162f964`, v0.3 `content.mjs`가 표 값에 `inline()` 적용), 저장 전후 임시저장 개수 증거(10-10 실행에서 40→41 기록).

넣지 않은 것: 무중단 완주(사용자 결정으로 제외, 전략 확정 유지). Playwright 전용 수정(로그인 유지 확인, 설치 자가 복구)은 이 버전에 해당 없음.

## v0.4.0-browser — v0.3(6ebe0b3) 대비

## 1. 내장 브라우저 전용

- 삭제: `scripts/fetch-listing.mjs`, `scripts/post-draft.mjs`, `scripts/login-setup.mjs`, `scripts/login-persistence.mjs`, `scripts/lib/deps.mjs`, `config/selectors.yaml`, `package-lock.json`, playwright 의존성과 postinstall.
- 추가: `references/browser-collect.md` — 내장 브라우저로 상세 페이지 열기 → front-api(key·basicInfo·galleryImages) 페이지 안 GET → 실패 시 화면 텍스트 → 갤러리 사진 `pageAssets.bundle`로 로컬 저장.
- 추가: `scripts/import-listing.mjs`
  - `resolve`: 번호·상세 링크에서 매물번호 추출, 지도 링크는 `map_url_has_no_article_number`로 안내.
  - `import`: 브라우저 수집 결과(capture JSON)를 `listing.json`(schema 3.0)으로 정리. 갤러리 순서대로 `photos/01.jpg…` 복사, 썸네일 `?type=` 제거, 같은 사진(해시 동일) 1장만 저장, `expected/ui_count/downloaded/failed/duplicates` 보고, 매물번호 불일치 경고.
- `SKILL.md`: "브라우저는 내장 브라우저 하나만", `npm ci` 불필요, 사진 업로드는 `filechooser` + `setFiles`와 사전 승인.
- `check-core.mjs`: `7-내장브라우저전용`(스킬 package.json에 playwright 의존성 금지), references가 부르는 스크립트 존재 확인.

근거: Codex Browser 플러그인 v26.1007 문서(`~/.codex/plugins/cache/openai-bundled/browser/26.1007.21159/docs/`)의 `file-uploads.md`, `api.json`(`waitForEvent("filechooser")`, `evaluate`(read-only), `downloadMedia`), `capabilities/tab/pageAssets.md`, `capabilities/tab/browserAuth.md`, `confirmations.md`(파일 업로드 = 사전 승인 항목).

## 2. Dr-Min 버전에서 되살린 실측 교훈

| 원 커밋 | 내용 | 반영 위치 |
|---|---|---|
| `585acc6`, `be7bf23` | galleryImages로 사진 전체, 재시도, 화면 개수 교차검증 | browser-collect.md, import-listing.mjs |
| (fetch-listing `--url`) | 상세 링크 입력, 지도 링크 안내 | import-listing.mjs `resolve` |
| `75b677d`, `d333c83` | 지도 검색 짧은 검색어 재시도, 장소 패널 닫기, 남은 `@@IMG/MAP@@` 청소 | transfer-contract.md |
| `bd98387` 등 | '전체 삭제' 실사고 → 삭제 버튼 금지, 확인창은 취소만 | SKILL.md, transfer-contract.md, check-core |

## 3. 2026-10-09~10 테스트에서 재현된 버그 수정

| 증상 | 수정 |
|---|---|
| 스킬 재설치로 `outputs/` 안 작업 폴더 삭제 | `init-run.mjs` 기본 위치를 `~/.codex/naver-realtor-blog/runs/`로, 스킬 폴더 안 `--root`는 거부 |
| `facts`에서 `unsupported property_type`(공장·창고) | `TYPES`에 `공장·창고` 추가 |
| `unsupported measurement 23억`(근거는 "23억 원") | 억·만·천 뒤 "원" 유무를 같은 값으로 비교. 근거에 없는 금액은 그대로 거부 |

## 4. 바꾸지 않은 것

전략 확정, facts 근거 연결, 문체 학습, 현장 질문·상담 노하우, 재열람 검수, 상태 보고는 v0.3 그대로입니다. 사실이 과하게 빠지는 문제(파주 테스트에서 대지·전력·사용승인 등 누락)는 원인이 불확실해 손대지 않았습니다.

### v0.4 당시 미검증 항목 (10-10 실행 결과)

- 내장 브라우저 `evaluate` 안에서 front-api `fetch`가 허용되는지 → **기록 없음**(dom 경로로 진행, 시도 여부 미기록). v0.5에서 기록 필수화
- `pageAssets.bundle`이 갤러리 원본 크기 사진을 받는지 → **썸네일 1장만 확보**. v0.5에서 썸네일 거부·downloadMedia 우선
- 네이버 편집기 '사진 추가'에서 `filechooser` → `setFiles` 업로드가 되는지 → **성공**
- 내장 브라우저 로그인이 다음 대화에서도 유지되는지 → 미확인
