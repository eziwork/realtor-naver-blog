# 파일 계약과 CLI (v0.3)

모든 명령은 스킬 폴더 기준 `node scripts/workflow.mjs <명령>`이다. --file에는 UTF-8 JSON 파일, --run에는 init-run이 반환한 폴더를 전달한다. 출력은 JSON이며 실패 시 exit 1. Codex가 데이터와 관측 근거를 작성하고 코드는 스키마·참조·해시·상태 전이를 검사한다. 사용자 응답과 브라우저 관측을 암호학적으로 인증하는 도구는 아니다. 실제 응답/관측을 정확히 기록해야 한다.

## 1. 매물 facts.json

```json
{
  "schema_version": "1.0",
  "property_type": "아파트",
  "transaction": "매매",
  "type_fact_id": "type",
  "transaction_fact_id": "trade",
  "sources": [
    {"id":"u1","kind":"user","locator":"사용자 매물 설명","excerpt":"강남 아파트 매매, 공급 31평"}
  ],
  "facts": [
    {"id":"type","label":"유형","value":"아파트","status":"confirmed","source_ids":["u1"]},
    {"id":"trade","label":"거래","value":"매매","status":"confirmed","source_ids":["u1"]},
    {"id":"region","label":"지역","value":"강남","status":"confirmed","source_ids":["u1"]},
    {"id":"area","label":"공급 면적","value":"31평","status":"confirmed","source_ids":["u1"]},
    {"id":"price","label":"매매가","status":"unknown","source_ids":[]}
  ],
  "photos": [],
  "unknowns": ["매매가 확인 필요"]
}
```

source.kind: user / listing / photo / document. locator는 사용자 메시지 식별 설명, URL+JSON 경로, 또는 사진 경로다. excerpt는 실제 원문의 근거다. status=conflict는 alternatives 2개 이상과 각 원문 출처를 보관한다. confirmed만 원고 근거로 사용한다.

사진: `{id,path,label,source_id}`. path는 run 기준 상대 경로 또는 절대 경로. label은 실제 관찰 결과. 원본 수집 listing.json(schema 3.0)은 그대로 보존하고 facts.json(schema 1.0)과 혼동하지 않는다.

`facts --run <run> --file <facts.json>`은 변경 시 확정/준비 상태를 해제한다. provenance 포함 입력이 바뀌면 보수적으로 재확인한다.

현장 기록의 명시적으로 확인된 사실만 user 출처로 연결한다. 중개사의 평가·고객 반응·사무소 상담 노하우를 facts로 전용하지 않는다.

### 현장 기록·상담 노하우

- `context-save --run <run> --file <context-input.json>`: 작업별 broker-context.json 저장. 질문 판단·최대 2개 질문·응답 상태·분류된 사용자 근거를 기록한다.
- `knowledge-list [--run <run>] [--profile <profile.yaml>]`: run을 주면 일치하는 활성 항목과 보류 중인 충돌을 조회한다. 생략하면 관리용 전체 목록.
- `knowledge-save --file <knowledge-input.json> [--profile <profile.yaml>]`: 명확한 반복 상담 경험 저장, 중복 방지, 명시적 수정 또는 충돌 보류.
- `knowledge-retire --file <retire.json> [--profile <profile.yaml>]`: 실제 잊기 요청으로 비활성화.

계약과 예시는 [broker-knowledge.md](broker-knowledge.md)를 따른다. office-knowledge.json은 profile.yaml과 같은 폴더에 저장하며 YAML·문체를 수정하지 않는다. 다른 프로필을 사용하는 작업은 propose에도 같은 --profile을 전달한다.

## 2. 전략 strategy.json

