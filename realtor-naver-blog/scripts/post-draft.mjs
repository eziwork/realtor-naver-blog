#!/usr/bin/env node
// 검증을 통과한 blog-post.md를 네이버 에디터에 옮기고 임시저장까지 한다.
// LLM 없이 도는 결정론적 전송이다. 성공 판정도 코드가 한다.
//
//   node scripts/post-draft.mjs --file <run>/blog-post.md --blog <blogId> [--tel 010-0000-0000] [--headless]
//
// 반환(JSON): { status: SAVED | UNVERIFIED | BLOCKED | FAILED, ... }
// - 자격증명을 받지 않는다. 로그인은 login-setup.mjs로 사람이 1회.
// - 발행 버튼은 어떤 경우에도 누르지 않는다.
// - 실패해도 원고 파일은 그대로 남는다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

// ── 셀렉터: 네이버 UI가 바뀌면 config/selectors.yaml만 고친다 ──
const DEFAULT_SELECTORS = {
  title_para: ".se-title-text .se-text-paragraph",
  body_para: ".se-section-text .se-text-paragraph",
  photo_button: 'button[data-name="image"]',
  map_button: 'button[data-name="map"], button[data-name="place"]',
  map_search_input: 'input[placeholder*="장소"], .se-place-search-input, input[placeholder*="검색"]',
  link_layer_input: ".se-custom-layer-link-input",
  link_layer_apply: ".se-custom-layer-link-apply-button",
  image_component: ".se-component.se-image",
  map_component: ".se-component.se-map, .se-component.se-placesMap",
  caption_placeholder: "사진 설명을 입력하세요",
  save_button_name: "저장",
  draft_count_button: 'button[aria-label*="임시저장된 글"]',
  saved_toast: /임시\s*저장.{0,6}(완료|되었)/
};

function loadSelectors(skillDir) {
  const file = path.join(skillDir, "config", "selectors.yaml");
  const sel = {...DEFAULT_SELECTORS};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([a-z_]+):\s*"(.+)"\s*$/);
      if (m && m[1] in sel && typeof sel[m[1]] === "string") sel[m[1]] = m[2];
    }
  }
  return sel;
}

// ── 원고 파서: 잠긴 blog-post.md → 순서 있는 블록 목록 ──
function parseDraft(file) {
  const dir = path.dirname(file);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let title = null;
  const ops = [];
  let table = null;
  const flushTable = () => { if (table && table.length) ops.push({type: "table", rows: table}); table = null; };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushTable(); continue; }
    if (/^\|[\s:-]+\|/.test(line)) continue;                    // 표 구분행
    if (line.startsWith("|")) {
      table = table || [];
      table.push(line.split("|").slice(1, -1).map((c) => c.trim()));
      continue;
    }
    flushTable();
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { if (!title) title = h1[1].trim(); continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { ops.push({type: "heading", text: h2[1].trim()}); continue; }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) { ops.push({type: "image", caption: img[1].trim(), file: path.resolve(dir, img[2])}); continue; }
    const map = line.match(/^지도\s*:\s*(.+)$/);
    if (map) { ops.push({type: "map", query: map[1].trim()}); continue; }
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) { ops.push({type: "para", text: "· " + bullet[1].trim()}); continue; }
    ops.push({type: "para", text: line});
  }
  flushTable();
  return {title, ops};
}

const args = argsOf(process.argv.slice(2));
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEL = loadSelectors(skillDir);
const PROFILE = path.join(os.homedir(), ".codex", "naver-realtor-blog", "browser-profile");

const draftFile = path.resolve(String(args.file || ""));
const blogId = String(args.blog || "").trim();
const tel = args.tel ? String(args.tel).trim() : null;
const result = {status: "FAILED", draft: draftFile, publish: false, steps: [], warnings: []};
const done = (patch) => {
  Object.assign(result, patch);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.status === "SAVED" ? 0 : 1);
};

if (!fs.existsSync(draftFile)) done({status: "FAILED", error: "draft file not found"});
if (!blogId) done({status: "FAILED", error: "--blog <blogId> is required"});

