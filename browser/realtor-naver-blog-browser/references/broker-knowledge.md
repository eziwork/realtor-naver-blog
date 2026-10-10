# 현장 포인트·사무소 상담 노하우 (v0.3)

Codex가 발언의 의미와 적용 범위를 판단한다. 코드는 필수 항목·참조·상태·중복·출처 연결을 검증한다. 스키마 통과만으로 사용자 경험의 진위나 개인정보 제거가 증명되지는 않는다.

## 실행 순서

1. 매물의 원문·사진에서 facts를 저장한다. 유형·거래처럼 필수인 정보는 먼저 확인한다.
2. `knowledge-list --run <run> [--profile <profile.yaml>]`로 적용 가능한 활성 노하우와 충돌 항목을 조회한다. 저장된 사용자 설명이 없으면 빈 목록으로 진행한다.
3. 입력의 현장 설명이 충분한지 판단한다. 충분하면 질문 없이 기록한다. 차별점·망설임을 설명하기 어려울 때만 필요한 현장 질문 1~2개를 기존 사실 확인 질문 및 충돌 확인과 묶는다. 노하우는 무엇을 물을지 참고할 수 있지만 이 매물의 실제 조건에 대한 답은 아니다.
4. 질문을 한 경우 상태를 asked로 저장한다. 답변·건너뛰기·미응답을 기록한 후 전략으로 넘어간다. 선택 질문에 답할 기회를 주되, 답이 없으면 재촉하거나 두 번째 질문 묶음을 만들지 않는다. 필수 사실의 확인 절차는 그대로 유지한다.
5. 답변의 매물 사실을 facts에 반영했다면 `facts`를 다시 실행하고 새 listing_hash로 context를 저장한다. 질문 텍스트는 처음 묶음 그대로 유지한다.
6. 사용자가 반복 적용할 뜻을 분명히 말했다면 노하우를 저장하고 한 문장으로 알린다. 개별 경험과 AI 추론은 저장하지 않는다. 관리용 `knowledge-list`(run 생략)로 동일 내용·수정 대상·충돌을 비교한다.
7. 현장 포인트·활성 노하우를 반영해 전략 한 안을 제시한다. 기존 여덟 행의 관련 행에 “사무소 상담 경험 반영”을 표시한다. 실제 사용한 참조와 스냅샷을 첨부하고 사용자 확정을 기다린다.

## 분류 예시

| 사용자 설명 | 기록 | 활용 |
|---|---|---|
| “이 창고는 출입구 폭이 4m예요” | 사용자 출처의 매물 사실 | 현재 매물의 확인된 조건 |
| “이 창고는 상하차 동선이 가장 마음에 들어요” | 중개사의 평가 | 확인된 동선 정보를 앞에서 설명; 객관적 우수성 단정 금지 |
| “이 창고를 본 고객이 진입로를 좋아했어요” | 전달받은 개별 고객 반응 | 해당 작업의 관심사 참고; 다음 매물로 일반화 금지 |
| “우리 파주 창고 임대 고객들은 차량 진입을 먼저 물어봐요” | 사무소 상담 노하우 | 파주·창고·임대 전략에서 진입 설명 우선; 진입 가능 여부는 새 매물 근거로 확인 |
| AI가 “물류 사업자가 좋아할 것”이라고 추론 | 전략의 타겟 가설 | 사용자 경험이나 노하우로 저장 금지 |

사실과 평가가 한 발언에 섞이면 별도 항목으로 나눈다. 출처는 필요한 실제 사용자 구절만 보관한다. 고객 반응을 인용 후기나 작성자의 방문 체험으로 변환하지 않는다.

## 작업별 broker-context.json

`node scripts/workflow.mjs context-save --run <run> --file <context-input.json>`

