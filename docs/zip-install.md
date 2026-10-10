# ZIP으로 설치하기 (GitHub 접속이 막힌 곳)

에듀윌 수업장처럼 GitHub 접속이 막힌 곳에서는 ZIP 파일로 설치합니다(2026-08-29 수업장 제보, Dr-Min `cb4d701`).

1. 강사에게 받은 `realtor-naver-blog.zip`을 내려받습니다.
2. Codex 새 대화에 아래 문장을 보냅니다.

```text
내려받기 폴더의 realtor-naver-blog.zip 압축을 풀고,
안에 있는 realtor-naver-blog 폴더를 ~/.codex/skills/ 에 스킬로 설치해줘.
기존 사무소 프로필(~/.codex/naver-realtor-blog/profile.yaml)은 그대로 둬.
설치가 끝나면 내가 다음에 입력할 문장을 알려줘.
```

3. Codex를 다시 시작하고 `$realtor-naver-blog`가 보이는지 확인합니다.

이 버전은 Playwright·Chromium을 쓰지 않아 **추가로 내려받을 것이 없습니다.** 압축을 풀어 복사하면 설치가 끝납니다.

## ZIP 만들기 (배포하는 사람)

저장소 루트에서:

```bash
npm run zip
```

`dist/realtor-naver-blog.zip`이 생깁니다. 스킬 폴더만 들어 있고 테스트·작업 기록은 들어가지 않습니다.
