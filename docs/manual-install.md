# 직접 설치하기

이 버전은 **설치할 부품이 없습니다.** Playwright·Chromium을 내려받지 않고, `npm install`도 필요 없습니다. 스킬 폴더를 Codex 스킬 위치에 두면 끝입니다.

## macOS

```bash
cp -R realtor-naver-blog ~/.codex/skills/realtor-naver-blog
```

복사 후 Codex 앱을 다시 시작하고 새 대화에서 `$realtor-naver-blog`를 입력합니다.

## 필요한 것

- Node.js 20 이상 (스크립트는 Node 내장 모듈만 사용)
- Codex 앱의 Browser 플러그인(내장 브라우저) 켜기

## 이전 버전에서 바꾸기

- `realtor-naver-blog` v0.3을 쓰던 경우: 같은 이름이라 위 복사로 교체됩니다. 교체 전 폴더 안에 `outputs/`(v0.3 작업 기록)가 있으면 먼저 다른 곳에 옮겨 두세요. 이 버전부터 작업 폴더는 `~/.codex/naver-realtor-blog/runs/`에 생깁니다.
- `naver-realtor-blog-pro`와는 이름이 달라 함께 둬도 충돌하지 않습니다.
- 사무소 프로필(`~/.codex/naver-realtor-blog/profile.yaml`)은 그대로 이어서 씁니다.

## 검증

저장소 루트에서:

```bash
npm test
node realtor-naver-blog/scripts/check-core.mjs
```
