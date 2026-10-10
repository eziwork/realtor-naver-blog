# 직접 설치하기

이 버전은 **설치할 부품이 없습니다.** Playwright·Chromium을 내려받지 않고, `npm install`도 필요 없습니다. 스킬 폴더를 Codex 스킬 위치에 두면 끝입니다.

## macOS

```bash
cp -R realtor-naver-blog-browser ~/.codex/skills/realtor-naver-blog-browser
```

복사 후 Codex 앱을 다시 시작하고 새 대화에서 `$realtor-naver-blog-browser`를 입력합니다.

## 필요한 것

- Node.js 20 이상 (스크립트는 Node 내장 모듈만 사용)
- Codex 앱의 Browser 플러그인(내장 브라우저) 켜기

## 기존 스킬과 함께 쓰기

`realtor-naver-blog`(v0.3), `naver-realtor-blog-pro`와 이름이 달라서 함께 설치해도 충돌하지 않습니다. 사무소 프로필(`~/.codex/naver-realtor-blog/profile.yaml`)은 같은 파일을 함께 씁니다. 작업 폴더는 `~/.codex/naver-realtor-blog/runs/`에 생겨서 스킬을 다시 설치해도 지워지지 않습니다.

## 검증

저장소 루트에서:

```bash
npm test
node realtor-naver-blog-browser/scripts/check-core.mjs
```