```json
{
  "schema_version":"1.0",
  "listing_hash":"facts 명령이 반환한 현재 해시",
  "assessment":"needed",
  "reason":"해당 창고의 추천 포인트와 고객 망설임이 제공되지 않음",
  "status":"asked",
  "questions":[
    {"key":"recommendation","text":"이 창고를 비슷한 창고보다 추천하는 가장 큰 이유는 무엇인가요?"},
    {"key":"reaction","text":"이 창고 상담에서 고객이 좋아하거나 망설였던 부분이 있나요?"}
  ],
  "items":[]
}
```

- assessment: sufficient / needed. sufficient는 status=not_needed, questions=[]다.
- status: not_needed / asked / answered / skipped / unanswered. needed이면 최초 질문 기록이 있어야 한다.
- questions: 0~2개, recommendation/reaction 중 중복 없는 key. 한 작업에서 질문한 뒤에는 같은 묶음을 유지한다. 완료·건너뛰기를 다시 asked로 열지 않는다.
- items: `{id,kind,text,source:{kind:"user",locator,excerpt},fact_ids:[]}`.
- kind: fact / evaluation / customer_reaction. 평가·반응의 fact_ids는 빈 배열.
- fact는 confirmed 사실 ID와 실제 사용자 출처의 locator/excerpt가 일치해야 한다. 설명된 사실만 연결하고 다른 매물의 출처를 복사하지 않는다.
- 저장 시 updated_at이 붙는다. 질문하지 않은 경우에도 입력에서 얻은 현장 포인트를 items에 남길 수 있다.
- asked 상태로는 현재 매물의 전략을 제안할 수 없다. skipped/unanswered에서 답을 만들어 넣지 않는다. 일부만 답한 경우 answered로 기록하고 확보한 항목만 남긴다.

## 프로필별 office-knowledge.json

기존 profile.yaml과 같은 폴더에 저장하며 blog-styles.json과 분리한다. 같은 폴더를 사용하는 작업끼리 공유하므로 서로 다른 사무소는 프로필 폴더를 분리한다. 기존 YAML·문체 파일은 수정하지 않는다.

`node scripts/workflow.mjs knowledge-save --file <knowledge-input.json> [--profile <profile.yaml>]`

```json
{
  "kind":"explanation_priority",
  "text":"차량 진입 설명을 먼저 배치한다",
  "scope":{"property_types":["창고"],"regions":["파주"],"transactions":["임대"]},
  "scope_reason":"사용자가 파주 창고 임대 상담의 반복되는 경험이라고 명시함",
  "source":{
    "kind":"user",
    "locator":"실제 사용자 발언의 메시지 위치",
    "excerpt":"우리 파주 창고 임대 고객들은 차량 진입을 먼저 물어봐요.",
    "scope":"office_pattern"
  },
  "privacy_reviewed":true
}
```

위 JSON은 형식 예시다. 예시 자체를 실제 사무소 메모리에 저장하지 않는다.

- kind: consultation_question / explanation_priority. 질문 또는 설명의 우선순위만 저장한다.
- scope: 유형·지역·거래 조건의 문자열 배열. 빈 배열은 사용자가 그 차원을 한정하지 않고 일반적으로 설명했다는 의미다. **불명확한 범위를 빈 배열로 바꿔 전체에 적용하지 않는다.** 명확하지 않으면 저장·적용을 보류한다.
- source: 실제 사용자 발언이어야 하며 scope=office_pattern 필수. AI 추론·개별 매물 경험을 이 값으로 꾸미지 않는다.
- 고객 이름·연락처는 text, source, 범위 설명, 수정/충돌/잊기 사유에서 모두 제거한다. 발언 위치는 메시지 ID 등 비식별 표기를 쓴다. 이름은 “고객”으로 익명화하고 익명화한 발췌임을 locator에 표시한다. 연락처 패턴 검사는 보조 검사일 뿐 이름 제거를 대신하지 않는다.
- 저장 결과에 know- 식별자, revision, created_at/updated_at, status(active/conflict/inactive)가 붙는다. 저장·수정이면 반환 notice로 짧게 알린다. 중복이면 저장했다고 새로 알리지 않는다.
- 비슷한 의미의 중복과 충돌은 Codex가 전체 목록을 읽어 판단한다. 코드는 동일 유형/범위와 정규화한 동일 문장의 중복을 막는다. 의미상 같은 내용을 표현만 바꿔 추가하지 않는다.

