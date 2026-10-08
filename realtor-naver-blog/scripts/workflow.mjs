#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import {readJSON, requireThat} from './lib/contracts.mjs';
import {Workflow, getStyle, saveStyle} from './lib/workflow.mjs';
import {readProfile} from './profile.mjs';

const [command, ...argv] = process.argv.slice(2);
const args = {};
try {
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i].startsWith('--') || !argv[i + 1]) throw new Error('expected --key value');
  args[argv[i].slice(2)] = argv[i + 1];
}
  const profile = path.resolve(args.profile || path.join(os.homedir(), '.codex/naver-realtor-blog/profile.yaml'));
  const data = () => readJSON(args.file);
  const office = () => readProfile(profile).office ?? {};
  let result;
  if (command === 'style-get') result = {style: getStyle(path.dirname(profile), args.blog)};
  else if (command === 'style-save') result = {style: saveStyle(path.dirname(profile), data(), args['change-request'])};
  else {
    requireThat(args.run, '--run is required');
    const flow = new Workflow(args.run);
    if (command === 'facts') result = flow.listing(data());
    else if (command === 'propose') result = flow.propose(data());
    else if (command === 'approve') result = flow.approve(data());
    else if (command === 'check-approved') result = flow.approved();
    else if (command === 'prepare') result = flow.prepare(data(), office(), args.blog);
    else if (command === 'begin') result = flow.begin(office());
    else if (command === 'record') result = flow.record(data());
    else if (command === 'reconcile') result = flow.reconcile(data());
    else if (command === 'status') result = flow.state();
    else throw new Error('Commands: facts propose approve check-approved prepare begin record reconcile status style-get style-save');
  }
  process.stdout.write(JSON.stringify({ok:true, ...result}, null, 2) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ok:false, error:error.message}) + '\n');
  process.exitCode = 1;
}
