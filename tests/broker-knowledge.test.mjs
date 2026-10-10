import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash, validateListing, writeJSON} from '../realtor-naver-blog/scripts/lib/contracts.mjs';
import {Workflow} from '../realtor-naver-blog/scripts/lib/workflow.mjs';
import {saveKnowledge, listKnowledge, retireKnowledge, knowledgeSnapshot} from '../realtor-naver-blog/scripts/lib/broker-knowledge.mjs';
import {fixture, scenarios, office} from './fixtures.mjs';

function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'broker-memory-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const profileDir=path.join(root,'office');fs.mkdirSync(profileDir);
  const profile=path.join(profileDir,'profile.yaml');fs.writeFileSync(profile,'office:\n  display_name: "테스트 사무소"\n  public_contact: "000-0000-0000"\n');
  return {root,profileDir,profile,run(name='one',scenario=scenarios[3]) {
    const dir=path.join(root,name), flow=new Workflow(dir,{profileDir}), data=fixture(scenario);
    flow.listing(data.listing);
    fs.writeFileSync(path.join(dir,'sample.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXgAAAABJRU5ErkJggg==','base64'));
    return {dir,flow,...data};
  }};
}
const source=excerpt=>({kind:'user',locator:'test user message',excerpt});
function knowledge(overrides={}) {
  return {kind:'explanation_priority',text:'차량 진입 설명을 먼저 배치한다',scope:{property_types:['창고'],regions:['파주'],transactions:['임대']},scope_reason:'사용자가 파주 창고 임대 상담에서 반복된다고 명시',source:{...source('우리 파주 창고 임대 고객들은 차량 진입을 먼저 물어봐요.'),scope:'office_pattern'},privacy_reviewed:true,...overrides};
}
function context(listing, changes={}) {
  return {schema_version:'1.0',listing_hash:hash(listing),assessment:'needed',reason:'차별점이나 실제 고객 반응이 아직 제공되지 않음',status:'asked',questions:[{key:'recommendation',text:'이 창고에서 가장 추천하는 점은 무엇인가요?'},{key:'reaction',text:'고객들이 좋아하거나 망설였던 점이 있나요?'}],items:[],...changes};
}
function ref(item) {return {id:item.id,snapshot:knowledgeSnapshot(item),usage:['sections','cta'],reason:'차량 동선을 앞에서 설명하되 현재 매물의 확인된 조건만 사용'};}
function confirm(flow) {const s=flow.state();flow.approve({listing_hash:s.listing_hash,strategy_hash:s.strategy_hash,user_quote:'테스트 확정'});}