```json
{
  "schema_version":"1.0",
  "seo_mode":"inferred_candidates",
  "interpretation":{"text":"강남의 공급 31평 아파트 매매","fact_ids":["type","trade","region","area"]},
  "primary_target":{"text":"강남에서 생활 공간을 비교하는 실거주 수요","reason":"지역과 공급 면적을 기준으로 한 가설","fact_ids":["region","area"]},
  "search_intent":"강남에서 원하는 생활 공간에 맞는 아파트 매매 조건은 무엇인가?",
  "keywords":{"label":"추천 후보","main":"강남 아파트 매매","related":["강남 공급 31평 아파트","강남 아파트 공간 구성"]},
  "hook":{"text":"공급 면적을 기준으로 생활 공간을 비교","fact_ids":["area"]},
  "title_direction":"지역·유형·확인된 면적을 중심으로",
  "intro_direction":"공간을 비교하는 독자의 질문부터",
  "sections":[{"id":"space","question":"공간 구성이 생활에 맞는가?","direction":"확인된 면적과 사진으로 설명","fact_ids":["area"],"photo_ids":[]}],
  "cta":{"channel":"phone","benefit":"희망 가구 배치와 매매가 확인"},
  "checks":["매매가 확인 필요"],
  "fact_coverage":[
    {"fact_id":"type","decision":"use","reason":"제목·표"},
    {"fact_id":"trade","decision":"use","reason":"제목·표"},
    {"fact_id":"region","decision":"use","reason":"제목·검색어"},
    {"fact_id":"area","decision":"use","reason":"후킹·표"}
  ]
}
```

`fact_coverage`: confirmed 사실 전부를 `use`/`exclude`로 분류하고 각각 `reason`을 적는다. 하나라도 빠지거나 이유가 비면 `propose`가 실패한다. 판단(무엇을 쓸지)은 Codex가 하고 코드는 빠짐없음만 검사한다.


`propose --run <run> --file <strategy.json>` 후 여덟 항목을 사용자에게 제시한다. 반환된 listing_hash와 strategy_hash를 기록해 둔다. 확정 응답 후만 approval.json 생성:
`{"listing_hash":"반환 해시","strategy_hash":"반환 해시","user_quote":"사용자의 실제 확정 응답"}`.
`approve --run <run> --file <approval.json>`.
`check-approved --run <run>` 실패 시 원고 작성/브라우저 입력을 하지 않는다.

cta.channel은 phone 기본, 사용자가 등록된 다른 채널을 선택하면 registered. 후자는 office.public_contact_url(HTTPS), office.public_contact_label을 사용한다. 현재 프로필 값 외 연락처를 만들어 넣지 않는다.

선택 필드 context_refs / knowledge_refs는 `[{id,snapshot,usage,reason}]`이다. 현재 현장 기록과 활성·범위 일치 노하우만 참조하며 내용 스냅샷을 검증한다. 기존 작업에는 없어도 된다. 질문 상태 asked는 answered/skipped/unanswered로 처리한 뒤 제안한다. 기억 저장 자체는 승인 상태를 바꾸지 않으며 전략의 주요 내용을 바꿀 때만 재제안·재확정한다.

## 3. 문체 blog-styles.json

`style-get --blog <ID/URL> [--profile <profile.yaml>]` → style 또는 null.
`style-save --file <style.json> [--profile <profile.yaml>]`.
기존 스타일 변경은 실제 사용자 요청을 `--change-request <요청문>`으로 전달한다.

style.json:
- schema_version: "1.0"; blog_id: 대상 ID
- origin: analyzed 또는 default
- features: honorifics, sentence_length, paragraph_rhythm, opening, headings, terminology, emphasis, emoji, consultation — 모두 문자열
- sources: 최대 5개 `{url,text_excerpt}`. 실제 읽은 공개 매물 글과 짧은 문체 근거
- analyzed_at: ISO 시각
- default면 fallback_reason 필수. 분석 본문이 0이면 analyzed로 저장할 수 없다.
- limited_sample은 저장 시 sources < 3으로 자동 설정

YAML 원본과 기존 필드에 손대지 않는다. 다른 블로그 문체를 덮어쓰지 않는다.

## 4. post.json → 로컬 산출물

**먼저 `post-template --run <run>`을 실행한다.** `post-template.json`에 해시, 썸네일·사진 전부(문단 배정 사진 먼저, 나머지는 순서대로)·조건표(`fact_coverage`에서 use로 분류한 사실의 원문 값)·CTA benefit·배너 office_hash가 채워진다. `TODO`로 시작하는 문자열만 채우고 이미지를 실제로 본 뒤 `reviewed:true`로 바꿔 post.json으로 저장한다. TODO가 하나라도 남으면 prepare가 실패한다. 배너 해시만 필요하면 `office-hash`.

