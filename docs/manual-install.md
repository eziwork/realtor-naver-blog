# 직접 설치와 업데이트

[첫 화면으로 돌아가기](../README.md)

처음 사용하는 분에게는 README의 **Codex에 설치 요청하기**를 권장합니다. 이 문서는 터미널 명령에 익숙한 분을 위한 방법입니다.

## 필요한 환경

- Node.js 20 이상과 npm
- Git
- 로컬 스킬·파일 작업·내장 브라우저를 사용할 수 있는 Codex
- 썸네일·배너를 제작할 이미지 기능

```bash
node --version
npm --version
git --version
```

아래 수동 설치 예시는 공식 문서의 사용자 스킬 경로 `~/.agents/skills`를 사용합니다. 기존 환경의 설치 도구가 다른 경로를 관리한다면 그 위치를 따르고 같은 스킬을 여러 곳에 중복 설치하지 마세요. [OpenAI 스킬 경로 안내](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)

## 저장소 받기

작업물을 보관할 폴더에서 실행합니다.

```bash
git clone https://github.com/eziwork/realtor-naver-blog.git
cd realtor-naver-blog
```

저장소 루트 안에 `realtor-naver-blog/SKILL.md`가 있어야 합니다. 저장소 루트 전체가 아닌 **안쪽 `realtor-naver-blog` 폴더**를 스킬로 설치합니다.

## macOS / Linux

아래 명령은 새 설치용입니다. 같은 이름의 설치가 있으면 먼저 위치를 확인하세요.

```bash
mkdir -p ~/.agents/skills
ln -s "$(pwd)/realtor-naver-blog" ~/.agents/skills/realtor-naver-blog
cd realtor-naver-blog
npm ci
```

## Windows PowerShell

저장소 루트에서 실행합니다. 같은 이름의 스킬 경로가 있으면 중단하도록 되어 있습니다.

```powershell
$skillTarget = Join-Path $env:USERPROFILE '.agents\skills\realtor-naver-blog'
$skillSource = (Resolve-Path '.\realtor-naver-blog').Path
if (Test-Path -LiteralPath $skillTarget) {
  throw '이미 설치된 경로가 있습니다. 기존 설치를 확인한 뒤 업데이트하세요.'
}
New-Item -ItemType Directory -Force -Path (Split-Path $skillTarget) | Out-Null
New-Item -ItemType Junction -Path $skillTarget -Target $skillSource
Set-Location '.\realtor-naver-blog'
npm ci
```

`npm ci`는 lockfile에 고정된 매물 수집용 Playwright와 Chromium을 설치합니다. 내장 브라우저의 네이버 로그인과는 별개입니다. 코드의 상태 관리·원고 검증은 Node 내장 모듈만 사용합니다.

## 설치 확인

Codex의 새 대화에서 `$realtor-naver-blog`를 입력합니다. 나타나지 않으면 Codex를 다시 시작하고 설치 경로를 확인하세요. 스킬을 선택한 뒤 [첫 글 안내](first-post.md)를 따라갑니다.

## 업데이트

위 방법처럼 저장소 폴더를 연결했다면 저장소 루트에서 다음 명령을 실행합니다.

```bash
git pull --ff-only
cd realtor-naver-blog
npm ci
```

로컬에서 코드를 수정해 `git pull`이 중단되면 변경을 보존한 채 Codex에 해결을 요청하세요. 강제 덮어쓰기 명령은 사용하지 않습니다.

설치 도구로 파일을 복사한 경우에는 Git 저장소 갱신만으로 설치본이 바뀌지 않습니다. Codex에 저장소 URL과 함께 기존 설치 업데이트를 요청하세요.

## 이전 이름의 스킬을 사용하고 있다면

새 배포 이름은 `realtor-naver-blog`, 호출명은 `$realtor-naver-blog`입니다. 이전 이름은 `naver-realtor-blog-pro`입니다.

사무소 프로필과 저장 문체의 기본 경로는 호환성을 위해 `~/.codex/naver-realtor-blog/`를 유지합니다. 스킬 이름을 바꾸려고 프로필 폴더를 지우거나 새로 만들 필요가 없습니다.

Codex에 이렇게 요청하세요.

```text
기존 naver-realtor-blog-pro를 사용하고 있어.
https://github.com/eziwork/realtor-naver-blog 의 새 스킬로 옮겨줘.
사무소 프로필, 블로그 문체와 진행 중인 매물 파일을 보존하고,
기존 스킬의 개인 수정 사항이 있으면 먼저 확인해줘.
새 설치가 확인되면 앞으로 사용할 호출명을 알려줘.
```

새 이름 설치와 기존 이름 설치를 모두 유지하는 경우, 사용할 스킬을 `$realtor-naver-blog`로 명확하게 지정하세요. 이전 저장소의 작업 이력은 새 저장소에 자동으로 합쳐지지 않습니다.

## 유지보수용 검사

저장소 루트에서 실행합니다. 이 검사는 네이버에 로그인하거나 글을 저장하지 않습니다.

```bash
npm test
node realtor-naver-blog/scripts/check-core.mjs
```

실제 매물 정보의 의미와 이미지, 네이버에 저장된 글은 개별 작업에서 검수합니다. 이전 Playwright 전송기인 `scripts/post-draft.mjs`, `scripts/login-setup.mjs`는 호환 자료이며, 현재 스킬의 기본 입력 방식은 Codex 내장 브라우저입니다.