test('enough field context suppresses questions; actual input evaluation can inform strategy',t=>{
  const {flow,listing,strategy}=setup(t).run();
  const saved=flow.context(context(listing,{assessment:'sufficient',status:'not_needed',questions:[],reason:'추천 포인트를 이미 사용자가 설명함',items:[{id:'evaluation',kind:'evaluation',text:'중개사는 상하차 설명을 우선하고 싶어 함',source:source('이 매물은 상하차 동선을 가장 추천하고 싶어요.'),fact_ids:[]}]}));
  assert.equal(saved.questions.length,0);
  assert.throws(()=>flow.context({...saved,questions:[{key:'reaction',text:'다시 물어볼까요?'}]}),/must not trigger/);
  strategy.context_refs=[{id:'evaluation',snapshot:saved.items[0],usage:['sections'],reason:'추천 이유를 설명 순서에 반영'}];
  flow.propose(strategy);confirm(flow);assert.ok(flow.approved().approval);
});
test('missing context permits one batch of at most two distinct questions',t=>{
  const {flow,listing}=setup(t).run();const data=context(listing);
  assert.throws(()=>flow.context({...data,questions:[...data.questions,{key:'recommendation',text:'추가 질문'}]}),/at most two/);
  assert.throws(()=>flow.context({...data,questions:[data.questions[0],data.questions[0]]}),/distinct/);
  flow.context(data);
  assert.throws(()=>flow.context({...data,questions:[{key:'recommendation',text:'새 질문을 또 합니다'}]}),/another field-question batch/);
  const answered=flow.context({...data,status:'answered',items:[{id:'reaction',kind:'customer_reaction',text:'한 고객은 출입구 폭에 관심을 보였음',source:source('이 창고를 본 고객이 출입구 폭을 물어봤어요.'),fact_ids:[]}]});
  assert.equal(answered.items[0].kind,'customer_reaction');
  assert.throws(()=>flow.context(data),/re-open/);
});
for(const status of ['skipped','unanswered']) test(`${status}: continue with existing facts without inventing new context`,t=>{
  const {flow,listing,strategy}=setup(t).run(), original=hash(listing), data=context(listing);
  flow.context(data);assert.throws(()=>flow.propose(strategy),/record answered/);
  flow.context({...data,status});flow.propose(strategy);confirm(flow);
  assert.equal(hash(flow.read('facts.json')),original);assert.deepEqual(flow.read('broker-context.json').items,[]);
});
test('only verified facts use matching user evidence; reactions and office advice cannot become facts',t=>{
  const {flow,listing}=setup(t).run();
  const item={id:'detail',kind:'fact',text:'현재 사용자가 제공한 창고 조건',source:listing.sources[0],fact_ids:['conditions']};
  flow.context(context(listing,{status:'answered',items:[item]}));
  assert.throws(()=>flow.context(context(listing,{status:'answered',items:[{...item,kind:'customer_reaction'}]})),/cannot become listing facts/);
  assert.throws(()=>flow.context(context(listing,{status:'answered',items:[{...item,source:source('다른 매물의 조건')}]})),/actual matching/);
  const copied=structuredClone(listing);copied.sources[0].knowledge_id='know-other';assert.throws(()=>validateListing(copied),/cannot be listing fact sources/);
  const sourceCopy=structuredClone(listing);sourceCopy.sources[0].scope='office_pattern';assert.throws(()=>validateListing(sourceCopy),/cannot be listing fact sources/);
  const ids=structuredClone(listing);ids.facts[0].id='know-fake';assert.throws(()=>validateListing(ids),/promoted to fact/);
});
test('memory only accepts explicit office patterns and rejects AI guesses, one-listing experiences and contacts',t=>{
  const {profileDir}=setup(t);
  for(const scope of ['listing','ai_hypothesis']) assert.throws(()=>saveKnowledge(profileDir,knowledge({source:{...source('이 창고를 본 고객이 좋아했어요'),scope}})),/only explicit recurring/);
  assert.throws(()=>saveKnowledge(profileDir,knowledge({source:{kind:'ai',locator:'inference',excerpt:'물류 사업자가 좋아할 것',scope:'office_pattern'}})),/actual user source/);
  assert.throws(()=>saveKnowledge(profileDir,knowledge({privacy_reviewed:false})),/remove customer names/);
  assert.throws(()=>saveKnowledge(profileDir,knowledge({text:'고객 010-1234-5678의 문의'})),/remove personal/);
  assert.equal(fs.existsSync(path.join(profileDir,'office-knowledge.json')),false);
  const first=saveKnowledge(profileDir,knowledge()).item;
  assert.throws(()=>saveKnowledge(profileDir,knowledge({text:'수정 내용',replaces:[first.id],change_request:'010-1234-5678 고객 요청'})),/remove personal/);
  assert.throws(()=>saveKnowledge(profileDir,knowledge({text:'충돌 내용',conflicts_with:[first.id],conflict_reason:'client@example.com 고객 의견'})),/remove personal/);
  assert.throws(()=>retireKnowledge(profileDir,{id:first.id,user_request:'02-1234-5678 관련 항목을 잊어줘'}),/remove personal/);
});
test('type, transaction and confirmed exact region determine applicable memory',t=>{
  const env=setup(t), run=env.run();saveKnowledge(env.profileDir,knowledge());
  assert.equal(listKnowledge(env.profileDir,run.listing).items.length,1);
  assert.equal(listKnowledge(env.profileDir,fixture(scenarios[0]).listing).items.length,0);
  for(const region of ['제주','파주로','미확인']) {
    const listing=structuredClone(run.listing);listing.facts.find(f=>f.id==='location').value=region;
    assert.equal(listKnowledge(env.profileDir,listing).items.length,0);
  }
  const listing=structuredClone(run.listing);listing.facts.find(f=>f.id==='location').status='unknown';assert.equal(listKnowledge(env.profileDir,listing).items.length,0);
  const sale=structuredClone(run.listing);sale.transaction='매매';sale.facts.find(f=>f.id==='transaction').value='매매';assert.equal(listKnowledge(env.profileDir,sale).items.length,0);
});
test('dedupe, explicit correction and forgetting do not leave duplicate active advice',t=>{
  const {profileDir}=setup(t);const first=saveKnowledge(profileDir,knowledge());
  assert.equal(saveKnowledge(profileDir,knowledge()).action,'unchanged');
  assert.equal(listKnowledge(profileDir).items.length,1);
  const revision=knowledge({text:'내부 배치를 먼저 설명한다',replaces:[first.item.id]});
  assert.throws(()=>saveKnowledge(profileDir,revision),/explicit correction/);
  const next=saveKnowledge(profileDir,{...revision,change_request:'앞으로는 내부 배치를 먼저 설명해'});
  assert.equal(listKnowledge(profileDir).items.find(i=>i.id===first.item.id).status,'inactive');
  retireKnowledge(profileDir,{id:next.item.id,user_request:'이건 잊어줘'});
  assert.equal(saveKnowledge(profileDir,knowledge({text:revision.text})).item.status,'inactive');
  assert.equal(listKnowledge(profileDir,fixture(scenarios[3]).listing).items.length,0);
});
test('ambiguous contradictions are withheld until the whole conflict is explicitly resolved',t=>{
  const {profileDir}=setup(t), a=saveKnowledge(profileDir,knowledge()).item;
  const b=saveKnowledge(profileDir,knowledge({text:'내부 배치를 먼저 설명한다',conflicts_with:[a.id],conflict_reason:'두 설명의 우선순위가 충돌하며 변경 요청인지 불명확'})).item;
  const visible=listKnowledge(profileDir,fixture(scenarios[3]).listing);assert.equal(visible.items.length,0);assert.equal(visible.conflicts.length,2);
  assert.throws(()=>saveKnowledge(profileDir,knowledge({text:'진입부터 설명한다',replaces:[a.id],change_request:'진입부터'})),/all conflicting/);
  const resolved=saveKnowledge(profileDir,knowledge({replaces:[a.id,b.id],change_request:'차량 진입부터로 통일해'}));
  assert.equal(listKnowledge(profileDir,fixture(scenarios[3]).listing).items.length,1);
  assert.equal(saveKnowledge(profileDir,knowledge()).item.id,resolved.item.id);
});
test('strategy snapshots reject unavailable memory and context from other listings; approved strategies stay frozen',t=>{
  const env=setup(t), {flow,listing,strategy}=env.run(); const k=saveKnowledge(env.profileDir,knowledge()).item;
  strategy.knowledge_refs=[ref(k)];flow.propose(strategy);confirm(flow);const frozen=hash(flow.read('strategy.json'));
  saveKnowledge(env.profileDir,knowledge({text:'면적 구성 질문을 함께 설명한다'}));
  retireKnowledge(env.profileDir,{id:k.id,user_request:'진입 우선은 이제 기억하지 마'});
  assert.equal(hash(flow.read('strategy.json')),frozen);assert.ok(flow.approved().approval);
  assert.throws(()=>flow.propose(strategy),/unavailable knowledge_refs/);
  const stale=structuredClone(strategy);delete stale.knowledge_refs;stale.context_refs=[{id:'foreign',snapshot:{},usage:['hook'],reason:'다른 매물'}];
  assert.throws(()=>flow.propose(stale),/another listing revision/);
  const known=saveKnowledge(env.profileDir,knowledge({text:'공간 배치를 설명한다'})).item;
  const tampered={...ref(known),snapshot:{...knowledgeSnapshot(known),text:'모든 창고는 대형차 진입 가능'}};
  assert.throws(()=>flow.propose({...strategy,knowledge_refs:[tampered]}),/changed knowledge_refs snapshot/);
});
test('two consecutive listing runs reuse consultation priorities without carrying over listing facts',t=>{
  const env=setup(t), a=env.run('first');
  const firstFacts=hash(a.listing);const memo=saveKnowledge(env.profileDir,knowledge()).item;
  a.strategy.knowledge_refs=[ref(memo)];a.flow.propose(a.strategy);confirm(a.flow);
  const secondScenario={...scenarios[3],condition:'면적 80㎡, 층고 3m, 1톤 차량 진입 확인',cta:'물품 규모에 맞는 공간 배치 상담'};
  const b=env.run('second',secondScenario), remembered=listKnowledge(env.profileDir,b.listing).items;
  assert.equal(remembered.length,1);
  b.strategy.knowledge_refs=[ref(remembered[0])];b.strategy.sections[0].direction='현재 창고의 확인된 차량 진입 조건을 먼저 설명한다';
  b.flow.propose(b.strategy);confirm(b.flow);b.post.strategy_hash=hash(b.strategy);b.flow.prepare(b.post,office,'fixture');
  const md=fs.readFileSync(path.join(b.dir,'blog-post.md'),'utf8');
  assert.ok(md.includes('1톤'));assert.ok(!md.includes('5톤'));assert.ok(!md.includes('200㎡'));assert.ok(!md.includes('6m'));
  assert.equal(hash(a.flow.read('facts.json')),firstFacts);
  assert.equal(b.flow.read('strategy.json').knowledge_refs[0].snapshot.text,memo.text);
  const knowledgeText=fs.readFileSync(path.join(env.profileDir,'office-knowledge.json'),'utf8');assert.ok(!knowledgeText.includes('5톤'));
});
test('existing YAML and blog styles remain byte-identical; another profile folder cannot see this office memory',t=>{
  const env=setup(t), stylePath=path.join(env.profileDir,'blog-styles.json');fs.writeFileSync(stylePath,'{"custom":"keep"}');
  const yaml=fs.readFileSync(env.profile), styles=fs.readFileSync(stylePath);
  saveKnowledge(env.profileDir,knowledge());
  assert.deepEqual(fs.readFileSync(env.profile),yaml);assert.deepEqual(fs.readFileSync(stylePath),styles);
  assert.deepEqual(listKnowledge(path.join(env.root,'other-office')).items,[]);
});
test('CLI exposes context-save and the full memory lifecycle using the selected profile',t=>{
  const env=setup(t), run=env.run(), script=path.resolve('realtor-naver-blog/scripts/workflow.mjs');
  function call(command,data,scoped=false) {
    const args=[script,command,'--profile',env.profile];if(scoped)args.push('--run',run.dir);
    if(data){const file=path.join(env.root,'command.json');writeJSON(file,data);args.push('--file',file);}
    return JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  }
  assert.equal(call('context-save',context(run.listing,{status:'skipped'}),true).status,'skipped');
  const created=call('knowledge-save',knowledge());assert.equal(created.action,'saved');
  assert.equal(call('knowledge-list',null,true).items.length,1);
  call('knowledge-retire',{id:created.item.id,user_request:'이 항목은 잊어줘'});
  assert.equal(call('knowledge-list',null,true).items.length,0);
});
test('latest centered layout and actual blank lines survive preparation',t=>{
  const {flow,listing,strategy,post,dir}=setup(t).run();flow.propose(strategy);confirm(flow);flow.prepare(post,office,'fixture');
  const html=fs.readFileSync(path.join(dir,'transfer.html'),'utf8');
  assert.ok(html.includes('<p style="text-align: center"><span style="font-size:16px;"><br></span></p>'));
  assert.ok(/<td style="[^"]*text-align: center[^"]*">/.test(html));
  assert.equal(hash(flow.read('facts.json')),hash(listing));
});