전략 확정 후 생성. 필수 필드:
- schema_version: "1.0"
- listing_hash / strategy_hash: 확정된 입력/전략 해시
- title: `{text,fact_ids:[]}`
- style: `{origin:"stored|analyzed|default",summary:"적용 문체 요약"}`; 저장 스타일은 블로그 ID·분석 시점을 summary에 기록
- fact_review: `{completed:true,notes:"의미 검수 내용과 제외한 주장"}` — 실제 검수 후 설정
- blocks: 아래 블록 목록
- excluded_photos: `[{id,reason}]`, 제외한 사진이 있을 때
- map_omission_reason: 확인된 지도 장소가 없을 때만 이유 기록
- tags: `["#태그"]`, tag_fact_ids: 태그의 사실 근거

| type | 필드 |
|---|---|
| paragraph / heading | text, fact_ids, section_id(전략의 해당 문단 ID) |
| table | rows: [{label,text,fact_ids}] — 2열 |
| image | role: photo/thumbnail/cta_banner, path, alt, reviewed:true; photo면 photo_id; 배너면 office_hash |
| map | query, fact_ids |
| cta | text, fact_ids, benefit(전략과 동일) |

office_hash는 `node scripts/workflow.mjs office-hash`(또는 post-template)가 준다. 소스 코드를 읽어 계산하지 않는다. 모든 이미지 실물 검수 후 reviewed=true로 쓴다.

`prepare --run <run> --file <post.json> --blog <ID> [--profile <profile.yaml>]`.
확정되지 않았거나 근거 참조·수치·이미지·배너 프로필이 맞지 않으면 실패한다.
문서의 모든 전략 section_id, 사진 사용/제외 사유, 썸네일·배너·조건표·CTA를 검사한다.
blog-post.md / transfer.html / manifest.json / post.json 경로와 해시를 state에 보관한다.
수치 검사에는 한계가 있다. 동일 숫자라도 다른 의미에 붙인 경우, 비수치 과장, 허위 출처는 Codex가 원문을 보고 검수해야 한다.

## 5. 전송과 결과

`begin --run <run> [--profile <profile.yaml>]` → attempts 마지막 항목의 id.
승인·원고·HTML·이미지·프로필 해시를 재검사한다. 시도가 시작되면 저장 실패/자동저장 가능성 때문에 무조건 새 글로 재시도하지 않는다.

실제 브라우저 결과를 verification-input.json으로 저장:
```json
{
  "attempt_id":"begin이 반환한 id",
  "outcome":"saved",
  "observation":"저장 신호를 관측하고 목록에서 같은 글을 재열람",
  "save_signal":"실제로 본 토스트 또는 목록 변화",
  "saved_identity":"블로그 ID+유일한 제목+저장 시각 또는 UI에 드러난 ID",
  "reopened_identity":"동일 식별자",
  "checks":{
    "title":{"result":"pass","evidence":"원고 제목과 일치"},
    "body":{"result":"pass","evidence":"모든 문단 비교와 자리표시 잔존 없음"},
    "images":{"result":"pass","evidence":"이미지별 순서와 로드 확인, 배너 연락처 대조"},
    "table":{"result":"pass","evidence":"행/열과 모든 셀 비교"},
    "map":{"result":"pass","evidence":"장소 이름과 주소 비교"},
    "contact":{"result":"pass","evidence":"표시 번호와 tel: 대상 비교"}
  }
}
```
`record --run <run> --file <verification-input.json>`.

outcome: saved / blocked(로그인 등) / failed(업로드 등) / unknown(저장 신호 불명).
check.result: pass / fail / unknown. map만 명시적 생략 때 not_applicable 허용.
저장·동일 글 재열람·모든 검사 통과일 때만 완료. 재열람 검사 실패는 보완 필요, 미검수는 확인 불가.

재시도 전 `reconcile --run <run> --file <reconciliation.json>`:
`{"draft_list_checked":true,"matched_identity":"찾은 글 식별자 또는 null","evidence":"목록에서 확인한 구체적 결과"}`.
JSON null은 실제로 목록을 확인해 없음을 확인한 경우에만 쓴다. SAVED였던 글은 식별자 없이 재시작할 수 없다.
다음 begin이 resume_draft_identity를 반환하면 해당 글을 다시 열어 수정한다.

run-state.json은 현재 단계, 블로그, 확정, 산출물, 시도 이력, 복구 관측, 저장/완성도 결과를 기록한다. 원고나 이미지를 삭제하지 않는다.
