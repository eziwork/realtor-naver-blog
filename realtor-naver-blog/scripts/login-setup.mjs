#!/usr/bin/env node
// 최초 1회 로그인 설정. 전송 전용 지속 프로필로 브라우저 창을 열고,
// 사람이 직접 네이버에 로그인할 때까지 기다린다.
//
//   node scripts/login-setup.mjs
//
// 아이디·비밀번호·쿠키를 이 스크립트가 받거나 저장하지 않는다.
// 로그인 세션은 브라우저 프로필 폴더에만 남는다 (코중사 방식과 반대).
// 로그인 시 `로그인 상태 유지`와, 제안이 뜨면 `이 브라우저에서 2단계 인증 생략`을
// 사람이 직접 체크하면 약 2주간 재로그인이 필요 없다.

import os from "node:os";
import path from "node:path";
import {loadPlaywright} from "./lib/deps.mjs";
const {chromium} = await loadPlaywright();
import {hasNaverLoginCookie, verifyLoginPersistence} from "./login-persistence.mjs";

const PROFILE = path.join(os.homedir(), ".codex", "naver-realtor-blog", "browser-profile");
const TIMEOUT_MS = 5 * 60 * 1000;
const LAUNCH_OPTIONS = {
  headless: false,
  viewport: {width: 1280, height: 900},
  args: ["--disable-blink-features=AutomationControlled"]
};

const ctx = await chromium.launchPersistentContext(PROFILE, LAUNCH_OPTIONS);
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("https://nid.naver.com/nidlogin.login", {waitUntil: "domcontentloaded"});

process.stderr.write("브라우저 창에서 네이버에 로그인해 주세요 (로그인 상태 유지 체크 권장). 최대 5분 대기...\n");

const started = Date.now();
let initialLoginDetected = false;
while (Date.now() - started < TIMEOUT_MS) {
  const cookies = await ctx.cookies("https://naver.com");
  if (hasNaverLoginCookie(cookies)) { initialLoginDetected = true; break; }
  await page.waitForTimeout(2000);
}

let persistenceVerified = false;
if (initialLoginDetected) {
  process.stderr.write("로그인 유지 여부를 확인하기 위해 브라우저를 한 번 다시 엽니다.\n");
  persistenceVerified = await verifyLoginPersistence({
    activeContext: ctx,
    launchPersistentContext: (profile, options) => chromium.launchPersistentContext(profile, options),
    profile: PROFILE,
    launchOptions: LAUNCH_OPTIONS
  });
} else {
  await ctx.close();
}

const status = persistenceVerified
  ? "LOGGED_IN"
  : initialLoginDetected ? "SESSION_NOT_PERSISTED" : "TIMEOUT";

process.stdout.write(JSON.stringify({
  ok: persistenceVerified,
  profile: PROFILE,
  status,
  persistence_verified: persistenceVerified,
  hint: persistenceVerified
    ? "브라우저 재시작 후에도 로그인이 확인됐습니다. 이제 post-draft.mjs가 재로그인 없이 동작합니다."
    : initialLoginDetected
      ? "로그인은 됐지만 브라우저를 닫자 세션이 사라졌습니다. 로그인 상태 유지를 체크한 뒤 다시 실행해 주세요."
      : "5분 안에 로그인이 확인되지 않았습니다. 다시 실행해 주세요."
}, null, 2) + "\n");
process.exit(persistenceVerified ? 0 : 1);
