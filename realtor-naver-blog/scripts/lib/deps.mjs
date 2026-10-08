// 전송 부품(playwright)과 전용 브라우저(chromium) 사전 점검.
// 없으면 애매한 스택트레이스 대신 "무엇을 하면 되는지"를 JSON으로 말하고 멈춘다
// — 루나가 이 메시지만 보고도 스스로 복구할 수 있게.
import fs from "node:fs";

function bail(note) {
  console.log(JSON.stringify({status: "SETUP_REQUIRED", note}, null, 2));
  process.exit(2);
}

export async function loadPlaywright() {
  let mod;
  try {
    mod = await import("playwright");
  } catch {
    bail(
      "전송 부품이 설치되지 않았습니다. 스킬 저장소 폴더(package.json이 있는 곳)에서 " +
      "`npm install`을 실행하세요 — 전용 브라우저(chromium)까지 자동으로 설치됩니다. " +
      "끝나면 방금 실패한 명령을 그대로 다시 실행하세요."
    );
  }
  try {
    const p = mod.chromium.executablePath();
    if (!p || !fs.existsSync(p)) throw new Error("browser missing");
  } catch {
    bail(
      "전용 브라우저(chromium)가 설치되지 않았습니다. 스킬 저장소 폴더에서 " +
      "`npx playwright install chromium`을 실행한 뒤, 방금 실패한 명령을 그대로 다시 실행하세요."
    );
  }
  return mod;
}
