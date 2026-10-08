#!/usr/bin/env node
// 이 스킬을 고치거나 확장한 뒤에 실행하세요.
// SKILL.md와 references/*.md를 읽어서 "절대 깨지면 안 되는 5가지"가
// 아직 살아있는지 검사합니다. 나머지는 마음대로 바꿔도 됩니다.
//
//   node scripts/check-core.mjs
//   node scripts/check-core.mjs --dir <다른 스킬 폴더>
//
// 검사 항목을 추가하고 싶으면 아래 CORE 배열에 한 줄 더하면 됩니다.

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = argsOf(process.argv.slice(2));
const skillDir = path.resolve(
  args.dir ? String(args.dir) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
);

const skillFile = path.join(skillDir, "SKILL.md");
if (!fs.existsSync(skillFile)) {
  process.stderr.write("SKILL.md를 찾을 수 없습니다: " + skillFile + "\n");
  process.exit(1);
}

const skill = fs.readFileSync(skillFile, "utf8");
const referencesDir = path.join(skillDir, "references");
const references = fs.existsSync(referencesDir)
  ? fs.readdirSync(referencesDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => fs.readFileSync(path.join(referencesDir, name), "utf8"))
  : [];
const all = [skill, ...references].join("\n");

const CORE = [
  {
    id: "1-사실무결성",
    label: "사용자가 준 사실만 쓴다",
    need: [
      {re: /Never invent|절대 지어내지/i, why: "사실을 지어내지 말라는 규칙이 사라졌습니다"},
      {re: /never guess|확인 필요|모르면 비운/i, why: "모르는 값을 추측하지 말라는 규칙이 사라졌습니다"}
    ],
    forbid: []
  },
  {
    id: "2-권한경계",
    label: "자격증명·남의 탭·발행을 건드리지 않는다",
    need: [
      {re: /never ask for an ID|Never request credentials/i, why: "아이디·비밀번호를 묻지 말라는 규칙이 사라졌습니다"},
      {re: /never a tab the user opened|task-owned tab/i, why: "사용자가 열어둔 탭을 건드리지 말라는 규칙이 사라졌습니다"},
      {re: /Never publish/i, why: "발행 금지 규칙이 사라졌습니다"},
      {re: /저장 버튼만 사용/, why: "임시저장만 누른다는 규칙이 사라졌습니다"}
    ],
    forbid: [
      {re: /public_publish\s*:\s*true/i, why: "공개 발행을 참으로 설정하는 문구가 있습니다"},
      {re: /(click|누르|클릭)\s*[`"']?(발행|예약 발행)/i, why: "발행 버튼을 누르라는 지시가 있습니다"}
    ]
  },
  {
    id: "3-단일원본",
    label: "검증된 로컬 원고가 유일한 원본이다",
    need: [
      {re: /locked source|only source|only browser-writing source/i, why: "원고가 유일한 원본이라는 규칙이 사라졌습니다"},
      {re: /Do not rewrite|never rewrite/i, why: "전송 중에 내용을 새로 쓰지 말라는 규칙이 사라졌습니다"}
    ],
    forbid: []
  },
  {
    id: "4-기계검증",
    label: "형식은 모델이 아니라 스크립트가 검사한다",
    need: [
      {re: /validate-draft\.mjs|scripts\/validate/i, why: "검증 스크립트를 실행하라는 단계가 사라졌습니다"}
    ],
    forbid: []
  },
  {
    id: "6-전략확정",
    label: "전략 확정 전 원고 작성과 전송을 차단한다",
    need: [
      {re: /확정 응답을 받기 전에는 최종 원고 작성/, why: "전략 확정 절차가 없습니다"},
      {re: /check-approved/, why: "확정 상태 검증 명령이 없습니다"},
      {re: /내장 브라우저/, why: "기본 브라우저 전송 방식이 없습니다"},
      {re: /재열람/, why: "저장본 재열람 검수가 없습니다"}
    ],
    forbid: []
  },
  {
    id: "5-정직한종료",
    label: "SAVED / BLOCKED / UNVERIFIED / FAILED 로만 끝낸다",
    need: [
      {re: /`?SAVED`?/, why: "SAVED 상태가 없습니다"},
      {re: /`?BLOCKED`?/, why: "BLOCKED 상태가 없습니다"},
      {re: /`?UNVERIFIED`?/, why: "UNVERIFIED 상태가 없습니다"},
      {re: /`?FAILED`?/, why: "FAILED 상태가 없습니다"}
    ],
    forbid: []
  }
];

// 금지 규칙은 줄 단위로 보되, 걸린 부분 "바로 앞"만 부정어인지 확인합니다.
// "Never click 발행"은 지키는 문장이라 넘어가고, 같은 줄 다른 곳에 never가
// 있다고 해서 진짜 위반까지 덮어주지는 않습니다.
const NEGATION = /(never|not|아니|않|말고|말라|금지|없이|제외)\S*\s*\S*\s*$/i;
const lines = all.split(/\r?\n/);

function violates(rule, line) {
  const scan = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
  let match;
  while ((match = scan.exec(line)) !== null) {
    const before = line.slice(Math.max(0, match.index - 24), match.index);
    if (!NEGATION.test(before)) return true;
    if (match.index === scan.lastIndex) scan.lastIndex += 1;
  }
  return false;
}

const results = CORE.map((core) => {
  const problems = [];
  for (const rule of core.need) {
    if (!rule.re.test(all)) problems.push(rule.why);
  }
  for (const rule of core.forbid) {
    if (lines.some((line) => violates(rule, line))) problems.push(rule.why);
  }
  return {id: core.id, label: core.label, ok: problems.length === 0, problems};
});

// SKILL.md가 부르는 스크립트가 실제로 있는지도 확인합니다.
const missingScripts = [];
for (const match of skill.matchAll(/scripts\/([\w.-]+\.mjs)/g)) {
  const file = path.join(skillDir, "scripts", match[1]);
  if (!fs.existsSync(file) && !missingScripts.includes(match[1])) missingScripts.push(match[1]);
}

const ok = results.every((item) => item.ok) && missingScripts.length === 0;

const report = [ok ? "코어 통과" : "코어 실패", ""];
for (const item of results) {
  report.push(`${item.ok ? "  통과" : "  실패"}  ${item.id}  ${item.label}`);
  for (const problem of item.problems) report.push(`        - ${problem}`);
}
if (missingScripts.length > 0) {
  report.push(`  실패  스크립트  SKILL.md가 부르는 파일이 없습니다: ${missingScripts.join(", ")}`);
}
report.push("");
report.push(ok
  ? "확장한 내용이 코어를 깨지 않았습니다."
  : "위 항목을 되돌리거나 같은 뜻의 문장을 다시 넣어주세요.");

process.stdout.write(report.join("\n") + "\n");
process.stdout.write(JSON.stringify({ok, results, missing_scripts: missingScripts}, null, 2) + "\n");
if (!ok) process.exitCode = 1;