test('same facts support different field-context strategies without promoting opinions into facts',t=>{
  const env=setup(t);
  const cases=[
    {name:'inventory',text:'재고 정리 동선을 추천하고 싶어요',kind:'evaluation',target:'재고 정리 공간을 찾는 사업자',hook:'재고 관리 관점에서 공간 비교',direction:'확인된 면적을 바탕으로 재고 정리 공간부터 설명'},
    {name:'access',text:'이 매물을 본 고객이 차량 회차를 걱정했어요',kind:'customer_reaction',target:'입출고 동선을 비교하는 사업자',hook:'확인된 진입 조건으로 입출고 동선 비교',direction:'확인된 진입 조건부터 설명하고 회차 가능은 단정하지 않음'}
  ];
  const results=cases.map(c=>{
    const run=env.run(c.name), item={id:'ctx-'+c.name,kind:c.kind,text:c.text,source:source(c.text),fact_ids:[]};
    run.flow.context(context(run.listing,{assessment:'sufficient',reason:'주어진 현장 포인트가 전략 선택에 충분',status:'not_needed',questions:[],items:[item]}));
    run.strategy.primary_target.text=c.target;run.strategy.hook.text=c.hook;run.strategy.sections[0].direction=c.direction;
    run.strategy.context_refs=[{id:item.id,snapshot:item,usage:['primary_target','hook','sections'],reason:'이 매물에서 제공된 현장 관심사를 반영'}];
    run.flow.propose(run.strategy);confirm(run.flow);
    return {facts:hash(run.flow.read('facts.json')),strategy:run.flow.read('strategy.json')};
  });
  assert.equal(results[0].facts,results[1].facts);
  assert.notEqual(results[0].strategy.primary_target.text,results[1].strategy.primary_target.text);
  assert.notEqual(results[0].strategy.hook.text,results[1].strategy.hook.text);
  assert.notEqual(results[0].strategy.sections[0].direction,results[1].strategy.sections[0].direction);
});
