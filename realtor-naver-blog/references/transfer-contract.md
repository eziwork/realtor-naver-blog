# 내장 브라우저 전송·재열람 계약

기본 전송은 Codex가 제공받은 내장 브라우저 API로 한다. 매번 현재 도구 문서를 확인한다. 아래 명칭은 2026-10-09 실측이며 UI가 달라지면 현재 DOM/접근성 트리에서 다시 찾는다. 숨은 앱 상태·페이지 내부 API·직접 DOM 변경으로 편집기를 우회하지 않는다.

## 입력 전

블로그 열기·로그인 확인·임시저장 목록 확인·글쓰기 화면 열기(아래 2~5)는 `begin` 전, 썸네일이 생성되는 동안 미리 해 둔다. 제목·본문 입력은 `begin` 통과 후에만 한다.

1. workflow.mjs begin을 통과하고 대상 blog_id와 resume_draft_identity를 확인한다(입력 직전).
2. 내장 브라우저의 작업 탭에서 글쓰기 화면으로 **바로** 간다: `https://blog.naver.com/PostWriteForm.naver?blogId=<blog_id>` (Dr-Min fast 5b27409 실측). 블로그 첫 화면을 열고 '글쓰기' 링크를 찾아 누르는 단계를 거치지 않는다. 재열람용 새 탭도 같은 주소로 연 뒤 임시저장 목록을 연다. 주소가 바뀌어 열리지 않을 때만 블로그 화면의 글쓰기 링크로 들어간다.
3. 로그인 화면이면 비밀번호를 채팅으로 받지 않는다. 내장 브라우저의 `browserAuth` 보안 입력이 있으면 그것을 쓰고, 아니면 사용자가 내장 브라우저 창에서 직접 로그인하도록 인계한다. 다른 브라우저 프로필의 로그인 파일을 복사하지 않는다. 로그인 실패/만료는 BLOCKED, 원고·이미지는 보존한다.
4. 기존 자동복구 안내('작성 중인 글이 있습니다')가 나오면 **취소**를 눌러 새 글로 시작한다. 취소는 삭제가 아니다 — 이전 글은 임시저장 목록에 남는다(Dr-Min 실측). 다른 글을 덮어쓰지 않는다. 불명확하면 내용을 확인하고 작업 중단 지점을 보고한다.
5. 이전 시도가 있으면 임시저장 목록을 먼저 확인한다. 새 글로 재시도하기 전에 reconcile이 필요하다.
6. 사진·썸네일·배너 업로드는 Browser 플러그인 확인 정책상 '사전 승인 가능' 항목이다. 전략 확정 응답과 함께 "이 원고의 사진 N장·썸네일·상담 배너를 네이버 블로그 임시저장 글에 업로드"하는 것에 대한 사용자 동의를 받아 approval 근거에 남긴다. 동의가 없으면 업로드 직전에 대상 파일과 목적지를 밝혀 묻는다.

## 본문·표·연락처