### 범위 조회

`knowledge-list --run <run>`은 활성·일치 항목을 items에, 일치하는 충돌 항목을 conflicts에 반환한다. 충돌은 전략에 사용하지 않는다.
`knowledge-list`는 비활성 항목도 포함하는 관리용 목록이다.

유형·거래는 정규화 후 정확히 비교한다. 지역은 confirmed 사실 중 지역/주소/소재지/시도/시군구/읍면동/location/region/address 라벨의 값과 정확히 비교한다. “파주”와 “파주로”를 부분 일치시키지 않으며 “파주”와 “파주시”를 자동 추정해 맞추지 않는다. 원문으로 확인한 지리 단위를 사실 추출 단계에서 일관되게 기록한다. 근거 없는 지역을 추가해 강제로 매칭하지 않는다. 지역이 미확인이거나 불명확하면 그 범위의 노하우를 제외한다.

### 수정·충돌·잊기

- 명시적 수정: 새 입력에 `replaces:["기존 ID"]`, `change_request:"실제 수정 요청"` 추가. 새 항목은 active, 기존은 inactive이며 연결 이력을 남긴다.
- 모호한 충돌: 새 입력에 `conflicts_with:["기존 ID"]`, `conflict_reason:"확인이 필요한 이유"` 추가. 양쪽을 conflict로 보류하고 기존 질문 묶음에서 확인한다. 이미 질문했다면 별도 현장 질문 묶음을 반복하지 말고 이번 전략에는 제외한다.
- 충돌 해결: 사용자의 명확한 설명으로 연결된 충돌 항목 전부를 replaces에 넣는다. 한쪽만 몰래 활성화하지 않는다.
- 잊기: `knowledge-retire --file <retire.json>`, 입력 `{"id":"기존 ID","user_request":"이건 잊어줘"}`. inactive로 바꾸고 이후 작업에서 제외한다. 동일 발언을 다시 발견했다고 자동 부활시키지 않는다.

## 전략의 선택 참조

```json
{
  "context_refs":[
    {"id":"ctx-1","snapshot":{"id":"ctx-1","kind":"evaluation","text":"실제 저장 내용","source":{"kind":"user","locator":"발언 위치","excerpt":"실제 발췌"},"fact_ids":[]},"usage":["hook","sections"],"reason":"추천 포인트를 강조 순서에 반영"}
  ],
  "knowledge_refs":[
    {"id":"know-저장된ID","snapshot":{"id":"know-저장된ID","revision":1,"kind":"explanation_priority","text":"저장 내용","scope":{"property_types":["창고"],"regions":["파주"],"transactions":["임대"]},"source":{"kind":"user","locator":"발언 위치","excerpt":"실제 발췌","scope":"office_pattern"}},"usage":["sections","cta"],"reason":"차량 동선 설명과 상담 질문을 앞에 배치"}
  ]
}
```

snapshot은 예시를 다시 쓰지 말고 저장된 항목을 복사한다. context는 items의 항목 전체, knowledge는 id/revision/kind/text/scope/source만 포함한다. usage는 primary_target/hook/sections/cta/keywords/intro_direction 중 하나 이상이다.

propose는 현재 매물의 현장 기록 및 해당 사무소의 활성·일치 노하우와 스냅샷을 대조한다. facts에는 이 참조를 넣을 수 없다. 새 선택 필드가 없는 기존 작업은 그대로 읽힌다.
저장된 상담 노하우는 전략 참고이며 매물 사실의 출처가 아니다. 구조 검사가 우회된 자연어 주장은 Codex가 원문과 대조해 차단해야 한다.
전략 확정 뒤 기억을 추가·수정·비활성화해도 확정된 strategy.json은 자동 변경되지 않는다. 이번 글의 타겟·후킹·구성을 바꾸려면 재제안하고 다시 확정받는다.
