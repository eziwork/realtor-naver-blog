import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Workflow, saveStyle, getStyle} from '../realtor-naver-blog/scripts/lib/workflow.mjs';
import {hash, validateListing, validateStrategy, STYLE_FIELDS, writeJSON} from '../realtor-naver-blog/scripts/lib/contracts.mjs';
import {readProfile} from '../realtor-naver-blog/scripts/profile.mjs';
import {fixture, scenarios, office} from './fixtures.mjs';

function setup(t, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'blog-workflow-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'sample.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==','base64'));
  return {dir, flow:new Workflow(dir), ...fixture(scenario)};
}
function approve(flow, listing, strategy) {
  flow.listing(listing); flow.propose(strategy);
  flow.approve({listing_hash:hash(listing),strategy_hash:hash(strategy),user_quote:'테스트 시뮬레이션: 이 전략으로 진행'});
}
for (const scenario of scenarios) test(`${scenario.type}: approved strategy generates its own target, query, sections and CTA`, t=>{
  const {flow,listing,strategy,post,dir}=setup(t,scenario);
  approve(flow,listing,strategy);
  flow.prepare(post,office,'fixture-blog');
  const md=fs.readFileSync(path.join(dir,'blog-post.md'),'utf8');
  for (const text of [...scenario.sections,scenario.cta,scenario.condition]) assert.ok(md.includes(text));
  assert.equal(flow.read('strategy.json').keywords.main,scenario.keyword);
  assert.equal(flow.read('strategy.json').primary_target.text,scenario.target);
});
test('confirmation gate blocks content preparation and browser entry; stale or blank approvals fail',t=>{
  const {flow,listing,strategy,post,dir}=setup(t);
  flow.listing(listing); flow.propose(strategy);
  assert.throws(()=>flow.prepare(post,office,'fixture'),/CONFIRMATION/);
  assert.throws(()=>flow.begin(office),/CONFIRMATION/);
  assert.equal(fs.existsSync(path.join(dir,'transfer.html')),false);
  assert.throws(()=>flow.approve({listing_hash:hash(listing),strategy_hash:'stale',user_quote:'확정'}),/different revision/);
  assert.throws(()=>flow.approve({listing_hash:hash(listing),strategy_hash:hash(strategy),user_quote:''}),/actual user/);
});
test('fact and target changes invalidate approval; prose style edits reuse it',t=>{
  const {flow,listing,strategy,post}=setup(t); approve(flow,listing,strategy);
  post.style.summary='짧고 담백한 존댓말'; flow.prepare(post,office,'fixture');
  assert.ok(flow.approved().approval);
  listing.facts.find(f=>f.id==='conditions').value='공급 32평'; flow.listing(listing);
  assert.throws(()=>flow.prepare(post,office,'fixture'),/CONFIRMATION/);
  approve(flow,listing,strategy);
  strategy.primary_target.text='변경 요청된 타겟'; flow.propose(strategy);
  assert.throws(()=>flow.begin(office),/CONFIRMATION/);
});
test('missing/conflicting facts cannot be promoted into confirmed claims',t=>{
  const {flow,listing,strategy,post}=setup(t);
  listing.facts.push({id:'price',label:'가격',status:'conflict',source_ids:['input'],alternatives:['5억','6억']});
  assert.throws(()=>validateStrategy(strategy,listing),/가격/);
  strategy.checks.push('가격 충돌 확인'); strategy.hook.fact_ids.push('price');
  assert.throws(()=>validateStrategy(strategy,listing),/unconfirmed/);
  strategy.hook.fact_ids.pop(); approve(flow,listing,strategy); post.strategy_hash=hash(strategy); post.listing_hash=hash(listing);
  post.blocks[0]={type:'paragraph',text:'가격은 5억입니다.',fact_ids:['price']};
  assert.throws(()=>flow.prepare(post,office,'fixture'),/unconfirmed/);
  post.blocks[0]={type:'paragraph',text:'역까지 7분입니다.',fact_ids:['location']};
  assert.throws(()=>flow.prepare(post,office,'fixture'),/unsupported number/);
  post.blocks[0]={type:'paragraph',text:'예상 수익 31%입니다.',fact_ids:['conditions']};
  assert.throws(()=>flow.prepare(post,office,'fixture'),/unsupported measurement/);
  listing.facts[0].source_ids=['missing']; assert.throws(()=>validateListing(listing),/invalid sources/);
});
test('asset/profile/source modifications stop transfer; banners must be refreshed',t=>{
  const {flow,listing,strategy,post,dir}=setup(t); approve(flow,listing,strategy); flow.prepare(post,office,'fixture');
  assert.throws(()=>flow.begin({...office,public_contact:'000-0000-0001'}),/office profile changed/);
  assert.throws(()=>flow.prepare(post,{...office,public_contact:'000-0000-0001'},'fixture'),/banner profile changed/);
  fs.appendFileSync(path.join(dir,'sample.png'),'changed'); assert.throws(()=>flow.begin(office),/image changed/);
});
test('style selection covers saved, first analysis, sparse samples and fallback without modifying YAML',t=>{
  const {dir}=setup(t); const profile=path.join(dir,'profile.yaml');
  const legacy='schema_version: "1.0"\noffice:\n  display_name: "기존 사무소"\n  public_contact: "000-0000-0000"\ncustom:\n  keep: "유지"\n'; fs.writeFileSync(profile,legacy);
  assert.equal(getStyle(dir,'sample'),null);
  const style={schema_version:'1.0',blog_id:'sample',origin:'analyzed',features:Object.fromEntries(STYLE_FIELDS.map(f=>[f,'차분하게 설명'])),sources:[{url:'https://blog.naver.com/sample/12345',text_excerpt:'확인할 조건을 안내합니다.'}],analyzed_at:new Date().toISOString()};
  assert.equal(saveStyle(dir,style).limited_sample,true);
  assert.equal(getStyle(dir,'https://m.blog.naver.com/sample').origin,'analyzed');
  assert.throws(()=>saveStyle(dir,style),/change request/);
  style.sources=Array(6).fill(style.sources[0]); assert.throws(()=>saveStyle(dir,style,'변경'),/five/);
  style.sources=[]; assert.throws(()=>saveStyle(dir,style,'변경'),/no accessible/);
  style.origin='default'; style.fallback_reason='공개 본문 접근 실패'; saveStyle(dir,style,'기본 문체로 변경해줘');
  assert.equal(getStyle(dir,'sample').origin,'default');
  assert.equal(fs.readFileSync(profile,'utf8'),legacy); assert.equal(readProfile(profile).custom.keep,'유지');
});
test('same-type conditions permit different strategies instead of a fixed template',()=>{
  for (const type of ['빌라','창고']) {
    const first=scenarios.find(s=>s.type===type);
    const changed={...first,condition:type==='빌라'?'분리 작업실, 넓은 거실':'소형 차량 진입, 면적 20㎡',target:type==='빌라'?'주거와 작업을 분리하려는 거주자':'작은 재고를 보관할 사업자',keyword:type==='빌라'?'대학가 작업 공간 빌라':'파주 소형 창고 임대',sections:['공간 분리가 목적에 맞는가?'],cta:'사용 목적에 따른 공간 구성 확인'};
    const a=fixture(first), b=fixture(changed); validateStrategy(b.strategy,b.listing);
    assert.notEqual(a.strategy.primary_target.text,b.strategy.primary_target.text); assert.notEqual(a.strategy.keywords.main,b.strategy.keywords.main); assert.notDeepEqual(a.strategy.sections,b.strategy.sections); assert.notEqual(a.strategy.cta.benefit,b.strategy.cta.benefit);
  }
});
test('saved without reopen is not complete; uncertain saves cannot create duplicate drafts',t=>{
  const {flow,listing,strategy,post}=setup(t); approve(flow,listing,strategy); flow.prepare(post,office,'fixture');
  const attempt=flow.begin(office).attempts.at(-1);
  flow.record({attempt_id:attempt.id,outcome:'unknown',observation:'저장 후 신호를 확인할 수 없음'});
  assert.equal(flow.state().result.status,'UNVERIFIED'); assert.equal(flow.state().result.quality,'확인 불가');
  assert.throws(()=>flow.begin(office),/CHECK_DRAFT_LIST_FIRST/);
  flow.reconcile({draft_list_checked:true,matched_identity:'fixture-title@time',evidence:'목록에서 동일 제목과 시각을 확인'});
  const resumed=flow.begin(office).attempts.at(-1); assert.equal(resumed.resume_draft_identity,'fixture-title@time');
  flow.record({attempt_id:resumed.id,outcome:'saved',observation:'저장 메시지',save_signal:'임시저장 완료',saved_identity:'fixture-title@time'});
  assert.equal(flow.state().result.status,'SAVED'); assert.equal(flow.state().result.quality,'확인 불가');
});
for (const outcome of ['blocked','failed']) test(`${outcome}: login/upload failure retains artifacts and cannot blindly retry`,t=>{
  const {flow,listing,strategy,post,dir}=setup(t); approve(flow,listing,strategy); flow.prepare(post,office,'fixture');
  const attempt=flow.begin(office).attempts.at(-1);
  flow.record({attempt_id:attempt.id,outcome,observation:outcome==='blocked'?'로그인 만료':'사진 업로드 오류'});
  assert.equal(flow.state().result.quality,'확인 불가'); assert.ok(fs.existsSync(path.join(dir,'blog-post.md')));
  assert.throws(()=>flow.begin(office),/CHECK_DRAFT_LIST_FIRST/);
});
test('reopened draft needs every component check; explicit failure is 보완 필요',t=>{
  const {flow,listing,strategy,post}=setup(t); approve(flow,listing,strategy); flow.prepare(post,office,'fixture');
  let attempt=flow.begin(office).attempts.at(-1);
  const checks=Object.fromEntries(['title','body','images','table','map','contact'].map(k=>[k,{result:k==='map'?'not_applicable':'pass',evidence:k+' observed in reopened draft'}]));
  const evidence={attempt_id:attempt.id,outcome:'saved',observation:'재열람',save_signal:'저장 완료',saved_identity:'id',reopened_identity:'id',checks};
  flow.record(evidence); assert.equal(flow.state().result.quality,'완료');
  post.style.summary='문체만 수정한 원고'; flow.prepare(post,office,'fixture');
  assert.equal(flow.state().result,null,'previous completeness must not survive a new draft revision');
  flow.reconcile({draft_list_checked:true,matched_identity:'id',evidence:'동일 글 확인'}); attempt=flow.begin(office).attempts.at(-1);
  checks.images={result:'fail',evidence:'사진 누락'}; flow.record({...evidence,attempt_id:attempt.id,checks}); assert.equal(flow.state().result.quality,'보완 필요');
});
test('CLI returns structured confirmation failure and legacy profile is readable',t=>{
  const {dir,flow,listing,strategy,post}=setup(t); flow.listing(listing); flow.propose(strategy); writeJSON(path.join(dir,'input.json'),post);
  const profile=path.join(dir,'profile.yaml'); fs.writeFileSync(profile,'office:\n  public_contact: "000-0000-0000"\n');
  const script=path.resolve('realtor-naver-blog/scripts/workflow.mjs');
  assert.throws(()=>execFileSync(process.execPath,[script,'prepare','--run',dir,'--file',path.join(dir,'input.json'),'--profile',profile,'--blog','fixture'],{encoding:'utf8'}),error=>JSON.parse(error.stdout).error==='STRATEGY_CONFIRMATION_REQUIRED');
});
test('changed local draft, mismatched blog and hidden photo omissions are rejected',t=>{
  const {flow,listing,strategy,post,dir}=setup(t); approve(flow,listing,strategy); flow.prepare(post,office,'fixture');
  fs.appendFileSync(path.join(dir,'transfer.html'),'<p>unreviewed edit</p>');
  assert.throws(()=>flow.begin(office),/artifact changed/);
  flow.prepare(post,office,'fixture'); flow.begin(office);
  assert.throws(()=>flow.prepare(post,office,'another-blog'),/another blog/);
  const second=setup(t); second.listing.photos.push({id:'p1',path:'sample.png',label:'실내 사진',source_id:'input'});
  second.post.listing_hash=hash(second.listing); approve(second.flow,second.listing,second.strategy);
  assert.throws(()=>second.flow.prepare(second.post,office,'fixture'),/silently omitted/);
  second.post.excluded_photos=[{id:'p1',reason:'중복 사진'}]; second.flow.prepare(second.post,office,'fixture');
});
test('CLI executes confirmed facts to prepared transfer, and malformed args stay structured',t=>{
  const {dir,listing,strategy,post}=setup(t); const profile=path.join(dir,'profile.yaml');
  fs.writeFileSync(profile,'office:\n  display_name: "테스트 사무소"\n  public_contact: "000-0000-0000"\n');
  const script=path.resolve('realtor-naver-blog/scripts/workflow.mjs');
  const run=(command,data,extra=[])=>{
    const args=[script,command,'--run',dir,...extra];
    if(data){const file=path.join(dir,command+'-input.json');writeJSON(file,data);args.push('--file',file);}
    return JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  };
  run('facts',listing); const proposed=run('propose',strategy);
  run('approve',{listing_hash:proposed.listing_hash,strategy_hash:proposed.strategy_hash,user_quote:'시험 응답: 확정'});
  assert.equal(run('prepare',post,['--profile',profile,'--blog','fixture']).phase,'prepared');
  assert.equal(run('begin',null,['--profile',profile]).phase,'transferring');
  assert.throws(()=>execFileSync(process.execPath,[script,'begin','--run'],{encoding:'utf8'}),error=>JSON.parse(error.stdout).ok===false);
});
