'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const adapters={antigravity:require('./adapters/antigravity'),claude:require('./adapters/claude'),codex:require('./adapters/codex'),opencode:require('./adapters/opencode'),kimi:require('./adapters/kimi'),qwen:require('./adapters/qwen'),grok:require('./adapters/grok')};
const {assertFeatureSlug,loadManifest,resolveExecutionEntry,resolveExecutionTarget}=require('./manifest');
const {safeReportPath,validateReport}=require('./reports');
const {createTelemetryBridge}=require('./telemetry-bridge');
const TERMINAL=['approved','failed','cancelled'];const LEASE_MS=30000;
function statePath(projectDir,feature){return path.join(projectDir,'.aioson','context',`agent-execution-state-${assertFeatureSlug(feature)}.json`)}
function leasePath(projectDir,feature){return `${statePath(projectDir,feature)}.lock`}
async function atomic(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`);await fs.rename(tmp,file)}
function stateWriteLockPath(file){return `${file}.write-lock`}
async function ownsLease(lease){
 if(!lease)return false;
 try{
  const current=JSON.parse(await fs.readFile(lease.file,'utf8'));
  return current.owner===lease.owner&&Number(current.expires_at)>Date.now();
 }catch(error){
  if(error.code==='ENOENT'||error.name==='SyntaxError')return false;
  throw error;
 }
}
async function acquireStateWriteLock(file,lease,{attempts=100,waitMs=10}={}){
 const lockFile=stateWriteLockPath(file);const owner=crypto.randomUUID();
 await fs.mkdir(path.dirname(lockFile),{recursive:true});
 if(!await ownsLease(lease))return null;
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const handle=await fs.open(lockFile,'wx');
   await handle.writeFile(JSON.stringify({owner,lease_owner:lease.owner,expires_at:Date.now()+5000}));
   await handle.close();
   if(!await ownsLease(lease)){
    await releaseStateWriteLock({file:lockFile,owner});
    return null;
   }
   return{file:lockFile,owner};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   try{
    const current=JSON.parse(await fs.readFile(lockFile,'utf8'));
    if(
     Number(current.expires_at)<=Date.now()
     && current.lease_owner!==lease.owner
     && await ownsLease(lease)
    ){
     const latest=JSON.parse(await fs.readFile(lockFile,'utf8'));
     if(latest.owner===current.owner&&latest.lease_owner===current.lease_owner){
      await fs.unlink(lockFile).catch(unlinkError=>{if(unlinkError.code!=='ENOENT')throw unlinkError});
     }
    }
   }catch(readError){
    if(readError.name==='SyntaxError'){
     const stat=await fs.stat(lockFile).catch(()=>null);
     if(stat&&Date.now()-stat.mtimeMs>LEASE_MS*2&&await ownsLease(lease)){
      await fs.unlink(lockFile).catch(()=>{});
     }
    }
    else if(readError.code!=='ENOENT')throw readError;
   }
   await new Promise(resolve=>setTimeout(resolve,waitMs));
  }
 }
 return null;
}
async function releaseStateWriteLock(lock){
 if(!lock)return;
 try{
  const current=JSON.parse(await fs.readFile(lock.file,'utf8'));
  if(current.owner===lock.owner)await fs.unlink(lock.file);
 }catch(error){
  if(error.code!=='ENOENT'&&error.name!=='SyntaxError')throw error;
 }
}
async function persistState(projectDir,feature,state,lease){
 const file=statePath(projectDir,feature);
 const writeLock=await acquireStateWriteLock(file,lease);
 if(!writeLock)return{
  ok:false,
  reason:await ownsLease(lease)?'state_write_lock_timeout':'lease_lost'
 };
 try{
  await atomic(file,{...state,lease_fence:lease.owner});
  return{ok:true};
 }finally{
  await releaseStateWriteLock(writeLock);
 }
}
async function readState(projectDir,feature){try{return JSON.parse(await fs.readFile(statePath(projectDir,feature),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function acquireLease(projectDir,feature){const file=leasePath(projectDir,feature);await fs.mkdir(path.dirname(file),{recursive:true});const owner=crypto.randomUUID();for(let pass=0;pass<2;pass++){try{const h=await fs.open(file,'wx');await h.writeFile(JSON.stringify({owner,expires_at:Date.now()+LEASE_MS}));await h.close();return{file,owner}}catch(e){if(e.code!=='EEXIST')throw e;try{const current=JSON.parse(await fs.readFile(file,'utf8'));if(current.expires_at>Date.now())return null;await fs.unlink(file)}catch(readError){if(readError.code!=='ENOENT'&&readError.name!=='SyntaxError')throw readError}}}return null}
async function renewLease(lease){
 if(!lease)return false;
 let handle;
 const expires_at=Date.now()+LEASE_MS;
 try{
  handle=await fs.open(lease.file,'r+');
  const current=JSON.parse(await handle.readFile('utf8'));
  if(current.owner!==lease.owner)return false;
  const payload=Buffer.from(JSON.stringify({owner:lease.owner,expires_at}));
  await handle.write(payload,0,payload.length,0);
  await handle.truncate(payload.length);
  await handle.sync();
 }catch(e){
  if(e.code==='ENOENT'||e.name==='SyntaxError')return false;
  throw e;
 }finally{
  if(handle)await handle.close();
 }
 try{
  const confirmed=JSON.parse(await fs.readFile(lease.file,'utf8'));
  return confirmed.owner===lease.owner&&confirmed.expires_at===expires_at;
 }catch(e){
  if(e.code==='ENOENT'||e.name==='SyntaxError')return false;
  throw e;
 }
}
async function releaseLease(lease){if(!lease)return;try{const current=JSON.parse(await fs.readFile(lease.file,'utf8'));if(current.owner===lease.owner)await fs.unlink(lease.file)}catch(e){if(e.code!=='ENOENT')throw e}}
function createLeaseMonitor(lease,{renew=renewLease,intervalMs=Math.floor(LEASE_MS/3)}={}){
 const controller=new AbortController();let lost=false;let error=null;let running=false;let inFlight=Promise.resolve();
 const lose=(reason)=>{if(lost)return;lost=true;error=reason||null;controller.abort(reason)};
 const tick=()=>{if(lost||running)return;running=true;inFlight=Promise.resolve().then(()=>renew(lease)).then(ok=>{if(!ok)lose(new Error('lease ownership lost'))}).catch(lose).finally(()=>{running=false})};
 const timer=setInterval(tick,Math.max(1,Number(intervalMs)||1));timer.unref?.();
 return{signal:controller.signal,get lost(){return lost},get error(){return error},async stop(){clearInterval(timer);await inFlight}};
}
async function safePromptPath(projectDir,promptPath){const root=await fs.realpath(projectDir);const candidate=path.resolve(root,promptPath||'.aioson/context/dev-state.md');const real=await fs.realpath(candidate);if(real!==root&&!real.startsWith(root+path.sep))throw new Error('prompt_path escapes project workspace');const stat=await fs.stat(real);if(!stat.isFile())throw new Error('prompt_path must be a regular file');return real}
async function resolveWritableRoots(projectDir,roots=[]){const resolved=[];for(const configured of roots){if(typeof configured!=='string'||!configured.trim())throw new Error('writable_root must be a non-empty path');if(configured.split(/[\\/]+/).includes('..'))throw new Error(`writable_root traversal is forbidden: ${configured}`);const candidate=path.resolve(projectDir,configured);let real;try{real=await fs.realpath(candidate)}catch{throw new Error(`writable_root does not exist: ${configured}`)}if(!(await fs.stat(real)).isDirectory())throw new Error(`writable_root is not a directory: ${configured}`);if(!resolved.includes(real))resolved.push(real)}return resolved}
function capacitySequence(manifest,resolved){const policy=manifest.capacity_policy;return resolved.fallbacks.filter(item=>item.authorized_profile===true||(policy.strategy==='fallback'&&(policy.allow_cross_host===true||item.host===resolved.host)))}
function applyCapacityPolicy(manifest,resolved,attemptCount=0){const p=manifest.capacity_policy;if(attemptCount>=p.max_attempts)return{action:'pause',reason:'capacity_limit'};if(p.strategy==='fallback'){const sequence=capacitySequence(manifest,resolved);return sequence.length?{action:'fallback',sequence}:{action:'pause',reason:'no_authorized_fallback'}}if(p.strategy==='retry'||p.strategy==='wait')return{action:p.strategy,backoff_ms:p.backoff_ms};return{action:'pause'}}
function fallbackReasonCategory(reason){return ['capacity','rate_limit','quota_exceeded','credits_exhausted','billing_unavailable'].includes(reason)?'capacity':['auth','connection','service_unavailable','provider_unavailable','engine_error','executable_not_found','unsupported_host','unsupported_capability','unsupported_reasoning_effort','host_capability_missing','invalid_model','model_not_found','catalog_unavailable','unsupported_model_catalog','unproductive_loop'].includes(reason)?'unavailable':null}
function fallbackActivates(fallback,reason){const category=fallbackReasonCategory(reason);const allowed=Array.isArray(fallback?.on)&&fallback.on.length?fallback.on:['capacity'];return Boolean(category&&allowed.includes(category))}
async function waitWithSignal(wait,ms,signal){
 if(!ms)return true;
 if(signal?.aborted)return false;
 let onAbort;
 const aborted=new Promise(resolve=>{onAbort=()=>resolve(false);signal?.addEventListener('abort',onAbort,{once:true})});
 try{
  return await Promise.race([
   Promise.resolve().then(()=>wait(ms)).then(()=>true),
   aborted
  ]);
 }finally{
  signal?.removeEventListener('abort',onAbort);
 }
}
async function executeWithCapacityPolicy({manifest,resolved,input,adapterRegistry=adapters,catalogLoader,validateCandidate,wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const history=[];
  const candidates=[
    {entry:resolved,fallback:null},
    ...capacitySequence(manifest,resolved).map(item=>{const crossHost=item.host!==resolved.host;const hasEffort=Object.prototype.hasOwnProperty.call(item,'reasoning_effort');return{fallback:item,entry:{...resolved,ok:false,host:item.host,model:item.model,model_requested:undefined,routing_profile:item.routing_profile||null,reasoning_effort:hasEffort?item.reasoning_effort:(crossHost?undefined:resolved.reasoning_effort),...(crossHost?{reasoning_effort_verification:undefined}:{})}};})
  ];
  let index=0;
  for(let count=0;count<Math.max(manifest.capacity_policy.max_attempts,candidates.length);count++){
    if(input.signal?.aborted)return{ok:false,reason:input.abortReason||'aborted',history};
    let candidate=candidates[index].entry;
    if(!candidate.ok){
      candidate=await resolveExecutionEntry(candidate,{catalogLoader});
      candidates[index].entry=candidate;
      if(!candidate.ok){
        history.push({attempt:count+1,host:candidate.host,model_requested:candidate.model_requested||candidate.model,model:null,reason:candidate.reason});
        const next=candidates[index+1];
        if(next&&fallbackActivates(next.fallback,candidate.reason)){index+=1;continue}
        return{ok:false,reason:candidate.reason,candidates:candidate.candidates||[],history};
      }
    }
    // Runtime constraints apply to the resolved identity of EVERY attempt,
    // including a backup selected inside the capacity policy.
    const rejection = validateCandidate ? await validateCandidate(candidate) : null;
    if (rejection) {
      history.push({attempt:count+1,host:candidate.host,model_requested:candidate.model_requested,model:candidate.model,reason:rejection});
      return {ok:false,reason:rejection,host:candidate.host,model:candidate.model,history};
    }
    const adapter=adapterRegistry[candidate.host];
    if(!adapter){const reason='unsupported_host';history.push({attempt:count+1,host:candidate.host,model_requested:candidate.model_requested,model:candidate.model,reason});const next=candidates[index+1];if(next&&fallbackActivates(next.fallback,reason)){index+=1;continue}return{ok:false,reason,history}}
    const prompt_text=String(input.prompt_text||'')
      .replace(/host=[^,\n]+/,`host=${candidate.host}`)
      .replace(/model_requested=[^,\n]+/,`model_requested=${candidate.model_requested}`)
      .replace(/model_resolved=[^,\n]+/,`model_resolved=${candidate.model}`)
      .replace(/model_resolution_strategy=[^,\n]+/,`model_resolution_strategy=${candidate.model_resolution_strategy}`)
      .replace(/reasoning_effort=[^,\n]+/,`reasoning_effort=${candidate.reasoning_effort||'null'}`);
    const attemptStartedAt = new Date().toISOString();
    const context_budget = input.getContextBudget ? await input.getContextBudget(candidate) : input.context_budget;
    const budgetPrompt = context_budget ? `\n\nCONTEXT QUALITY BUDGET: keep this unit below ${context_budget.max_tokens} tokens of active context. This is a quality ceiling even when the model supports a larger window. Read only unit-owned code and selected rules; use targeted excerpts and concise tool output. Save verified progress on disk. If work cannot fit, report the remaining slice and preserve existing changes; never reread all phases or redo completed work.\n` : '';
    await input.onAttemptStart?.({ attempt: count + 1, host: candidate.host, model: candidate.model, routing_profile: candidate.routing_profile || null, started_at: attemptStartedAt, context_budget: context_budget || null });
    let result;
    try {
      result=context_budget && Math.ceil(Buffer.byteLength(prompt_text + budgetPrompt) / 2) > context_budget.max_tokens * 0.5
        ? { ok: false, reason: 'context_prompt_over_budget', context_budget }
        : await adapter.execute({...input,context_budget,prompt_text:prompt_text + budgetPrompt,mode:candidate.mode,model:candidate.model,reasoning_effort:candidate.reasoning_effort,onStructuredEvent:input.createStructuredObserver?.(candidate) || input.onStructuredEvent,
        onUsage: usage => input.onUsage?.(usage, candidate, count + 1)
      });
    } catch (error) {
      result = { ok: false, reason: 'engine_error', error: error.message };
    }
    const attempt = {attempt:count+1,host:candidate.host,model_requested:candidate.model_requested,model:candidate.model,model_resolution_strategy:candidate.model_resolution_strategy,reasoning_effort:candidate.reasoning_effort,routing_profile:candidate.routing_profile||null,reason:result.reason||null,started_at:attemptStartedAt,finished_at:new Date().toISOString(),usage:result.usage||null,context_budget:result.context_budget||context_budget||null};
    history.push(attempt);
    await input.onAttemptResult?.(attempt);
    if(result.ok)return{...result,host:candidate.host,model:candidate.model,model_requested:candidate.model_requested,model_resolution_strategy:candidate.model_resolution_strategy,reasoning_effort:candidate.reasoning_effort,routing_profile:candidate.routing_profile||null,history};
    const next=candidates[index+1];
    if(next&&fallbackActivates(next.fallback,result.reason)){index+=1;continue}
    if(result.reason!=='capacity')return{...result,history};
    const decision=applyCapacityPolicy(manifest,resolved,count);
    if(decision.action==='pause')return{ok:false,reason:decision.reason||'capacity',history};
    if(decision.action==='fallback'){
      return{ok:false,reason:'fallback_exhausted',history};
    }else if(decision.action==='wait'||decision.action==='retry'){
      if(decision.backoff_ms&&!await waitWithSignal(wait,decision.backoff_ms,input.signal)){
        return{ok:false,reason:input.abortReason||'aborted',history};
      }
    }
  }
  return{ok:false,reason:'capacity_limit',history};
}
function buildExecutionPrompt(promptText,expected,reportPath){
 const laneContract=expected.lane
  ? `\nDevelopment lane: ${expected.lane}. You may modify only these declared write paths: ${JSON.stringify(expected.write_paths)}. The required report${expected.progress_notes ? ` and progress notes at ${expected.progress_notes}` : ''} are bookkeeping exceptions; they do not expand source ownership.\nThe report must also include lane=${expected.lane}, write_paths=${JSON.stringify(expected.write_paths)}.`
  : '';
 return `${promptText}\n\nAIOSON EXECUTION CONTRACT\nComplete the requested agent work, then write exactly one JSON report to: ${reportPath}${laneContract}\nThe report must include: version=1, feature=${expected.feature}, run_id=${expected.run_id}, attempt_id=${expected.attempt_id}, agent=${expected.agent}, host=${expected.host}, model_requested=${expected.model_requested}, model_resolved=${expected.model_resolved}, model_resolution_strategy=${expected.model_resolution_strategy}, reasoning_effort=${expected.reasoning_effort||'null'}, manifest_digest=${expected.manifest_digest}, writable_roots=${JSON.stringify(expected.writable_roots)}, started_at, finished_at, verdict (PASS|FAIL|BLOCKED), findings[], evidence[]. Do not report PASS unless the work and verification completed.`;
}
async function readBoundReport(projectDir,relative,expected){const file=safeReportPath(projectDir,relative);let report;try{report=JSON.parse(await fs.readFile(file,'utf8'))}catch(error){return{ok:false,reason:error.code==='ENOENT'?'report_missing':'report_invalid_json',error:error.message}}const validation=validateReport(report,expected);return validation.ok?{ok:true,file,report}:{ok:false,reason:'report_binding_invalid',errors:validation.errors}}
function resumeCommand(feature,lane){return `aioson agent:execution:resume . --feature=${feature}${lane?` --lane=${lane}`:''}`}
async function dispatch({projectDir,feature,agent='dev',lane=null,runId,promptPath,adapterRegistry=adapters,catalogLoader,timeout=600000,renewLeaseFn=renewLease,leaseRenewalIntervalMs=Math.floor(LEASE_MS/3)}){
 const lease=await acquireLease(projectDir,feature);if(!lease)return{ok:false,status:'paused',reason:'lease_held',resume_command:resumeCommand(feature,lane)};
 const leaseMonitor=createLeaseMonitor(lease,{renew:renewLeaseFn,intervalMs:leaseRenewalIntervalMs});
 try{const loaded=await loadManifest(projectDir,feature);if(!loaded.exists)return{ok:false,status:'paused',reason:'manifest_missing',resume_command:resumeCommand(feature,lane)};if(!loaded.ok)return{ok:false,status:'paused',reason:'manifest_invalid',errors:loaded.errors};
  const configured=resolveExecutionTarget(loaded.manifest,{agent,lane});
  if(!configured)return{ok:false,status:'paused',reason:lane?'development_lane_unknown':'agent_unknown',agent,lane};
  const effectiveAgent=lane?'dev':agent;const target=lane?`dev:${lane}`:agent;
  if(configured.enabled===false)return{ok:true,status:'skipped',reason:lane?'development_lane_disabled':'agent_disabled',feature,agent,lane,idempotent:true};
  let state=await readState(projectDir,feature);if(state&&state.manifest_digest!==loaded.digest&&!TERMINAL.includes(state.status))return{ok:false,status:'paused',reason:'manifest_digest_changed',expected:state.manifest_digest,actual:loaded.digest};if(state?.completed_agents?.includes(target))return{ok:true,status:state.status,idempotent:true,state};
  let safePrompt;try{safePrompt=await safePromptPath(projectDir,promptPath||configured.prompt)}catch(error){return{ok:false,status:'paused',reason:'invalid_prompt_path',error:error.message}}
  const resolved=await resolveExecutionEntry(configured,{catalogLoader});const run_id=runId||state?.run_id||crypto.randomUUID();const attempt_id=crypto.randomUUID();let writableRoots;try{writableRoots=await resolveWritableRoots(projectDir,configured.writable_roots)}catch(error){return{ok:false,status:'paused',reason:'invalid_writable_root',error:error.message}}let reportRelative;let reportFile;try{reportRelative=configured.report.replace(/\{run_id\}/g,run_id);reportFile=safeReportPath(projectDir,reportRelative)}catch(error){return{ok:false,status:'paused',reason:'invalid_report_path',error:error.message}}
  const expected={feature,run_id,attempt_id,agent:effectiveAgent,lane:lane||undefined,host:resolved.host,model_requested:resolved.model_requested||configured.model,model_resolved:resolved.model_resolved||resolved.model||configured.model,model_resolution_strategy:resolved.model_resolution_strategy||'unresolved',reasoning_effort:resolved.reasoning_effort||configured.reasoning_effort||null,manifest_digest:loaded.digest,writable_roots:writableRoots,write_paths:lane?configured.write_paths:undefined,status:'running'};const promptText=await fs.readFile(safePrompt,'utf8');const executionInput={mode:configured.mode,model:expected.model_resolved,reasoning_effort:expected.reasoning_effort,writable_roots:writableRoots,cwd:projectDir,prompt_text:buildExecutionPrompt(promptText,expected,path.relative(projectDir,reportFile)),timeout,signal:leaseMonitor.signal,abortReason:'lease_lost',
  // A dispatched agent implements: it runs unattended (the registry's flag), never with the host's prompting default.
  sandbox_mode:'workspace-write'};
  const correlation={feature,agent:target,lane:lane||undefined,dispatcher_run_id:run_id,attempt_id,host:resolved.host,model:expected.model_resolved,model_requested:expected.model_requested,model_resolved:expected.model_resolved,reasoning_effort:expected.reasoning_effort,model_resolution_strategy:expected.model_resolution_strategy,catalog_source:resolved.catalog_source};const telemetry=await createTelemetryBridge(projectDir,correlation);
  if(leaseMonitor.lost){telemetry.transition('paused','lease_lost');telemetry.close();return{ok:false,status:'paused',reason:'lease_lost',resume_command:resumeCommand(feature,lane)}}
  const attempt={...expected,target,telemetry_run_id:telemetry.run.telemetry_run_id,status:'running',reason:null,report:reportRelative};state={version:1,feature,run_id,manifest_path:path.relative(projectDir,loaded.path),manifest_digest:loaded.digest,status:'running',reason:null,attempts:[...(state?.attempts||[]),attempt],completed_agents:state?.completed_agents||[],updated_at:new Date().toISOString()};const initialPersist=await persistState(projectDir,feature,state,lease);if(!initialPersist.ok){telemetry.transition('paused',initialPersist.reason);telemetry.close();return{ok:false,status:'paused',reason:initialPersist.reason,state:{...state,status:'paused',reason:initialPersist.reason},resume_command:resumeCommand(feature,lane)}}
  let spawnCount=0;Object.assign(executionInput,{onSpawn:(pid,at)=>telemetry.onSpawn(pid,at,{replace:spawnCount++>0}),onStdout:d=>telemetry.output('stdout',d),onStderr:d=>telemetry.output('stderr',d)});
  const execution=await executeWithCapacityPolicy({manifest:loaded.manifest,resolved,input:executionInput,adapterRegistry,catalogLoader});if(leaseMonitor.lost){telemetry.transition('paused','lease_lost');telemetry.close();return{ok:false,status:'paused',reason:'lease_lost',execution,state:{...state,status:'paused',reason:'lease_lost'},resume_command:resumeCommand(feature,lane)}}attempt.execution_history=execution.history||[];for(const item of attempt.execution_history){if(item.attempt>1)telemetry.event(item.host===resolved.host?'retry':'fallback',`${item.host}/${item.model}`,{attempt:item.attempt,reason:item.reason})}attempt.model_requested=execution.model_requested||expected.model_requested;attempt.model_resolved=execution.model||expected.model_resolved;attempt.model_resolution_strategy=execution.model_resolution_strategy||expected.model_resolution_strategy;attempt.reasoning_effort=execution.reasoning_effort||expected.reasoning_effort;attempt.host_resolved=execution.host||resolved.host;if(!execution.ok){attempt.status='blocked';attempt.reason=execution.reason;state.status='paused';state.reason=execution.reason;state.updated_at=new Date().toISOString();const failurePersist=await persistState(projectDir,feature,state,lease);if(!failurePersist.ok){telemetry.transition('paused',failurePersist.reason);telemetry.close();return{ok:false,status:'paused',reason:failurePersist.reason,execution,state:{...state,status:'paused',reason:failurePersist.reason},resume_command:resumeCommand(feature,lane)}}if(execution.reason==='timeout')telemetry.event('timeout','Execution timeout');telemetry.transition('paused',execution.reason);telemetry.close();return{ok:false,status:'paused',reason:execution.reason,candidates:execution.candidates||[],execution,state,resume_command:resumeCommand(feature,lane)}}
  telemetry.transition('waiting_report');
  const boundExpected={...expected,host:attempt.host_resolved,model_requested:attempt.model_requested,model_resolved:attempt.model_resolved,model_resolution_strategy:attempt.model_resolution_strategy,reasoning_effort:attempt.reasoning_effort,status:'running'};const reportResult=await readBoundReport(projectDir,reportRelative,boundExpected);if(leaseMonitor.lost){telemetry.transition('paused','lease_lost');telemetry.close();return{ok:false,status:'paused',reason:'lease_lost',report:reportResult,state:{...state,status:'paused',reason:'lease_lost'},resume_command:resumeCommand(feature,lane)}}if(!reportResult.ok){attempt.status='blocked';attempt.reason=reportResult.reason;state.status='paused';state.reason=reportResult.reason;state.updated_at=new Date().toISOString();const reportFailurePersist=await persistState(projectDir,feature,state,lease);if(!reportFailurePersist.ok){telemetry.transition('paused',reportFailurePersist.reason);telemetry.close();return{ok:false,status:'paused',reason:reportFailurePersist.reason,report:reportResult,state:{...state,status:'paused',reason:reportFailurePersist.reason},resume_command:resumeCommand(feature,lane)}}telemetry.transition('paused',reportResult.reason);telemetry.close();return{ok:false,status:'paused',reason:reportResult.reason,report:reportResult,state,resume_command:resumeCommand(feature,lane)}}
  const digest=crypto.createHash('sha256').update(JSON.stringify(reportResult.report)).digest('hex');telemetry.report(reportResult.report,reportRelative,digest);attempt.status='completed';attempt.verdict=reportResult.report.verdict;state.status=reportResult.report.verdict==='PASS'?'verification_planned':'correcting';if(reportResult.report.verdict==='PASS'&&!state.completed_agents.includes(target))state.completed_agents.push(target);state.updated_at=new Date().toISOString();const finalPersist=await persistState(projectDir,feature,state,lease);if(!finalPersist.ok){telemetry.transition('paused',finalPersist.reason);telemetry.close();return{ok:false,status:'paused',reason:finalPersist.reason,execution,report:reportResult.report,state:{...state,status:'paused',reason:finalPersist.reason},resume_command:resumeCommand(feature,lane)}}telemetry.transition(reportResult.report.verdict==='PASS'?'passed':reportResult.report.verdict==='FAIL'?'failed':'correcting');telemetry.close();return{ok:true,status:state.status,run_id,attempt_id,execution,report:reportResult.report,state};
 }finally{await leaseMonitor.stop();await releaseLease(lease)}
}
module.exports={acquireLease,acquireStateWriteLock,applyCapacityPolicy,buildExecutionPrompt,capacitySequence,dispatch,executeWithCapacityPolicy,fallbackActivates,fallbackReasonCategory,leasePath,ownsLease,persistState,readBoundReport,readState,releaseLease,releaseStateWriteLock,renewLease,resolveWritableRoots,safePromptPath,statePath,stateWriteLockPath,waitWithSignal};