const {title, ops} = parseDraft(draftFile);
if (!title) done({status: "FAILED", error: "draft has no H1 title"});
const expectedImages = ops.filter((o) => o.type === "image" && fs.existsSync(o.file)).length;
for (const o of ops) if (o.type === "image" && !fs.existsSync(o.file)) result.warnings.push("missing image skipped: " + o.file);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: Boolean(args.headless),
  viewport: {width: 1400, height: 1000},
  args: ["--disable-blink-features=AutomationControlled"]
});
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = ctx.pages()[0] || await ctx.newPage();
const step = (name) => result.steps.push(name);

async function clickIfVisible(locator, timeout = 1500) {
  try { await locator.first().click({timeout}); return true; } catch { return false; }
}

// 열린 레이어·패널을 정리하고 본문 끝으로 복귀한다
async function resetToBody() {
  await page.keyboard.press("Escape").catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  try {
    await page.locator(SEL.body_para).last().click({timeout: 2500});
    await page.keyboard.press("End");
  } catch { /* 본문 클릭 실패는 다음 동작에서 드러난다 */ }
}

try {
  // 0) 로그인 상태 확인 — 자격증명 없이 세션만 본다
  const cookies = await ctx.cookies("https://naver.com");
  if (!cookies.some((c) => c.name === "NID_AUT")) {
    await ctx.close();
    done({status: "BLOCKED", reason: "login_required", recover: "node scripts/login-setup.mjs 를 실행해 브라우저에서 직접 로그인하세요."});
  }
  step("login-ok");

  // 1) 에디터 진입
  await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${blogId}`, {waitUntil: "domcontentloaded", timeout: 30000});
  await page.waitForTimeout(2500);

  // 로그인 페이지로 튕겼으면 세션 만료
  if (page.url().includes("nidlogin")) {
    await ctx.close();
    done({status: "BLOCKED", reason: "session_expired", recover: "node scripts/login-setup.mjs 로 다시 로그인하세요."});
  }

  // 2) 자동저장 복구창 → 취소 후 계속 (취소는 삭제가 아니다)
  if (await page.getByText("작성 중인 글이 있습니다").isVisible().catch(() => false)) {
    await clickIfVisible(page.getByRole("button", {name: "취소", exact: true}), 3000);
    step("autosave-declined");
    await page.waitForTimeout(800);
  }
  // 도움말 패널 닫기
  await clickIfVisible(page.getByRole("button", {name: "닫기", exact: true}));

  // 3) 제목
  await page.locator(SEL.title_para).first().click({timeout: 8000});
  await page.keyboard.type(title, {delay: 8});
  step("title");
  await page.keyboard.press("Enter");            // 본문으로 이동
  await page.waitForTimeout(300);

  // 4) 본문 왼쪽 정렬 (제목의 가운데 정렬 상속을 끊는다 — 실측)
  try {
    await page.getByRole("button", {name: /정렬 열기/}).first().click({timeout: 2500});
    await page.getByRole("button", {name: /왼쪽/}).first().click({timeout: 2500});
    step("align-left");
  } catch { result.warnings.push("left-align via toolbar failed; check alignment manually"); }
  await page.locator(SEL.body_para).last().click({timeout: 2500}).catch(() => {});

  // 5) 블록 입력 — 블록 하나 치고 Enter 두 번(빈 줄), 일괄 주입 금지(실측)
  // **볼드**와 ==하이라이트==가 있는 문단은 실클립보드 HTML로 붙여 실서식을 만든다
  // (실측: 붙여넣기는 b 태그·배경색 span을 그대로 살린다)
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 일반 문단은 fs15·normal을 명시한다 — 명시가 없으면 변환기가 직전
  // 소제목(fs19·볼드) 스타일을 다음 문단까지 이어붙인다(실측).
  const toHtml = (text) => '<p><span style="font-size:15px;">' + esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<span style="font-weight:700;">$1</span>')
    .replace(/==([^=]+)==/g, '<span style="background-color:#fff3b0">$1</span>') + "</span></p>";
  const BLANK = '<p><span style="font-size:15px;"><br></span></p>';
  const pasteHtml = async (html) => {
    await page.evaluate(async (h) => {
      const item = new ClipboardItem({
        "text/html": new Blob([h], {type: "text/html"}),
        "text/plain": new Blob([h.replace(/<[^>]+>/g, "")], {type: "text/plain"})
      });
      await navigator.clipboard.write([item]);
    }, html);
    await page.keyboard.press("ControlOrMeta+v");
    await page.waitForTimeout(400);
  };
  const typePara = async (text) => {
    if (/\*\*[^*]+\*\*|==[^=]+==/.test(text)) {
      await pasteHtml(toHtml(text));
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.type(text, {delay: 4});
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
    }
  };

  // ── 단일 페이스트 전송 ──
  // 본문 텍스트 전체(문단·소제목·표·빈 줄)를 한 번의 실클립보드 페이스트로
  // 넣는다 (실측: <p> 분리·빈 줄·b·배경색·font-size→se-fs19·표 스타일 보존).
  // 페이스트를 두 번 이상으로 나누면 안 된다 — 실측: 컴포넌트 삽입 후 두 번째
  // 페이스트는 저장 시 마지막 소제목 뒤 문단들이 통째로 볼드 오염된다.
  // 사진·지도는 플레이스홀더 문단을 페이스트에 남기고, 페이스트 뒤 그 자리를
  // 클릭해 컴포넌트를 삽입한다 (실측: 삽입 위치 정확, 오염 없음).
  const buildTable = (rowsIn) => {
    let rows = rowsIn;
    if (rows.length > 1 && rows[0].length === 2 && /^(항목|구분)$/.test(rows[0][0]) && /^(내용|값)$/.test(rows[0][1])) rows = rows.slice(1);
    const B = "border:1px solid #d9dde2;padding:8px;";
    // 표 셀 안의 **볼드**·==하이라이트== 마커도 본문과 똑같이 변환한다
    // (실측: 변환 없이는 별표가 그대로 보인다)
    const cell = (t) => esc(t)
      .replace(/\*\*([^*]+)\*\*/g, '<span style="font-weight:700;">$1</span>')
      .replace(/==([^=]+)==/g, '<span style="background-color:#fff3b0">$1</span>');
    return '<table style="border-collapse:collapse;width:100%"><colgroup><col style="width:28%"><col style="width:72%"></colgroup><tbody>' +
      rows.map((r) => {
        const label = `<td style="${B}background-color:#f5f6f8;width:28%"><span style="font-weight:700;">${cell(r[0])}</span></td>`;
        const rest = r.slice(1).map((c) => `<td style="${B}width:72%">${cell(c)}</td>`).join("");
        return `<tr>${label}${rest}</tr>`;
      }).join("") + "</tbody></table>";
  };

  const buf = [];
  const comps = [];              // 페이스트 후 삽입할 컴포넌트들 (원고 순서)
  const fallbackTables = [];
  let expectedTables = 0;
  for (const op of ops) {
    if (op.type === "para") { buf.push(toHtml(op.text), BLANK); continue; }
    if (op.type === "heading") {
      buf.push(`<p><span style="font-size:19px;font-weight:700;">${esc(op.text)}</span></p>`, BLANK);
      continue;
    }
    if (op.type === "table") {
      buf.push(buildTable(op.rows), BLANK);
      expectedTables += 1;
      fallbackTables.push(op.rows);
      continue;
    }
    if (op.type === "image") {
      if (!fs.existsSync(op.file)) continue;
      const token = `@@IMG:${comps.length + 1}@@`;
      comps.push({kind: "image", token, op});
      buf.push(`<p><span style="font-size:15px;">${token}</span></p>`, BLANK);
      continue;
    }
    if (op.type === "map") {
      const token = `@@MAP:${comps.length + 1}@@`;
      comps.push({kind: "map", token, op});
      buf.push(`<p><span style="font-size:15px;">${token}</span></p>`, BLANK);
    }
  }

  await pasteHtml(buf.join(""));
  await page.waitForTimeout(900);
  if (expectedTables > 0) {
    try {
      await page.locator(".se-component.se-table").nth(expectedTables - 1).waitFor({timeout: 8000});
    } catch {
      result.warnings.push("table missing after paste; rows typed as text");
      await resetToBody();
      await page.keyboard.press("Enter");
      for (const rows of fallbackTables) for (const r of rows) await typePara("· " + r.join(": "));
    }
  }
  step("paste");

  // 6) 전화 연결 라인 + tel: 링크 — 반드시 컴포넌트 삽입 전에 한다.
  // 실측: 이미지 링크 레이어를 한 번 쓰고 나면 같은 링크 레이어가 이미지
  // 컨텍스트에 물려, 텍스트 링크 적용이 선택된 줄을 삼킨다. 깨끗한 레이어
  // 상태(페이스트 직후)에서 걸면 링크가 붙고 저장·재열람에도 남는다.
  if (tel) {
    try {
      // 실측: 직전 단계(이미지 링크 등)가 컴포넌트를 선택 상태로 남기면
      // 타이핑이 통째로 삼켜지고 줄이 생기지 않는다. 선택을 풀고, 줄이
      // 실제로 생겼는지 확인될 때까지 최대 2회 시도한다.
      let telLineMade = false;
      for (let attempt = 0; attempt < 2 && !telLineMade; attempt += 1) {
        await page.keyboard.press("Escape").catch(() => {});
        await resetToBody();
        await page.keyboard.type(`전화 상담: ${tel}`, {delay: 5});
        await page.waitForTimeout(300);
        telLineMade = await page.locator(SEL.body_para).filter({hasText: `전화 상담: ${tel}`}).count() > 0;
      }
      if (!telLineMade) throw new Error("tel line never appeared in the body");
      await page.keyboard.press("Shift+Home");
      await page.waitForTimeout(900);   // 선택 속성 툴바가 뜨는 시간 (실측)
      // 텍스트 링크 버튼만 쓴다. /링크 입력/ 같은 이름 폴백은 이미지 링크
      // 버튼("링크 입력 열기")과 매칭돼 선택된 텍스트 줄을 삼킨다 (실측).
      const textLinkBtn = page.locator('button[data-name="text-link"]');
      if (await textLinkBtn.count() === 0) throw new Error("text-link button not found");
      await textLinkBtn.first().click({timeout: 3000});
      const input = page.locator(SEL.link_layer_input).first();
      await input.waitFor({timeout: 3000});
      await input.evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", {bubbles: true}));
      }, `tel:${tel.replace(/\s/g, "")}`);
      await page.locator(SEL.link_layer_apply).first().click({timeout: 3000});
      // 적용 직후 키 입력을 넣지 않는다 — 실측: 바인딩이 끝나기 전의
      // End/Enter가 링크 적용을 끊는다. 바인딩 완료를 기다렸다가 확인만 한다.
      await page.waitForTimeout(1200);
      const attached = await page.evaluate(() =>
        [...document.querySelectorAll('[data-href^="tel:"]')].filter((n) => !n.closest(".se-component.se-image")).length);
      if (attached > 0) step("tel-link");
      else result.warnings.push("tel link did not attach; number remains as plain text");
    } catch { result.warnings.push("tel link failed; number still visible as text"); }

    // 링크 시도가 어떤 경로로 끝났든, 전화 줄이 본문에 남아 있는지 재확인한다.
    // 실측: 잘못된 레이어가 선택된 줄을 삼켜 지운 사례가 있다. 사라졌으면
    // 평문으로 복구한다 — 번호가 보이는 것이 링크보다 우선이다.
    if (await page.locator(SEL.body_para).filter({hasText: `전화 상담: ${tel}`}).count() === 0) {
      await page.keyboard.press("Escape").catch(() => {});
      await resetToBody();
      await page.keyboard.type(`전화 상담: ${tel}`, {delay: 5});
      result.warnings.push("tel line was consumed during link attempt; restored as plain text");
    }
  }


  // 플레이스홀더 자리를 클릭해 줄을 비우고, 그 캐럿 위치에 컴포넌트를 삽입한다.
  // 위→아래 순서를 지켜야 image_component nth(before) 인덱스가 맞는다.
  const clickPlaceholder = async (token) => {
    await page.locator(SEL.body_para).filter({hasText: token}).first().click({timeout: 4000});
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Delete");
  };

  for (const c of comps) {
    if (c.kind === "image") {
      try {
        await clickPlaceholder(c.token);
        const before = await page.locator(SEL.image_component).count();
        const chooser = page.waitForEvent("filechooser", {timeout: 8000});
        await page.locator(SEL.photo_button).first().click();
        await (await chooser).setFiles(c.op.file);
        // 사진 첨부 방식 팝업 → 개별사진 (실측)
        await clickIfVisible(page.getByText("개별사진", {exact: true}), 4000);
        const comp = page.locator(SEL.image_component).nth(before);
        await comp.waitFor({timeout: 20000});
        step("image:" + path.basename(c.op.file));
        if (c.op.caption) {
          if (await clickIfVisible(comp.locator(".se-caption").first(), 1500)) {
            await page.keyboard.type(c.op.caption, {delay: 5});
          } else result.warnings.push("caption box not found for " + path.basename(c.op.file));
        }
        // CTA 배너는 이미지 자체에도 tel: 링크를 건다 — 실측: 이미지 링크
        // 레이어(data-name="image-link")가 tel:을 받고 저장·재열람에도 남는다.
        // 발행 후 모바일에서 배너를 탭하면 바로 전화가 걸린다.
        if (tel && /cta-banner/i.test(path.basename(c.op.file))) {
          try {
            await comp.click();
            await page.waitForTimeout(600);
            await page.locator('button[data-name="image-link"]').first().click({timeout: 3000});
            const linkInput = page.locator(SEL.link_layer_input).first();
            await linkInput.waitFor({timeout: 3000});
            await linkInput.evaluate((el, value) => {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
              setter.call(el, value);
              el.dispatchEvent(new Event("input", {bubbles: true}));
            }, `tel:${tel.replace(/\s/g, "")}`);
            await page.locator(SEL.link_layer_apply).first().click({timeout: 3000});
            await page.waitForTimeout(600);
            if (await comp.locator('[class*="link-icon"]').count() > 0) step("image-tel-link");
            else result.warnings.push("CTA image tel link did not attach; banner stays unlinked");
          } catch { result.warnings.push("CTA image tel link failed; banner stays unlinked"); }
        }
        await page.keyboard.press("Escape").catch(() => {});
      } catch (e) {
        result.warnings.push("image failed (continuing): " + path.basename(c.op.file) + " — " + String(e.message).slice(0, 80));
        await page.keyboard.press("Escape").catch(() => {});
      }
      continue;
    }

    // 지도는 실패해도 저장을 막지 않는다
    try {
      await clickPlaceholder(c.token);
      await page.getByRole("button", {name: /장소/}).first().click({timeout: 3000});
      await page.waitForTimeout(1200);
      // 장소 패널의 검색 입력을 찾는다 — 실패 시 보이는 입력칸 목록을 남겨 다음 수리를 돕는다
      const visibleInputs = page.locator("input:visible");
      const n = await visibleInputs.count();
      let box = null;
      for (let i = 0; i < n; i += 1) {
        const ph = (await visibleInputs.nth(i).getAttribute("placeholder")) || "";
        if (/장소|검색|주소/.test(ph)) { box = visibleInputs.nth(i); break; }
      }
      if (!box) {
        const phs = [];
        for (let i = 0; i < n; i += 1) phs.push(await visibleInputs.nth(i).getAttribute("placeholder"));
        throw new Error("place search input not found; visible placeholders: " + phs.join(" / "));
      }
      await box.click({timeout: 3000});
      await box.fill(c.op.query);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2200);
      // 실측 순서: 결과 li 클릭 → "추가" → "확인"
      const popup = page.locator(".se-popup-placesMap");
      await popup.locator("li").filter({hasText: c.op.query.split(" ")[0]}).first().click({timeout: 5000});
      await popup.getByRole("button", {name: "추가", exact: true}).click({timeout: 4000});
      await popup.getByRole("button", {name: "확인", exact: true}).click({timeout: 4000});
      await page.locator(SEL.map_component).first().waitFor({timeout: 10000});
      step("map:" + c.op.query);
      await page.keyboard.press("Escape").catch(() => {});
    } catch (e) {
      result.warnings.push("map attach failed for '" + c.op.query + "' — " + String(e.message).slice(0, 120));
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  // 7) 저장 전 결정론 검사 — 화면 왕복 없이 DOM으로
  await resetToBody();
  const imageCount = await page.locator(SEL.image_component).count();
  const bodyText = await page.locator(".se-section-text").allInnerTexts().then((t) => t.join("\n")).catch(() => "");
  // 마지막 두 문단 중 하나라도 있으면 끝까지 들어간 것으로 본다 (해시태그는 칩으로 변환될 수 있음)
  const paras = ops.filter((o) => o.type === "para" && !o.text.startsWith("#"));
  const tail = paras.slice(-2).map((p) => p.text.replace(/\*\*|==/g, "").slice(0, 10));
  const checks = {
    image_count: {expected: expectedImages, actual: imageCount},
    table_count: {expected: expectedTables, actual: await page.locator(".se-component.se-table").count()},
    map_count: {expected: ops.filter((o) => o.type === "map").length, actual: await page.locator(SEL.map_component).count()},
    tel_link_attached: tel ? (await page.evaluate(() => [...document.querySelectorAll('[data-href^="tel:"]')].filter((n) => !n.closest('.se-component.se-image')).length)) > 0 : null,
    cta_tel_link_attached: tel && comps.some((c) => c.kind === "image" && /cta-banner/i.test(path.basename(c.op.file)))
      ? (await page.locator('.se-component.se-image [class*="link-icon"]').count()) > 0 : null,
    ends_complete: tail.length === 0 || tail.some((t) => bodyText.includes(t)),
    placeholder_leftover: (bodyText.match(/@@(?:IMG|MAP):\d+@@/g) || []).length,
    publish_dialog_open: await page.getByText("발행 설정").isVisible().catch(() => false)
  };
  result.pre_save_check = checks;
  if (checks.publish_dialog_open) done({status: "FAILED", error: "publish settings unexpectedly open; aborted before save"});
  if (!checks.ends_complete) result.warnings.push("last paragraph not found in editor body");
  if (checks.placeholder_leftover > 0) result.warnings.push("component placeholder text remains in the body; the draft needs a manual sweep");

  // 8) 임시저장만 클릭 — 발행은 어떤 경로로도 누르지 않는다
  const countBefore = await page.locator(SEL.draft_count_button).getAttribute("aria-label").catch(() => null);
  const saveBtn = page.getByRole("button", {name: SEL.save_button_name, exact: true}).first();
  try {
    await saveBtn.click({timeout: 5000});
  } catch {
    // 패널이 가리고 있으면 정리 후 강제 클릭 — 발행 버튼은 어떤 폴백에서도 대상이 아니다
    await resetToBody();
    await saveBtn.click({timeout: 4000, force: true}).catch(async () => {
      await saveBtn.evaluate((el) => el.click());
    });
  }
  step("save-clicked");

  // 9) 저장 신호 판정
  let saved = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const toast = await page.getByText(SEL.saved_toast).first().isVisible().catch(() => false);
    if (toast) { saved = true; break; }
    const countAfter = await page.locator(SEL.draft_count_button).getAttribute("aria-label").catch(() => null);
    if (countBefore && countAfter && countAfter !== countBefore) { saved = true; break; }
    await page.waitForTimeout(800);
  }
  const countAfter = await page.locator(SEL.draft_count_button).getAttribute("aria-label").catch(() => null);
  await ctx.close();
  done({
    status: saved ? "SAVED" : "UNVERIFIED",
    evidence: {draft_count_before: countBefore, draft_count_after: countAfter},
    note: saved ? "임시저장 확인됨. 발행은 사람이 합니다." : "저장 클릭은 했지만 신뢰할 신호가 없습니다. 임시저장 목록을 직접 확인하세요."
  });
} catch (error) {
  await ctx.close().catch(() => {});
  done({status: "FAILED", error: String(error.message).slice(0, 300)});
}
