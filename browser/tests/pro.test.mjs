import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";

const root = process.cwd();
const skillRoot = path.join(root, "realtor-naver-blog-browser");
const importer = () => import(pathToFileURL(path.join(skillRoot, "scripts/import-listing.mjs")).href);

test("required bundle files exist", () => {
  for (const rel of [
    "SKILL.md", "agents/openai.yaml",
    "references/input-listing.md", "references/browser-collect.md", "references/content-format.md",
    "references/transfer-contract.md",
    "scripts/profile.mjs", "scripts/init-run.mjs", "scripts/import-listing.mjs",
    "scripts/validate-draft.mjs", "scripts/check-core.mjs", "scripts/workflow.mjs"
  ]) assert.ok(fs.existsSync(path.join(skillRoot, rel)), rel);
});

test("no Playwright transfer or collector remains in the browser-only skill", () => {
  for (const rel of [
    "scripts/fetch-listing.mjs", "scripts/post-draft.mjs", "scripts/login-setup.mjs",
    "scripts/login-persistence.mjs", "scripts/lib/deps.mjs", "config/selectors.yaml", "package-lock.json"
  ]) assert.ok(!fs.existsSync(path.join(skillRoot, rel)), rel);
  const pkg = JSON.parse(fs.readFileSync(path.join(skillRoot, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.scripts?.postinstall, undefined);
  const scripts = fs.readdirSync(path.join(skillRoot, "scripts"), {recursive: true})
    .filter((f) => String(f).endsWith(".mjs"))
    .map((f) => fs.readFileSync(path.join(skillRoot, "scripts", String(f)), "utf8"));
  for (const code of scripts) assert.doesNotMatch(code, /from\s+["']playwright["']|import\(["']playwright["']\)/);
});

test("skill keeps a valid technical name and exposes Korean UI metadata", () => {
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^name: realtor-naver-blog-browser$/m);

  const ui = fs.readFileSync(path.join(skillRoot, "agents/openai.yaml"), "utf8");
  assert.match(ui, /display_name: "네이버 매물블로그 \(내장 브라우저\)"/);
  assert.match(ui, /short_description: ".{25,64}"/u);
  assert.match(ui, /brand_color: "#03C75A"/);
  assert.match(ui, /default_prompt: ".*\$realtor-naver-blog-browser .*"/);
});

test("core contract survives, including the delete ban", () => {
  const out = execFileSync(process.execPath,
    [path.join(skillRoot, "scripts/check-core.mjs"), "--dir", skillRoot], {encoding: "utf8"});
  assert.match(out, /코어 통과/);
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /전체 삭제/);
});

test("validator accepts a table draft and the parser sees every block type", () => {
  const md = [
    "# 표 검증", "", "도입 문장입니다.", "", "## 핵심 조건", "",
    "| 항목 | 내용 |", "|---|---|", "| 보증금 | 1,000만 원 |", "",
    "## 위치", "", "지도: 뚝섬역", "", "#태그"
  ].join("\n");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rnb-")), "test-draft.md");
  fs.writeFileSync(tmp, md);
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(skillRoot, "scripts/validate-draft.mjs"), "--file", tmp], {encoding: "utf8"}));
  assert.equal(out.ok, true);
});

test("listing input resolves numbers and detail links, and rejects map links", async () => {
  const {resolveListingInput} = await importer();
  assert.equal(resolveListingInput("2645188091").article_no, "2645188091");
  assert.equal(resolveListingInput("https://fin.land.naver.com/articles/2645188091?from=share").article_no, "2645188091");
  assert.equal(resolveListingInput("https://fin.land.naver.com/map?center=127,37").error, "map_url_has_no_article_number");
  assert.equal(resolveListingInput("https://example-realty.com/item/view/10849").error, "not_naver_listing_url");
});

test("import keeps gallery order, reports failures and drops identical photos", async () => {
  const {importCapture} = await importer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rnb-import-"));
  const bundle = path.join(dir, "bundle");
  const run = path.join(dir, "run");
  fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, "a.jpg"), "photo-a");
  fs.writeFileSync(path.join(bundle, "b.jpg"), "photo-b");
  fs.writeFileSync(path.join(bundle, "a-copy.jpg"), "photo-a");
  const u = (n) => `https://landthumb-phinf.pstatic.net/2026/${n}.jpg`;
  const out = importCapture(run, {
    schema_version: "browser-capture-1.0",
    article_no: "2645188091",
    method: "page_fetch",
    ui_photo_count: 4,
    api: {
      key: {status: 200, body: {result: {type: {realEstateType: "A01", tradeType: "A1"}}}},
      basic_info: {status: 200, body: {result: {detailInfo: {articleDetailInfo: {articleNumber: "2645188091"}}}}},
      gallery: {status: 200, body: {result: [
        {imageUrl: u(2) + "?type=m562", sortingOrder: 2},
        {imageUrl: u(1), sortingOrder: 1},
        {imageUrl: u(3), sortingOrder: 3},
        {imageUrl: u(4), sortingOrder: 4}
      ]}}
    },
    photos: [
      {url: u(1) + "?type=m562", file: path.join(bundle, "a.jpg")},
      {url: u(2), file: path.join(bundle, "b.jpg")},
      {url: u(3), file: path.join(bundle, "a-copy.jpg")},
      {url: u(4), file: null, reason: "bundle failure"}
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.article_match, true);
  assert.deepEqual([out.photos.expected, out.photos.downloaded], [4, 2]);
  assert.equal(out.photos.failed.length, 1);
  assert.equal(out.photos.duplicates.length, 1);
  assert.equal(fs.readFileSync(path.join(run, "photos", "01.jpg"), "utf8"), "photo-a");
  assert.equal(fs.readFileSync(path.join(run, "photos", "02.jpg"), "utf8"), "photo-b");
  const listing = JSON.parse(fs.readFileSync(path.join(run, "listing.json"), "utf8"));
  assert.equal(listing.schema_version, "3.0");
  assert.equal(listing.collector, "codex-built-in-browser");
  assert.equal(crypto.createHash("sha256").update("photo-a").digest("hex"), listing.gallery.images[0].sha256);
});

test("import refuses a capture whose listing number does not match", async () => {
  const {importCapture} = await importer();
  const run = fs.mkdtempSync(path.join(os.tmpdir(), "rnb-mismatch-"));
  const out = importCapture(run, {
    schema_version: "browser-capture-1.0", article_no: "2645188091",
    api: {basic_info: {status: 200, body: {result: {detailInfo: {articleDetailInfo: {articleNumber: "9999999999"}}}}}},
    photos: []
  });
  assert.equal(out.article_match, false);
  assert.ok(out.warnings.some((w) => /다릅니다/.test(w)));
});

test("runs default to a folder outside the skill so reinstalling keeps them", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "rnb-home-"));
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(skillRoot, "scripts/init-run.mjs"), "--slug", "파주 창고", "--date", "2026-10-10"],
    {encoding: "utf8", env: {...process.env, HOME: home}}));
  assert.equal(out.run_dir, path.join(home, ".codex", "naver-realtor-blog", "runs", "2026-10-10", "파주-창고"));
  assert.throws(() => execFileSync(process.execPath,
    [path.join(skillRoot, "scripts/init-run.mjs"), "--slug", "x", "--root", path.join(skillRoot, "outputs")],
    {encoding: "utf8", stdio: "pipe"}));
});
