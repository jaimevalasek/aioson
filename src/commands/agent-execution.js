'use strict';
const path=require('node:path');
const {initManifest,loadManifest,resolveAgentExecution}=require('../agent-execution/manifest');
const {dispatch,readState}=require('../agent-execution/dispatcher');
const {openRuntimeDb,getExecutionSnapshot,listExecutionEvents}=require('../runtime-store');
async function resolveAllAgents(manifest,catalogLoader){
 const entries=await Promise.all(Object.keys(manifest.agents).map(async id=>[id,await resolveAgentExecution(manifest,id,{}, {catalogLoader})]));
 return Object.fromEntries(entries);
}
function resolutionErrors(resolutions){
 return Object.entries(resolutions).filter(([,value])=>!value.ok).map(([id,value])=>({path:`$.agents.${id}.model`,message:value.reason,candidates:value.candidates||[],supported:value.supported||[]}));
}
async function runAgentExecution({args,options={},logger,catalogLoader}){
 const projectDir=path.resolve(process.cwd(),args[0]||'.'); const sub=options.sub||'show'; const feature=String(options.feature||options.slug||'').trim();
 if(!feature)return {ok:false,reason:'feature_required',message:'Use --feature=<slug>'};
 if(sub==='init'){const created=await initManifest(projectDir,feature,String(options.host||'codex')); const result={ok:true,feature,path:path.relative(projectDir,created.path),digest:created.digest,manifest:created.manifest,availability:'validated_at_dispatch'}; if(!options.json)logger.log(`Agent execution manifest: ${result.path}\nValidate: aioson agent:execution:validate . --feature=${feature}`); return result;}
 const loaded=await loadManifest(projectDir,feature);
 if(sub==='validate'){
  let resolutions={};let errors=loaded.errors||[];
  if(loaded.exists&&loaded.ok){resolutions=await resolveAllAgents(loaded.manifest,catalogLoader);errors=resolutionErrors(resolutions)}
  const result={ok:Boolean(loaded.exists&&loaded.ok&&!errors.length),feature,path:path.relative(projectDir,loaded.path),legacy:!loaded.exists,digest:loaded.digest||null,errors,resolutions,availability:'validated_at_dispatch'};
  if(!options.json)(result.ok?logger.log(`Valid: ${result.path} (models resolved against the current runtime catalog).`):logger.error(JSON.stringify(result.errors,null,2)));return result;
 }
 if(sub==='show'){
  if(!loaded.exists)return {ok:true,legacy:true,feature,path:path.relative(projectDir,loaded.path),message:'Manifest absent; legacy configured-default remains active.'};
  if(!loaded.ok)return {ok:false,feature,errors:loaded.errors};
  const agents=await resolveAllAgents(loaded.manifest,catalogLoader);const errors=resolutionErrors(agents);
  return {ok:!errors.length,feature,path:path.relative(projectDir,loaded.path),digest:loaded.digest,agents,errors,availability:'validated_at_dispatch'};
 }
 if(sub==='dispatch')return dispatch({projectDir,feature,agent:options.agent||'dev',runId:options['run-id'],promptPath:options.prompt,catalogLoader});
 if(sub==='resume'){const state=await readState(projectDir,feature);if(!state)return {ok:false,reason:'state_missing'};return dispatch({projectDir,feature,agent:options.agent||state.attempts.at(-1)?.agent||'dev',runId:state.run_id,promptPath:options.prompt,catalogLoader});}
 if(sub==='status'){const {db}=await openRuntimeDb(projectDir);try{return{ok:true,schema_version:1,feature,runs:getExecutionSnapshot(db,{feature,agent:options.agent,state:options.state,limit:options.limit})}}finally{db.close()}}
 if(sub==='events'){const state=await readState(projectDir,feature);const run=String(options.run||state?.attempts?.at(-1)?.telemetry_run_id||'');if(!run)return{ok:false,reason:'telemetry_run_required'};const {db}=await openRuntimeDb(projectDir);try{const owned=getExecutionSnapshot(db,{feature,limit:200}).some(item=>item.telemetry_run_id===run);if(!owned)return{ok:false,reason:'telemetry_run_not_found'};return{ok:true,schema_version:1,trust:'sanitized_untrusted_output',feature,telemetry_run_id:run,...listExecutionEvents(db,run,{after:options.after,limit:options.limit})}}finally{db.close()}}
 return {ok:false,reason:'invalid_subcommand',valid:['init','validate','show','dispatch','resume','status','events']};
}
module.exports={runAgentExecution};