- 검증된 로컬 transfer.html을 한 번 붙여넣는다. 제목은 manifest.title을 별도 입력한다. 텍스트를 전송 중 새로 쓰지 않는다.
- **본문 붙여넣기는 딱 한 번이다. 사진·지도를 넣은 뒤 두 번째로 붙여넣지 않는다.** Dr-Min 실측(재현·이등분 확인): 컴포넌트 삽입 후 두 번째 붙여넣기를 하면 저장할 때 마지막 소제목 뒤 문단이 전부 굵게 바뀌고 전화 줄이 사라진다. 빠진 문장이 있으면 그 문단만 타이핑으로 고친다.
- 제공되는 tab.clipboard.write의 text/html(필요하면 text/plain 함께)과 지원되는 입력 API로 붙여넣는다. native clipboard나 navigator.clipboard를 직접 호출할 필요가 없다.
- 네이버는 본문 입력용 iframe을 사용한다. DOM에 보이는 제목/본문 문단을 클릭해 초점을 잡고 도구의 입력/붙여넣기 API를 사용한다. contenteditable을 추측해 fill하지 않는다.
- 붙여넣기는 비동기 처리된다. 직후 스냅샷이 빈 본문이라고 해서 즉시 재붙여넣지 않는다. 본문 텍스트와 표의 등장을 관측한 다음 결정한다.
- 표는 실제 편집기 table과 셀 값으로 확인한다. 단순한 파이프 문자 나열이면 통과시키지 않는다.
- 글자 크기도 확인한다: 본문 문단이 16(`se-fs16` 등), 소제목이 24 굵게로 남았는지, **소제목 바로 다음 문단이 소제목처럼 크게·굵게 바뀌지 않았는지** 본다. 크기가 사라졌으면 body=보완 필요로 기록하고 관측된 클래스명을 남긴다. 16/24가 통째로 무시되면 Dr-Min 실측에서 보존이 확인된 15/19로 바꿔 `FONT` 값을 조정할 것을 보고에 적는다.
- 표 모양도 확인한다: 셀 테두리(#d9dde2)와 첫 열 회색 배경(#f5f6f8)·굵은 글씨가 남았는지 본다. 테두리 없는 흰 표로 바뀌었으면(Dr-Min cb866fe 실측: 스타일 없는 표는 50:50 무테로 변환) table=보완 필요로 기록한다.
- 본문·소제목·표 안의 글·사진 설명·CTA·연락처를 모두 가운데 정렬한다. transfer.html의 정렬이 붙여넣기에서 유지됐는지 실제 편집기 문단 속성과 화면으로 확인한다. 유지되지 않으면 관측된 편집기 정렬 기능으로 적용한다. 제목도 편집기가 지원하면 가운데 정렬한다.
- 한 문장당 한 문단과 문장 사이 빈 줄 한 줄을 확인한다. CSS 여백만 있는 상태를 빈 줄로 판정하지 않는다. 자리 교체 후 간격이 사라지거나 중복되면 빈 문단을 조정한다.
- 전화 링크는 일반 a[href]뿐 아니라 편집기 DOM의 span.se-link[data-href]도 확인한다. 2026-10-09 실측: tel: 문자열은 이 data-href에 보관됐다. a 태그가 없다는 이유만으로 링크가 제거됐다고 판정하지 않는다.
- 링크가 없거나 다르면, 연락처 줄을 선택하고 텍스트 링크 버튼 → 'URL을 입력하세요.' → 정확한 tel:번호 → '링크 입력'으로 적용한다. apply 후 실제 DOM 속성을 다시 읽는다. 링크가 있는지 보기 위해 전화를 걸지 않는다.
- **텍스트 전화 링크는 붙여넣기 직후, 사진·지도·배너를 넣기 전에 끝낸다.** Dr-Min 실측: 텍스트 링크와 이미지 링크는 같은 레이어라서, 이미지에 한 번 쓰고 나면 선택한 글자 줄을 링크하지 않고 **삼켜서 지운다**. 그래서 순서는 항상 텍스트 전화 링크 → 사진·지도 → 배너 이미지 링크다.
- 텍스트 링크 버튼은 `data-name="text-link"`로 고른다. 이름(`/링크 입력/`)으로 찾으면 이미지 링크 버튼("링크 입력 열기")이 같이 잡힌다(Dr-Min 실측). 이미지 컴포넌트가 선택된 상태면 먼저 본문 글자를 클릭해 선택을 푼다.
- 줄 선택 후 속성 툴바가 뜰 때까지 약 0.9초, 적용 후 연결이 끝날 때까지 약 1.2초 기다린다. **적용과 확인 사이에 아무 키도 누르지 않는다**(End·Enter가 연결을 취소한다, 실측). 시도 중 줄이 사라졌으면 번호를 일반 글자로 다시 입력한다(번호가 보이는 것이 링크보다 우선).
- 숫자 문자열이 있어도 링크를 확인 못 하면 contact=unknown. 배너에 인쇄된 번호와 현재 프로필도 별도로 대조한다.

## 사진·지도 자리 교체

HTML의 @@IMG:n@@와 @@MAP:n@@가 manifest의 순서에 대응한다.

**빠른 경로 (기본): 사진 전부를 한 셀에서 교체한다.** 2026-10-10 실행에서 한 장씩 따로 호출해 확인한 동작(자리 문단 선택 → 지우기 → filechooser → setFiles → 팝업 닫기)을 반복문으로 묶은 것이다. 장마다 셀을 나누지 않는다.

```js
const manifest = JSON.parse(await (await import('node:fs/promises')).readFile('<run>/manifest.json', 'utf8'));
const editorFrame = blogTab.playwright.frameLocator('iframe[name="mainFrame"]');
const results = [];
for (let n = 1; n <= manifest.images.length; n++) {
  try {
    await editorFrame.getByText(`@@IMG:${n}@@`, {exact: true}).click();
    await blogTab.pressKey(null, 'Home'); await blogTab.pressKey(null, 'shift+End'); await blogTab.pressKey(null, 'BackSpace');
    const chooser = blogTab.playwright.waitForEvent('filechooser', {timeoutMs: 10000});
    await editorFrame.getByRole('button', {name: '사진 추가', exact: true}).click();
    await (await chooser).setFiles([manifest.images[n - 1].path]);
    await new Promise(r => setTimeout(r, 1200));
    await editorFrame.getByRole('button', {name: '팝업 닫기', exact: true}).click({timeoutMs: 1500}).catch(() => {});
    results.push({n, ok: true});
  } catch (e) { results.push({n, ok: false, error: String(e).slice(0, 160)}); }
}
const check = await editorFrame.getByRole('article').evaluate(el => ({markers: el.textContent.match(/@@(?:IMG|MAP):\d+@@/g), images: Array.from(el.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth > 0).length}));
nodeRepl.write(JSON.stringify({results, check}));
```

**이 셀을 돌리기 전에 텍스트 전화 링크를 먼저 끝낸다**(아래 '본문·표·연락처' 참고 — 이미지에 링크 레이어를 쓴 뒤에는 텍스트 링크가 줄을 지운다). 실패한 n만 아래 규칙으로 다시 넣는다. 지도와 배너 이미지 링크는 이 셀 다음에 한다.

- 자리 문단을 정확히 선택·제거한 위치에 컴포넌트를 넣는다. Home/Shift+End는 화면 줄 단위일 수 있으므로 삭제 후 마커가 완전히 사라졌는지 확인한다.
- 사진은 API의 filechooser 대기를 먼저 시작하고 '사진 추가'를 누른다. chooser.setFiles에 manifest의 절대 파일 경로를 전달한다. 여러 장 선택 UI가 나오면 의도한 개별 사진 배치를 선택한다.
- 이미지 컴포넌트가 나타나는 것뿐 아니라 업로드 완료·실제 로드·개수·순서·캡션을 확인한다. 사진 라이브러리의 삭제 버튼은 사용하지 않는다.
- 지도는 '장소 추가' → 검색어 입력 → 실제 검색 결과의 이름/주소 확인 → 해당 결과 선택 → '추가' → '확인'. 첫 결과나 가장 긴 검색 단어의 포함만으로 선택하지 않는다.
- 검색 결과가 없으면 한 번만 더 짧은 검색어(주소의 마지막 두 단어 등)로 다시 검색한다(2026-08-29 실측: 긴 검색어는 결과 0건이 잦다). 다시 찾은 결과도 이름/주소를 확인한다.
- 장소 패널은 성공·실패와 관계없이 닫혔는지 확인한다. 열린 패널이 남으면 다음 단계 클릭이 막힌다(실측). 닫기/취소 → Escape 순으로 최대 3번 시도한다.
- 일치하는 장소를 못 찾으면 임의 장소를 넣지 않는다. 원고에 실패 이유를 기록하고 map 검사를 실패/확인 불가로 남긴다.
- CTA 배너도 이미지 업로드 후 글자가 현재 프로필과 일치하는지 확인한다. **배너 이미지에도 등록 연락처의 `tel:` 링크를 건다**(Dr-Min 2f3b2a3: 모바일에서 배너를 탭하면 바로 전화). 이미지를 선택한 뒤 편집기의 링크 기능으로 정확한 `tel:번호`를 넣고, 적용 후 실제 DOM 속성을 다시 읽는다. 편집기가 이미지 링크를 막으면 banner_link=unsupported로 기록한다. 텍스트 전화 링크는 항상 별도로 남긴다.
- 업로드 실패 시 동일 컴포넌트 상태부터 확인한다. 본문을 통째로 다시 붙여넣거나 다른 전송기로 전환하지 않는다.
- 저장 전에 본문에 `@@IMG:n@@`·`@@MAP:n@@` 자리 문단이 하나라도 남았는지 다시 찾는다(2026-08-29 실측: 교체 실패한 마커가 그대로 저장된 사례). 남았으면 해당 컴포넌트를 다시 넣거나, 넣을 수 없으면 그 줄을 지우고 보고에 남긴다.

## 삭제 금지 (실사고)

- **블로그 화면의 어떤 '삭제' 버튼도 누르지 않는다.** 임시저장 목록의 '전체 삭제'는 '선택 삭제'보다 앞에 놓여 있어 패턴 매칭 클릭 한 번이 임시저장 글 전부를 지운다(실사고, 휴지통 없음). 임시저장 정리는 사람이 한다.
- 브라우저 확인창(confirm)은 자동 수락하지 않는다. 허용되는 응답은 취소뿐이다.

## 저장·재열람

**빠른 경로 (기본): 저장 셀 1개 → 중간 보고 → 검증 셀 1개 → `workflow.mjs verify`.** 비교는 코드가 한다. Codex가 재열람 화면을 여러 번 읽으며 눈으로 대조하지 않는다(v0.6.3 실행에서 이 왕복에 약 1분 10초). 검사 범위는 줄이지 않는다 — 제목, 모든 문장, 자리 표시 잔존, 굵게·크기 번짐, 사진 수·로드, 표 셀·테두리, 지도, 전화 줄·tel 링크·배너 링크.

저장 전에 남은 `@@IMG/MAP@@`와 열린 패널이 없는지 확인한다(위 '사진·지도 자리 교체'). 저장 버튼만 사용한다(현재 명칭 '저장'). '자동저장' 표시만으로 저장됐다고 단정하지 않는다.

**셀 A — 저장 + 저장 신호(임시저장 개수 전후)**

```js
// editorTab: 글을 입력한 작업 탭
const scopeOf = async (tab) => (await tab.playwright.locator('iframe[name="mainFrame"]').count()) ? tab.playwright.frameLocator('iframe[name="mainFrame"]') : tab.playwright;
const editor = await scopeOf(editorTab);
const draftCount = async (scope) => {
  const label = await scope.getByRole('button', {name: /임시저장된 글 보기/}).first().evaluate(el => el.getAttribute('aria-label') || el.innerText).catch(() => '');
  const m = String(label).match(/(\d+)\s*개/) || String(label).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};
const before = await draftCount(editor);
await editor.getByRole('button', {name: '저장', exact: true}).click();
await new Promise(r => setTimeout(r, 2500));
const after = await draftCount(editor);
var saveSignal = {before, after, saved: before !== null && after !== null && after > before};
nodeRepl.write(JSON.stringify(saveSignal));
```

**중간 보고 (셀 A 직후, 바로 보낸다):** `saved:true`면 사용자에게 한 번 알린다 — "임시저장했어요(목록 {before}→{after}개). 지금 저장된 글을 다시 열어 검증하고 있어요. 원고는 먼저 확인하셔도 돼요." 이 시점에는 **'완료'·'SAVED'라고 말하지 않는다.** `saved:false`면 중간 보고 없이 열린 패널·확인창부터 확인하고 한 번 다시 저장한다.

**셀 B — 새 탭에서 같은 글 다시 열기 + 관측 파일 직접 쓰기**

```js
const run = "<run 폴더 절대경로>", blogId = "<blog_id>";
const fsp = await import('node:fs/promises');
const manifest = JSON.parse(await fsp.readFile(`${run}/manifest.json`, 'utf8'));
var verifyTab = await cua.createBrowserTab('iab', `https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {visible: false});
await new Promise(r => setTimeout(r, 2500));
const vs = (await verifyTab.playwright.locator('iframe[name="mainFrame"]').count()) ? verifyTab.playwright.frameLocator('iframe[name="mainFrame"]') : verifyTab.playwright;
await vs.getByRole('button', {name: '취소', exact: true}).click({timeoutMs: 1500}).catch(() => {}); // 자동복구 안내: 취소(삭제 아님)
await vs.getByRole('button', {name: /임시저장된 글 보기/}).first().click();
await new Promise(r => setTimeout(r, 1200));
const titleRe = new RegExp(manifest.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const entry = vs.getByRole('button', {name: titleRe}).first();
const entryLabel = await entry.evaluate(el => el.getAttribute('aria-label') || el.innerText).catch(() => '');
const savedAt = (String(entryLabel).match(/\d{4}\.\d{2}\.\d{2}\s*\d{1,2}:\d{2}/) || [''])[0];
await entry.click();
await new Promise(r => setTimeout(r, 3000));
const obs = await vs.locator('body').evaluate((body) => {
  const txt = n => (n?.textContent || '').replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const titleEl = body.querySelector('.se-documentTitle, [class*="documentTitle"], .se-title-text');
  const inTitle = n => titleEl && titleEl.contains(n);
  const paraEls = [...body.querySelectorAll('.se-text-paragraph')].filter(p => !inTitle(p));
  const paragraphs = (paraEls.length ? paraEls : [...body.querySelectorAll('p')]).map(p => {
    const s = p.querySelector('span') || p; const cs = getComputedStyle(s);
    return {text: txt(p), bold: Number(cs.fontWeight) >= 700, size: parseFloat(cs.fontSize)};
  }).filter(p => p.text);
  const images = [...body.querySelectorAll('img')].filter(i => /blogfiles|postfiles/.test(i.currentSrc || i.src)).map(i => ({loaded: i.complete && i.naturalWidth > 0}));
  const tables = [...body.querySelectorAll('table')].map(t => {
    const c = t.rows[0]?.cells[0]; const cs = c ? getComputedStyle(c) : null;
    return {rows: [...t.rows].map(r => [...r.cells].map(txt)), bordered: cs ? (cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) : null};
  });
  const maps = [...body.querySelectorAll('[class*="placesMap"], [class*="se-map"]')].map(m => ({name: txt(m).slice(0, 80)})).filter(m => m.name);
  const links = [...body.querySelectorAll('a[href], [data-href]')].map(a => ({href: a.getAttribute('data-href') || a.getAttribute('href')}));
  const imageLinks = [...body.querySelectorAll('[class*="image"] [data-href], [class*="image"] a[href]')].map(a => a.getAttribute('data-href') || a.getAttribute('href'));
  return {title: titleEl ? txt(titleEl) : null, paragraphs, body_text: txt(body).slice(0, 20000), images, tables, maps, links, image_links: imageLinks.length ? imageLinks : null};
});
const observation = {
  ...obs, saved: saveSignal.saved,
  save_signal: `임시저장 목록 ${saveSignal.before}→${saveSignal.after}개, 목록에 ${savedAt} 저장 글`,
  saved_identity: `${blogId} / ${manifest.title} / ${savedAt}`,
  reopened_identity: `${blogId} / ${obs.title ?? manifest.title} / ${savedAt}`,
  note: '저장 후 새 탭(글쓰기 직행)에서 임시저장 목록의 같은 제목·시각 글을 열어 관측'
};
await fsp.writeFile(`${run}/reopened-observation.json`, JSON.stringify(observation, null, 2));
nodeRepl.write(JSON.stringify({savedAt, title: obs.title, paragraphs: obs.paragraphs.length, images: obs.images.length, tables: obs.tables.length}));
```

그다음 `node scripts/workflow.mjs verify --run <run> --file <run>/reopened-observation.json`. 코드가 manifest와 비교해 checks를 만들고 record까지 한다. 출력의 `failed`·`unknown`만 보면 된다.

**최종 보고:** "검증이 끝났어요." + 저장 상태·완성도 + 실패/unknown 항목. `unknown`은 화면에서 해당 요소를 찾지 못했다는 뜻이다 — 통과로 바꾸지 않는다. 필요하면 그 항목만 화면을 직접 보고 확인한 뒤 `record`로 보완한다.

규칙 (빠른 경로에도 그대로 적용):
1. 같은 제목이 여러 개면 시각으로 구분하고, 모호하면 저장 확인 불가로 보고한다.
2. **현재 편집 중인 문서를 보는 것은 재열람 검수가 아니다.** 반드시 새 탭에서 임시저장 목록을 통해 연다. 새 탭에서 빈 글을 입력하거나 저장하지 않는다.
3. 지도 썸네일을 매물 사진 수에 합산하지 않는다(관측 이미지는 blogfiles/postfiles 업로드 이미지로만 센다).
4. 검수된 탭을 결과로 남긴다. 공개 발행하지 않는다.

실제 브라우저를 강제 로그아웃하거나 네트워크 차단해 실패를 만들지 않는다. 장애 대응은 상태 전이 테스트로 검증하고, 실제 장애가 발생하면 관측된 지점부터 기록한다. 내장 브라우저 접근 자체가 불가능해도 로컬 준비 결과는 전달한다.
