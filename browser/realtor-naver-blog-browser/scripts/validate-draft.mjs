#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

const args = argsOf(process.argv.slice(2));
const file = path.resolve(args.file || "");
if (!file || !fs.existsSync(file)) throw new Error("Pass an existing --file blog-post.md");

const text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);
const errors = [];
const warnings = [];
const first = lines.find((line) => line.trim());

if (!first?.startsWith("# ")) errors.push("first non-empty line must be one H1 title");
if (text.trim().length < 300) warnings.push("draft is unusually short; confirm that key facts were supplied");
if (/public_publish\s*:\s*true/i.test(text)) errors.push("draft must not claim public publication");
if (/(검색량|상위\s*노출).{0,12}(높|보장|확실)/i.test(text)) {
  errors.push("unresearched search-volume or ranking claim detected");
}

// 지도는 매물 위치를 실제로 보여주는 것이 목적이므로 주소를 막지 않는다.
// 다만 호수는 매물 홍보에 필요 없으므로 기본적으로 뺀다.
const mapAnchor = text.match(/^\s*지도\s*:\s*(.+)$/m);
if (mapAnchor && !mapAnchor[1].trim()) {
  errors.push("`지도:` line is empty");
} else if (mapAnchor && /\d+\s*호(?![가-힣])/.test(mapAnchor[1])) {
  warnings.push("`지도:` anchor includes a unit number; drop it unless the user asked to publish it");
}

function isProse(line) {
  const value = line.trim();
  return value &&
    !/^#{1,6}\s/.test(value) &&
    !/^[-*+]\s/.test(value) &&
    !/^\d+\.\s/.test(value) &&
    !/^!\[/.test(value) &&
    !/^>/.test(value) &&
    !/^\|/.test(value) &&          // markdown 표 행 (pro: 핵심 조건 표)
    !/^태그\s*:|^#\S+(?:\s+#\S+)*$/.test(value) &&
    !/^```/.test(value);
}

// pro: 강조 남용 검사 — 조사에서 확인된 과장 글의 공통 신호를 막는다.
const chapterCount = (text.match(/^##\s/gm) || []).length || 1;
const boldCount = (text.match(/\*\*[^*]+\*\*/g) || []).length;
const hlCount = (text.match(/==[^=]+==/g) || []).length;
if (boldCount > chapterCount) warnings.push(`bold used ${boldCount} times for ${chapterCount} chapters; keep at most one per chapter`);
if (hlCount > 2) warnings.push(`highlight used ${hlCount} times; keep at most 2 per post`);

// pro: 핵심 조건은 2열 표를 권장한다. 표가 있으면 형식을 검사한다.
const tableRows = lines.filter((l) => l.trim().startsWith("|"));
if (tableRows.length > 0) {
  const bad = tableRows.find((l) => (l.match(/\|/g) || []).length < 3 && !/^\|[\s:-]+\|/.test(l.trim()));
  if (bad) warnings.push("table row with fewer than 2 columns: " + bad.trim().slice(0, 40));
}

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (!isProse(line)) continue;

  // Keep authored sentence boundaries; do not split decimals, dates, or URLs automatically.
  if ([...line.trim()].length > 120) warnings.push(`line ${i + 1} is long; shorten the sentence for mobile reading`);
  if (/[.!?。！？]\s+[가-힣A-Za-z]/.test(line)) warnings.push(`line ${i + 1}: put each sentence in a separate paragraph with one blank line between sentences`);
  if (/확인할 수 있습니다|살펴볼 수 있습니다|보입니다|표시됩니다|등록\s*사진|인계\s*품목/.test(line)) warnings.push(`line ${i + 1}: review passive or difficult wording; explain confirmed facts directly in familiar words`);

  const next = lines[i + 1];
  if (next !== undefined && next.trim() && isProse(next)) {
    warnings.push(`line ${i + 1}: confirm the intended paragraph boundary`);
  }
}

if (/\n\s*\n\s*\n\s*\n/.test(text)) warnings.push("more than one blank line appears between content blocks");

const result = {
  ok: errors.length === 0,
  file,
  line_count: lines.length,
  errors,
  warnings
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (!result.ok) process.exitCode = 1;
