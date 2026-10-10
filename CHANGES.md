# 변경 내역

**v0.5부터 이 저장소는 Codex 내장 브라우저 전용입니다.** Playwright 수집기를 포함한 v0.3은 태그 `v0.3.0`으로 보관했습니다(`git checkout v0.3.0`). 스킬 이름과 호출명은 그대로 `realtor-naver-blog` / `$realtor-naver-blog`이며, v0.3을 쓰던 분은 업데이트하면 내장 브라우저판으로 바뀝니다. 사무소 프로필은 그대로 이어서 씁니다.

## v0.6.4 (2026-10-10) — 이미지 생성 병렬화

v0.4 실행 기록에서 이미지 생성이 비동기 셀(`// @exec: {"yield_time_ms": 1000}` + `store`/`wait`/`load`)로 이미 일부 병렬 실행된 것을 확인했다. 지침에 없어서 실행마다 달라질 수 있던 것을 규칙으로 고정한다.

- SKILL.md 속도 규칙 6: 이미지 생성은 기다리지 않는다. 확인된 비동기 형태, 기다리는 동안 할 일(post-template·TODO 채우기, 블로그 열기·로그인·임시저장 목록·글쓰기 화면)과 기다려야 할 일(prepare, begin 이후 입력)을 명시
- 상담 배너는 전략 확정 전 예외: 매물 내용이 없으므로 수집 단계에 미리 생성(재사용 가능하면 생성 안 함)
- 썸네일은 전략 확정 직후 바로 생성 시작
- transfer-contract: 블로그 열기·로그인·목록 확인은 begin 전에 미리, 입력만 begin 후. 입력 전 목록 번호 순서 정리
- 예상 효과 30초~1분 단축(추정, 미측정)

## v0.6.3 (2026-10-10) — 글자 크기 가독성

- 모든 블록에 글자 크기를 직접 지정: 본문 16px, 소제목 24px 굵게, 조건표 15px(첫 열 굵게), 빈 줄도 16px
- 소제목을 `<h2>` 대신 `<p><span 24px 굵게>`로: Dr-Min 실측 — 크기를 적지 않은 문단은 변환기가 직전 소제목 스타일을 이어 붙인다
- 강조를 실측으로 살아남은 형태로: 굵게 `font-weight:700` span, 형광 배경 `#fff3b0` span (`<strong>`·`<mark>` 사용 중단)
- 재열람 검수에 글자 크기 확인 추가(소제목 다음 문단 번짐 포함). 16/24가 무시되면 실측 보존값 15/19로 조정
- 미확인: 16px·24px는 스마트에디터 기본 크기 목록의 값이지만, 붙여넣기 보존은 15·19만 실측됐다
- npm test 53/53

## v0.6.2 (2026-10-10) — 빠졌던 Dr-Min 실측 교훈 추가 복원

v0.6.1(표 테두리)과 같은 종류의 누락을 Dr-Min 최종본(8aee178)의 SKILL.md·transfer-contract.md·content-format.md·post-draft.mjs "실측" 기록과 하나씩 대조해 찾았다.

| 빠졌던 것 | Dr-Min 실측 내용 | 반영 |
|---|---|---|
| **텍스트 전화 링크 순서** | 텍스트 링크와 이미지 링크는 같은 레이어. 이미지에 한 번 쓰면 선택한 글자 줄을 링크하지 않고 지운다 | 텍스트 전화 링크를 반드시 사진·지도·배너 전에. v0.6 빠른 경로 셀 설명이 순서를 거꾸로 적고 있던 것도 수정 |
| **링크 버튼 선택** | 이름(/링크 입력/)으로 찾으면 이미지 링크 버튼("링크 입력 열기")이 잡힌다 | `data-name="text-link"`로 선택. v0.3 문서가 바로 그 '링크 입력 열기'를 누르라고 적고 있었음 |
| **링크 적용 대기** | 툴바 0.9초, 적용 후 1.2초, 적용과 확인 사이 키 입력 금지(End·Enter가 연결 취소) | transfer-contract에 추가 |
| **두 번째 붙여넣기 금지** | 컴포넌트 삽입 후 두 번째 붙여넣기 → 저장 시 문단이 전부 굵게, 전화 줄 소실(재현·이등분) | 명시적 금지, 빠진 문단은 타이핑으로 수정 |
| 자동복구 안내 | '작성 중인 글'은 취소로 닫는다. 취소는 삭제가 아니다 | 추가 |
| 네이버가 아닌 매물 링크 | 그 페이지를 열어 게시된 사실과 사진 수집(돼지부동산 등) | v0.5는 "자연어 경로"로만 안내해 사진을 안 가져올 수 있었음 → 내장 브라우저로 열어 사실·사진 수집 |
| 6자리 미만 번호 | 다른 사이트의 자체 번호(돼지부동산 5자리) — 다시 묻지 말 것 | resolve 안내 수정 |
| 썸네일 규격 | 1:1, 매물명 + 사무소/중개사 이름 | 1:1 명시 |
| 배너 저장 실패 | 공용 폴더에 못 쓰면 run 폴더에, 포기하지 않음. 번호를 크게 | 추가 |
| 실패 보고 | JSON·오류 원문을 그대로 인용 | 추가 |

