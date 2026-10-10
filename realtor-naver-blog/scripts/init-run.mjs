#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function seoulDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const args = argsOf(process.argv.slice(2));
// 작업 폴더는 스킬 폴더 밖에 둔다. 스킬을 다시 설치·업데이트해도 원고와 진행 기록이 남는다.
const root = path.resolve(args.root || path.join(os.homedir(), ".codex", "naver-realtor-blog", "runs"));
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (root === skillDir || root.startsWith(skillDir + path.sep)) {
  throw new Error("--root must be outside the skill folder; reinstalling the skill would delete the runs: " + root);
}
const date = String(args.date || seoulDate());
const slug = slugify(args.slug);

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
if (!slug) throw new Error("--slug is required");

const runDir = path.join(root, date, slug);
if (fs.existsSync(runDir) && fs.readdirSync(runDir).length > 0) {
  throw new Error("Post folder already exists and is not empty: " + runDir);
}

fs.mkdirSync(path.join(runDir, "photos"), {recursive: true});

process.stdout.write(JSON.stringify({
  ok: true,
  run_dir: runDir,
  draft_file: path.join(runDir, "blog-post.md"),
  photos_dir: path.join(runDir, "photos")
}, null, 2) + "\n");
