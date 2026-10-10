// 재열람한 임시저장 글의 관측값을 manifest와 기계적으로 비교한다.
// 브라우저 셀은 관측만 모아 파일로 쓰고, 판정은 이 코드가 한다(모델이 눈으로 대조하지 않는다).
// 검사 항목은 Dr-Min 실측 사고에서 나왔다: 두 번째 붙여넣기 후 굵게 번짐(8e7378a), 저장 무산(d333c83),
// 전화 줄 소실(2f3b2a3), 자리 표시 잔존(75b677d), 표 테두리 소실(cb866fe).
// 관측 필드가 없으면 fail이 아니라 unknown으로 둔다. 추측으로 통과시키지 않는다.

const clean = text => String(text ?? '')
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/==([^=]+)==/g, '$1')
  .replace(/[​﻿]/g, '').replace(/\s+/g, ' ').trim();

const check = (result, evidence) => ({result, evidence});

export function compareObservation(manifest, obs) {
  const checks = {};
  const paragraphs = Array.isArray(obs.paragraphs) ? obs.paragraphs.map(p => ({...p, text: clean(p.text)})) : null;
  const allText = paragraphs ? paragraphs.map(p => p.text).join('\n') : clean(obs.body_text);

  // 제목
  if (obs.title == null) checks.title = check('unknown', '재열람 화면에서 제목을 읽지 못함');
  else checks.title = clean(obs.title) === clean(manifest.title)
    ? check('pass', '원고 제목과 일치')
    : check('fail', `제목 불일치: "${clean(obs.title).slice(0, 80)}"`);

  // 본문: 모든 문장 존재 + 자리 표시 없음 + 굵게/크게 번짐 없음
  if (!allText) checks.body = check('unknown', '재열람 본문을 읽지 못함');
  else {
    const missing = manifest.text_blocks.map(clean).filter(t => t && !allText.includes(t));
    const markers = allText.match(/@@(?:IMG|MAP):\d+@@/g) || [];
    const headingSet = new Set((manifest.headings || []).map(clean));
    const bleed = paragraphs ? paragraphs.filter(p => p.text && !headingSet.has(p.text) && manifest.text_blocks.map(clean).includes(p.text)
      && (p.bold === true || (typeof p.size === 'number' && p.size >= 20))) : [];
    const problems = [];
    if (missing.length) problems.push(`빠진 문장 ${missing.length}개: "${missing[0].slice(0, 60)}"`);
    if (markers.length) problems.push(`남은 자리 표시 ${markers.join(',')}`);
    if (bleed.length) problems.push(`소제목처럼 굵게/크게 번진 본문 ${bleed.length}개: "${bleed[0].text.slice(0, 60)}"`);
    checks.body = problems.length ? check('fail', problems.join(' / '))
      : check('pass', `원고 문장 ${manifest.text_blocks.length}개 모두 존재, 자리 표시 없음${paragraphs ? ', 굵게·크기 번짐 없음' : ''}`);
  }

  // 이미지: 개수 + 로드
  if (!Array.isArray(obs.images)) checks.images = check('unknown', '재열람 이미지를 읽지 못함');
  else {
    const loaded = obs.images.filter(i => i.loaded).length;
    checks.images = obs.images.length >= manifest.images.length && loaded >= manifest.images.length
      ? check('pass', `이미지 ${manifest.images.length}장 모두 로드(관측 ${obs.images.length}장)`)
      : check('fail', `이미지 원고 ${manifest.images.length}장, 관측 ${obs.images.length}장, 로드 ${loaded}장`);
  }

  // 조건표: 셀 값 + 테두리
  const expectedRows = manifest.tables?.[0];
  if (!expectedRows) checks.table = check('unknown', '원고에 조건표 없음');
  else if (!Array.isArray(obs.tables) || !obs.tables.length) checks.table = check('fail', '재열람에서 표를 찾지 못함');
  else {
    const t = obs.tables[0];
    const got = (t.rows || []).map(r => r.map(clean));
    const want = expectedRows.map(r => r.map(clean));
    const diff = want.findIndex((r, i) => !got[i] || r[0] !== got[i][0] || r[1] !== got[i][1]);
    const problems = [];
    if (got.length !== want.length) problems.push(`행 수 원고 ${want.length} ≠ 관측 ${got.length}`);
    if (diff >= 0) problems.push(`${diff + 1}행 불일치: "${want[diff].join(' | ').slice(0, 60)}"`);
    if (t.bordered === false) problems.push('테두리 없음(흰 표로 변환됨)');
    checks.table = problems.length ? check('fail', problems.join(' / '))
      : check('pass', `${want.length}행 모든 셀 일치${t.bordered ? ', 테두리 유지' : ''}`);
  }

  // 지도
  if (!manifest.maps?.length) checks.map = check('not_applicable', manifest.map_omission_reason || '원고에 지도 없음');
  else if (!Array.isArray(obs.maps)) checks.map = check('unknown', '재열람 지도를 읽지 못함');
  else checks.map = obs.maps.length >= manifest.maps.length
    ? check('pass', `지도 ${obs.maps.length}개: ${obs.maps.map(m => clean(m.name || m)).join(', ').slice(0, 80)}`)
    : check('fail', `지도 원고 ${manifest.maps.length}개, 관측 ${obs.maps.length}개`);

  // 연락처: 표시 줄 + tel 링크 (배너 이미지 링크는 근거에만 기록)
  if (!manifest.contact) checks.contact = check('unknown', '원고에 연락처 없음');
  else if (!Array.isArray(obs.links)) checks.contact = check('unknown', '재열람 링크를 읽지 못함');
  else {
    const label = clean(manifest.contact.label);
    const hasLine = allText.includes(label);
    const hasLink = obs.links.some(l => String(l.href || '').replace(/\s/g, '') === manifest.contact.href);
    const banner = Array.isArray(obs.image_links) ? obs.image_links.some(h => String(h).replace(/\s/g, '') === manifest.contact.href) : null;
    const note = banner === true ? ', 배너 이미지 링크도 일치' : banner === false ? ', 배너 이미지 링크 없음' : '';
    checks.contact = hasLine && hasLink ? check('pass', `"${label}" 줄과 ${manifest.contact.href} 링크 유지${note}`)
      : check('fail', `${hasLine ? '' : '전화 줄 없음 '}${hasLink ? '' : 'tel 링크 없음'}${note}`.trim());
  }
  return checks;
}