이미 있던 것: 사진 전부 싣기, 강조 남용 경고(굵게 챕터당 1, 형광 2), 본문에 전화번호 금지, '## 태그' 금지, 지도 패널 닫기·재검색, 남은 자리 표시 정리, 삭제 금지.

일부러 다른 것(정책 차이, 바꾸지 않음): 이미지 생성 실패 시 Dr-Min은 이미지 없이 계속 진행, v0.3 이후는 썸네일·배너 필수. 원고 검사 엄격도(Dr-Min은 오류, v0.3 이후 경고). 소제목·문단 글자 크기 지정(Dr-Min은 15px/19px 굵게를 직접 지정, 현재는 h2/p — 10-10 실행에서 문제는 관측되지 않음, 확인 필요).

## v0.6.1 (2026-10-10) — 조건표 테두리 복원

조건표가 네이버에서 줄 없는 흰 표로 나오던 문제. 원인: v0.3부터 표 HTML에 테두리 스타일이 없었다. Dr-Min `cb866fe`(2026-08-24) 실측 — 스타일 없는 표는 편집기에서 테두리 없는 50:50 표로 변환되고, 인라인 스타일은 살아남는다 — 을 복원했다.

- 셀 테두리 `1px solid #d9dde2`, padding 8px, 첫 열 배경 `#f5f6f8` + 굵게, 열 폭 28:72, `border-collapse`
- '항목/내용' 머리 행 제거, 가운데 정렬 유지
- 재열람 검수에 표 모양(테두리·첫 열 배경) 확인 추가
- 테스트 추가(52/52)

## v0.6.0 (2026-10-10) — 속도 최적화

v0.4 실제 실행(8분, 도구 호출 61회, 입력 토큰 1,106만)의 호출 기록을 분석해, 시간이 새는 곳을 줄였다. 사진 품질·장수와 검수 범위는 줄이지 않았다.

| 원인 (실행 기록) | 변경 |
|---|---|
| post.json 형식·office_hash를 알려고 `content.mjs` 소스를 읽음 | `workflow.mjs post-template`: 해시·사진 전부·조건표·CTA·배너 해시가 채워진 뼈대 생성, TODO만 채우면 됨(남으면 prepare 실패). `office-hash` 명령 |
| 수집을 6번 이상 나눠 호출, API는 시도 안 함 | browser-collect.md **빠른 경로 2셀**: 셀1 = 열기+API 3종+장수+화면 글자, 셀2 = 갤러리 전부 로드+가장 큰 크기만 골라 한 번에 bundle |
| 사진 자리 교체를 장마다 따로 호출 | transfer-contract.md **빠른 경로 1셀**: 모든 `@@IMG:n@@`를 반복문으로 교체하고 남은 마커·로드된 이미지 수를 함께 확인 |
| 업로드 동의를 전략 확정 뒤 따로 다시 질문 | 전략 확정 질문에 업로드 동의 포함, approval에 `upload_consent` 기록. 사용자 질문은 최대 2번 |
| 참조 문서를 단계마다 반복 열람 | SKILL.md "속도 규칙": 문서는 단계 시작 때 한 번, 소스 코드 열람 금지, 독립 셸 작업 묶기 |
| 사실 표가 길어짐(v0.5) | 사용자에게는 **제외한 사실과 이유만** 표시, 전체 분류는 fact_coverage에 기록 |
| 썸네일 판정이 모든 `?type=`에 걸릴 수 있음 | 800px 미만 리사이즈만 썸네일로 판정 |

미확인: 빠른 경로 셀은 10-10 실행에서 확인된 API 호출을 묶은 것이지만, 묶은 형태 그대로는 아직 실행해 보지 않았다. 페이지 안 `fetch` 허용 여부도 미확인.

## v0.5.0 (2026-10-10) — 내장 브라우저 전용으로 전환

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

## v0.4 (내장 브라우저 전용판 첫 버전) — v0.3(6ebe0b3) 대비

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
