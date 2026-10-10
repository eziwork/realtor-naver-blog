# Realtor Naver Blog — 내장 브라우저 전용판 (v0.5)

**매물 정보를 건네면, 내 말투에 맞는 네이버 블로그 글을 임시저장까지. 브라우저는 Codex 내장 브라우저 하나만 씁니다.**

[eziwork/realtor-naver-blog](https://github.com/eziwork/realtor-naver-blog) v0.3(`6ebe0b3`)을 바탕으로, 수집부터 저장까지 Codex 내장 브라우저만 쓰도록 바꾼 실험 버전입니다. 원본 v0.3은 그대로 두고 별도 스킬(`$realtor-naver-blog-browser`)로 설치합니다.

- 바뀐 점: [CHANGES.md](CHANGES.md)
- 실제 테스트 방법: [TESTING.md](TESTING.md)
- 설치: [docs/manual-install.md](docs/manual-install.md) · ZIP: [docs/zip-install.md](docs/zip-install.md)
- 입력 예시 3종(번호·링크·말+사진): [docs/first-post.md](docs/first-post.md)

## 한눈에 보기

| | v0.3 원본 | 이 버전 |
|---|---|---|
| 매물번호 수집 | Playwright가 Chromium 창을 띄움 | **내장 브라우저**로 상세 페이지·API·갤러리 수집 |
| 사진 수집 | 화면에서 읽는 방식(1장만 받힐 수 있음) | **galleryImages 목록 기준 전체 수집 + 개수 대조 + 중복 제거** |
| 매물 링크 입력 | 번호만 | **상세 링크도 가능**, 지도 링크면 안내 |
| 네이버 입력·사진 업로드 | 내장 브라우저 | 내장 브라우저(동일) + 업로드 사전 승인 절차 명시 |
| 설치 | `npm ci` + Chromium 약 150MB | **폴더 복사만** |
| 작업 폴더 | 현재 폴더 `outputs/`(스킬 폴더 안이면 재설치 때 삭제) | `~/.codex/naver-realtor-blog/runs/` |
| 삭제 버튼 | "기존 글 삭제 안 함" 한 줄 | **'전체 삭제' 실사고 근거와 함께 금지, 확인창은 취소만** |
| `공장·창고`, `23억` 표기 | 오류 | 지원 |
| 수집이 불완전할 때 | 그대로 진행(썸네일 1장으로 글 작성 사례) | **사진 장수 대조·썸네일 감지 후 멈추고 재수집 또는 사용자 확인** |
| 사진 선택 | 비슷한 사진을 골라 뺌 | **기본 전부 싣기**(중복·흔들림·무관만 제외) |
| 사실이 빠질 때 | 이유 기록 없음 | **사실 사용/제외 표**를 전략과 함께 보여줌 |
| 상담 배너 | 매번 생성 | 같은 사무소 정보면 재사용, 배너에도 전화 링크 |
| 배포 | GitHub | GitHub + **ZIP**([docs/zip-install.md](docs/zip-install.md)) |

## 시작하기

1. 설치: `realtor-naver-blog-browser` 폴더를 `~/.codex/skills/`에 복사하고 Codex 앱을 다시 시작합니다.
2. Codex 앱에서 Browser 플러그인(내장 브라우저)이 켜져 있는지 확인합니다.
3. 새 대화에서:

```text
$realtor-naver-blog-browser

매물번호: [네이버 매물번호 또는 상세 링크]
내 블로그: https://blog.naver.com/[내 블로그 ID]
사무소명: [사무소명]
상담 연락처: [공개 전화번호]

부족한 정보는 글을 쓰기 전에 질문해 주세요.
추천 전략을 먼저 보여주고, 제가 확정하면 글을 작성해
사진·썸네일·상담 배너를 업로드해 임시저장한 뒤 같은 글을 다시 열어 검수해 주세요.
```

마지막 문장의 "업로드해"는 내장 브라우저의 확인 정책상 파일 업로드에 필요한 사전 동의입니다. 빠지면 업로드 직전에 한 번 더 묻습니다.

## 작업 원칙 (v0.3과 동일)

- 쓰기 전에 필요한 정보를 묻고, 답이 없는 항목은 글에서 뺍니다.
- 추천 전략을 확정한 뒤에만 원고·이미지·네이버 입력을 시작합니다.
- 저장 후 같은 임시저장 글을 다시 열어 원고와 대조합니다.
- 공개 발행은 하지 않습니다. 임시저장까지만 합니다.

## 검증

저장소 루트에서 `npm test`(50개)와 `node realtor-naver-blog-browser/scripts/check-core.mjs`를 실행합니다. 내장 브라우저 동작(수집·업로드·저장)은 코드 테스트로 확인할 수 없어 [TESTING.md](TESTING.md)대로 Codex 앱에서 직접 확인해야 합니다.

## 출처

[Dr-Min/naver-realtor-blog-pro](https://github.com/Dr-Min/naver-realtor-blog-pro)의 수집·전송 실측 교훈과 [eziwork/realtor-naver-blog](https://github.com/eziwork/realtor-naver-blog) v0.3의 전략 확정·문체·재열람 흐름을 합쳤습니다. OpenAI나 네이버의 공식 제품은 아닙니다.
