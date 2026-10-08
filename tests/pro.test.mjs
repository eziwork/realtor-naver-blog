import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";

const root = process.cwd();
const skillRoot = path.join(root, "realtor-naver-blog");

test("required bundle files exist", () => {
  for (const rel of [
    "SKILL.md", "agents/openai.yaml",
    "references/input-listing.md", "references/content-format.md",
    "references/transfer-contract.md", "config/selectors.yaml",
    "scripts/profile.mjs", "scripts/init-run.mjs", "scripts/fetch-listing.mjs",
    "scripts/validate-draft.mjs", "scripts/login-setup.mjs",
    "scripts/login-persistence.mjs",
    "scripts/post-draft.mjs", "scripts/check-core.mjs"
  ]) assert.ok(fs.existsSync(path.join(skillRoot, rel)), rel);
});

test("skill keeps a valid technical name and exposes Korean UI metadata", () => {
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^name: realtor-naver-blog$/m);

  const ui = fs.readFileSync(path.join(skillRoot, "agents/openai.yaml"), "utf8");
  assert.match(ui, /display_name: "네이버 매물블로그"/);
  assert.match(ui, /short_description: ".{25,64}"/u);
  assert.match(ui, /brand_color: "#03C75A"/);
  assert.match(ui, /default_prompt: ".*\$realtor-naver-blog.*"/);
});

test("login success requires the cookie to survive a browser restart", async () => {
  const moduleUrl = pathToFileURL(path.join(
    skillRoot, "scripts/login-persistence.mjs"
  )).href;
  const {verifyLoginPersistence} = await import(moduleUrl);

  let activeClosed = false;
  let verifyClosed = false;
  const persisted = await verifyLoginPersistence({
    activeContext: {close: async () => { activeClosed = true; }},
    launchPersistentContext: async () => {
      assert.equal(activeClosed, true, "verification must happen after closing the login browser");
      return {
        cookies: async () => [{name: "NID_AUT"}],
        close: async () => { verifyClosed = true; }
      };
    },
    profile: "test-profile",
    launchOptions: {},
    settleMs: 0
  });
  assert.equal(persisted, true);
  assert.equal(verifyClosed, true);

  const dropped = await verifyLoginPersistence({
    activeContext: {close: async () => {}},
    launchPersistentContext: async () => ({
      cookies: async () => [],
      close: async () => {}
    }),
    profile: "test-profile",
    launchOptions: {},
    settleMs: 0
  });
  assert.equal(dropped, false, "a session-only login must not be reported as persistent");

  const setupCode = fs.readFileSync(path.join(skillRoot, "scripts/login-setup.mjs"), "utf8");
  assert.match(setupCode, /verifyLoginPersistence/);
  assert.match(setupCode, /persistence_verified/);
});

test("core contract survives in the pro skill", () => {
  const out = execFileSync(process.execPath,
    [path.join(skillRoot, "scripts/check-core.mjs"), "--dir", skillRoot], {encoding: "utf8"});
  assert.match(out, /코어 통과/);
});

test("validator accepts a table draft and the parser sees every block type", async () => {
  const md = [
    "# 표 검증", "", "도입 문장입니다.", "", "## 핵심 조건", "",
    "| 항목 | 내용 |", "|---|---|", "| 보증금 | 1,000만 원 |", "",
    "## 위치", "", "지도: 뚝섬역", "", "#태그"
  ].join("\n");
  const tmp = path.join(root, "outputs", "test-draft.md");
  fs.mkdirSync(path.dirname(tmp), {recursive: true});
  fs.writeFileSync(tmp, md);
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(skillRoot, "scripts/validate-draft.mjs"), "--file", tmp], {encoding: "utf8"}));
  assert.equal(out.ok, true);
});

test("transfer script never targets the publish button", () => {
  const code = fs.readFileSync(path.join(skillRoot, "scripts/post-draft.mjs"), "utf8");
  assert.doesNotMatch(code, /name:\s*["']발행/);
  assert.match(code, /save_button_name/);
  assert.match(code, /UNVERIFIED/);
  assert.match(code, /login-setup\.mjs/);
  // 자격증명을 다루는 코드가 없어야 한다
  assert.doesNotMatch(code, /password|비밀번호를 입력/i);
});
