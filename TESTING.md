# 실제 테스트 순서 (Codex 앱)

코드 테스트(`npm test`)로는 내장 브라우저 동작을 확인할 수 없습니다. 아래 순서로 Codex 앱에서 직접 확인하세요. 단계마다 결과를 기록해 두면 어디서 막혔는지 바로 알 수 있습니다.

## 0. 설치

```bash
cp -R realtor-naver-blog ~/.codex/skills/   # 저장소 루트에서
```

Codex 앱 재시작 → 새 대화에서 `$realtor-naver-blog`가 보이는지 확인.

## 1. 사진 업로드 기능만 (로그인 불필요, 2분)

```text
@Browser 내장 브라우저로 아래 로컬 파일을 열어줘.
file://<저장소 절대경로>/tools/upload-test.html

파일 업로드를 허락할게. tab.playwright의 waitForEvent("filechooser") → chooser.setFiles 방식으로
<테스트 사진 폴더>의 사진 두 장(절대경로)을 올려줘.
화면에 "UPLOAD_OK"로 시작하는 문장이 나오면 그 문장을 그대로 알려줘. 실패하면 오류 메시지를 그대로 알려줘.
```

기록: `UPLOAD_OK 2장` 나왔나 / 확인 창이 떴나

## 2. 매물번호 수집만 (5분) — **사진이 여러 장인 매물로**

```text
$realtor-naver-blog
매물번호 [네이버 매물번호]로 수집 단계까지만 해줘.
references/browser-collect.md 절차대로 하고, import-listing.mjs import 결과 JSON을 그대로 보여줘.
전략·원고·네이버 입력은 하지 마.
```

기록: `method`가 `page_fetch`인가 `dom`인가 / `api_attempt`의 `ok`·`error` / `photos.expected`·`ui_count`·`downloaded` 숫자 / `complete`와 `incomplete_reasons` / 사진이 원본 크기인가(파일 크기, 썸네일은 30KB 안팎)

v0.4에서는 이 단계가 썸네일 1장으로 통과됐습니다. v0.5에서 `complete:false`가 나오면 정상적으로 멈춘 것입니다.

## 3. 전체 흐름 (15~20분)

README의 시작 문장으로 실행 → 전략 확정 → 네이버 로그인(내장 브라우저 창에서 직접) → 임시저장 → 재열람.

기록:
- **전체 소요 시간**(v0.4 기준 8분, 사진 1장) — 사진 장수와 함께 적기
- 사용자에게 물어본 횟수(목표 2번: 사실 확인, 전략 확정+업로드 동의)
- 사진 N장 업로드 성공 수와 순서
- 표·전화 링크·지도 결과
- 저장 상태(SAVED/BLOCKED/UNVERIFIED/FAILED)와 완성도
- 전체 소요 시간, 내가 응답한 횟수
- 작업 폴더가 `~/.codex/naver-realtor-blog/runs/` 아래에 생겼는지
- 전략과 함께 **사실 사용/제외 표**가 나왔는지, 빠진 사실이 있었는지
- 사진을 전부 실었는지(제외했다면 이유)
- 상담 배너 이미지에 전화 링크가 걸렸는지

## 4. 로그인 유지

새 대화에서 `@Browser blog.naver.com 열어서 로그인 상태인지만 알려줘` → 로그인 유지 여부 기록.

## 금지 확인

테스트 중 어떤 단계에서도 발행·삭제 버튼을 누르지 않았는지, 기존 임시저장 글이 그대로인지 마지막에 확인하세요.
