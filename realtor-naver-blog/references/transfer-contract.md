# 내장 브라우저 전송·재열람 계약

기본 전송은 Codex가 제공받은 내장 브라우저 API로 한다. 매번 현재 도구 문서를 확인한다. 아래 명칭은 2026-10-09 실측이며 UI가 달라지면 현재 DOM/접근성 트리에서 다시 찾는다. 숨은 앱 상태·페이지 내부 API·직접 DOM 변경으로 편집기를 우회하지 않는다.

## 입력 전

1. workflow.mjs begin을 통과하고 대상 blog_id와 resume_draft_identity를 확인한다.
2. 내장 브라우저의 작업 탭에서 대상 블로그를 열고 관측된 글쓰기 링크로 진입한다.
3. 로그인 화면이면 비밀번호를 채팅으로 받지 않는다. 내장 브라우저의 `browserAuth` 보안 입력이 있으면 그것을 쓰고, 아니면 사용자가 내장 브라우저 창에서 직접 로그인하도록 인계한다. 다른 브라우저 프로필의 로그인 파일을 복사하지 않는다. 로그인 실패/만료는 BLOCKED, 원고·이미지는 보존한다.
6. 사진·썸네일·배너 업로드는 Browser 플러그인 확인 정책상 '사전 승인 가능' 항목이다. 전략 확정 응답과 함께 "이 원고의 사진 N장·썸네일·상담 배너를 네이버 블로그 임시저장 글에 업로드"하는 것에 대한 사용자 동의를 받아 approval 근거에 남긴다. 동의가 없으면 업로드 직전에 대상 파일과 목적지를 밝혀 묻는다.
4. 기존 자동복구 안내가 있으면 다른 사용 글을 덮어쓰지 않는다. 불명확하면 내용을 확인하고 작업 중단 지점을 보고한다.
5. 이전 시도가 있으면 임시저장 목록을 먼저 확인한다. 새 글로 재시도하기 전에 reconcile이 필요하다.

## 본문·표·연락처

- 검증된 로컬 transfer.html을 한 번 붙여넣는다. 제목은 manifest.title을 별도 입력한다. 텍스트를 전송 중 새로 쓰지 않는다.
- 제공되는 tab.clipboard.write의 text/html(필요하면 text/plain 함께)과 지원되는 입력 API로 붙여넣는다. native clipboard나 navigator.clipboard를 직접 호출할 필요가 없다.
- 네이버는 본문 입력용 iframe을 사용한다. DOM에 보이는 제목/본문 문단을 클릭해 초점을 잡고 도구의 입력/붙여넣기 API를 사용한다. contenteditable을 추측해 fill하지 않는다.
- 붙여넣기는 비동기 처리된다. 직후 스냅샷이 빈 본문이라고 해서 즉시 재붙여넣지 않는다. 본문 텍스트와 표의 등장을 관측한 다음 결정한다.
- 표는 실제 편집기 table과 셀 값으로 확인한다. 단순한 파이프 문자 나열이면 통과시키지 않는다.
- 본문·소제목·표 안의 글·사진 설명·CTA·연락처를 모두 가운데 정렬한다. transfer.html의 정렬이 붙여넣기에서 유지됐는지 실제 편집기 문단 속성과 화면으로 확인한다. 유지되지 않으면 관측된 편집기 정렬 기능으로 적용한다. 제목도 편집기가 지원하면 가운데 정렬한다.
- 한 문장당 한 문단과 문장 사이 빈 줄 한 줄을 확인한다. CSS 여백만 있는 상태를 빈 줄로 판정하지 않는다. 자리 교체 후 간격이 사라지거나 중복되면 빈 문단을 조정한다.
- 전화 링크는 일반 a[href]뿐 아니라 편집기 DOM의 span.se-link[data-href]도 확인한다. 2026-10-09 실측: tel: 문자열은 이 data-href에 보관됐다. a 태그가 없다는 이유만으로 링크가 제거됐다고 판정하지 않는다.
- 링크가 없거나 다르면, 연락처 줄을 선택하고 '링크 입력 열기' → 'URL을 입력하세요.' → 정확한 tel:번호 → '링크 입력'으로 적용한다. apply 후 실제 DOM 속성을 다시 읽는다. 링크가 있는지 보기 위해 전화를 걸지 않는다.
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

실패한 n만 아래 규칙으로 다시 넣는다. 지도·배너 링크·전화 링크는 이 셀 다음에 한다.

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

1. title/모든 문단/이미지/표/지도/연락처/남은 마커를 로컬 원고와 비교한다. 누락된 부분을 원고에서 수정하면 prepare부터 다시 검증한다.
2. 저장 버튼만 사용한다. 현재 명칭은 '저장'이다. 저장 전후 목록 개수·저장 시각·토스트를 기록한다. '자동저장' 표시만으로 임시저장 목록에 들어갔다고 단정하지 않는다.
3. 임시저장 목록에서 이번 글을 유일하게 식별한다. 같은 제목이 여러 개면 시각/가시적 ID로 구분하고 모호하면 저장 확인 불가로 보고한다.
4. **현재 편집 중인 문서를 클릭하는 것은 재열람 검수가 아니다.** 새 작업 탭의 글쓰기 → 임시저장 목록 → 식별한 같은 글을 열어 확인한다. 새 탭에서 빈 글을 입력하거나 저장하지 않는다.
5. 원고 제목·본문 모든 문단·표 각 셀·사진 로드/순서·지도 이름/주소·연락처 텍스트/링크를 비교한다. 가운데 정렬과 문장 사이 빈 줄 한 줄도 재검수하고 body 검사 근거에 기록한다. 지도 썸네일을 매물 사진 수에 합산하지 않는다.
6. 관측과 스크린샷을 남기고 workflow.mjs record 실행. 검수된 탭을 결과로 남긴다. 공개 발행하지 않는다.

실제 브라우저를 강제 로그아웃하거나 네트워크 차단해 실패를 만들지 않는다. 장애 대응은 상태 전이 테스트로 검증하고, 실제 장애가 발생하면 관측된 지점부터 기록한다. 내장 브라우저 접근 자체가 불가능해도 로컬 준비 결과는 전달한다.
