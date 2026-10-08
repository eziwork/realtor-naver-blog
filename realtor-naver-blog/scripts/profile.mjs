#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";

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

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseValue(raw) {
  const value = stripComment(raw).trim();
  if (!value || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, "");
}

// Reads the flat two-level shape this profile uses. Not a general YAML parser.
export function readProfile(file) {
  const text = fs.readFileSync(file, "utf8");
  const data = {};
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      section = top[1];
      const inline = parseValue(top[2]);
      data[section] = inline === null && !top[2].trim() ? {} : inline;
      if (data[section] === null && top[2].trim() === "") data[section] = {};
      continue;
    }
    const child = line.match(/^\s{2}([A-Za-z_][\w-]*):\s*(.*)$/);
    if (child && section) {
      if (typeof data[section] !== "object" || data[section] === null) data[section] = {};
      data[section][child[1]] = parseValue(child[2]);
    }
  }
  return data;
}

const TEMPLATE = `schema_version: "1.0"

# 사무소 정보입니다. 한 번만 적어두면 다음 글부터 다시 묻지 않습니다.
# 공개해도 되는 정보만 적으세요. 비워두면 글에 쓰지 않습니다.
office:
  blog_id: null              # 대상 네이버 블로그 ID
  display_name: null          # 예: "성수한강공인중개사사무소"
  realtor_display_name: null  # 예: "박성수"
  public_contact: null        # 공개 가능한 연락처만
  public_address: null
  business_hours: null

specialties:
  regions: []                 # 예: ["성수동", "뚝섬"]
  property_types: []          # 예: ["오피스텔", "원룸"]

# 글에 절대 쓰면 안 되는 표현
prohibited:
  claims: ["최저가", "무조건", "확정 수익", "100%"]

# 블로그별 문체는 같은 폴더의 blog-styles.json에 추가 저장합니다.
# 기존 office/specialties/prohibited 및 사용자 추가 필드는 유지합니다.
`;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
const args = argsOf(process.argv.slice(2));
const file = path.resolve(
  args.path ? String(args.path)
    : path.join(os.homedir(), ".codex", "naver-realtor-blog", "profile.yaml")
);

if (args.init) {
  if (fs.existsSync(file)) {
    throw new Error("Profile already exists: " + file);
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, TEMPLATE);
  process.stdout.write(JSON.stringify({ok: true, created: true, path: file}, null, 2) + "\n");
} else if (!fs.existsSync(file)) {
  process.stdout.write(JSON.stringify({
    ok: false,
    exists: false,
    path: file,
    hint: "Run with --init after collecting the office fields."
  }, null, 2) + "\n");
} else {
  let data;
  try {
    data = readProfile(file);
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false, exists: true, path: file, error: String(error.message)
    }, null, 2) + "\n");
    process.exit(0);
  }
  const office = data.office && typeof data.office === "object" ? data.office : {};
  const prohibited = data.prohibited && typeof data.prohibited === "object" ? data.prohibited : {};
  const filled = Object.values(office).filter((value) => value !== null && value !== "");
  process.stdout.write(JSON.stringify({
    ok: true,
    exists: true,
    path: file,
    office,
    prohibited_claims: Array.isArray(prohibited.claims) ? prohibited.claims : [],
    office_filled: filled.length > 0
  }, null, 2) + "\n");
}
}
