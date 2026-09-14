'use strict';

const { parseFrontmatter } = require('../preflight-engine');
const { parsePlanPhases, planSourceStatus, withoutFences, readProjectFile } = require('./plan-document');

const COMMAND = /(?:\b(?:node|npm|npx|pnpm|yarn|bun|cargo|pytest|python3?|go|dotnet|make|mvn|gradle|php|composer|ruby|bundle|rspec|pest|vitest|jest|playwright|ctest|cmake|swift|xcodebuild|bash|sh|pwsh|powershell|aioson)\b[ \t]+[^\n]+|\.\.?[/\\][\w./\\-]+)/i;
const AC = /\bAC-[a-z0-9]+(?:-[a-z0-9]+)*\b/gi;

async function validatePlanContract({ targetDir, slug, content, acceptance, delivery }) {
  const meta = parseFrontmatter(content || '');
  const strict = String(meta.plan_contract || '') === '2';
  const artifact = `.aioson/context/implementation-plan-${slug}.md`;
  const issues = [];
  const add = (check, message) => issues.push({ stage: 'plan', check, message, artifact });
  const phases = parsePlanPhases(content);
  if (phases.length === 0) add('plan_phases_missing', 'Declare at least one numbered implementation phase');
  let scripts = null;
  try { scripts = JSON.parse(await readProjectFile(targetDir, 'package.json')).scripts || {}; }
  catch (error) { if (error.code !== 'ENOENT') add('plan_package_unreadable', 'Cannot inspect package.json verification scripts'); }
  const verifyScripts = (command, label, phaseBody = '') => {
    if (!scripts) return;
    for (const match of String(command || '').matchAll(/\bnpm\s+(?:run(?:-script)?\s+([\w:.-]+)|(test|start))\b/g)) {
      const name = match[1] || match[2];
      const planned = new RegExp('^\\s*[-*]?\\s*Create script:\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)', 'm').test(phaseBody);
      if (!scripts[name] && !planned) add('plan_script_unknown', `${label}: npm script ${name} is absent; use an inspected command or explicitly plan Create script: ${name}`);
    }
  };
  const byId = new Map();
  const declared = new Set((acceptance.rows || []).map(row => row.ac.toUpperCase()));
  const covered = new Set();
  for (const phase of phases) {
    if (byId.has(phase.id)) add('plan_phase_duplicate', `Phase ${phase.id} is declared more than once`);
    byId.set(phase.id, phase);
    const criteria = phase.body.match(AC) || [];
    for (const id of criteria) {
      if (!declared.has(id.toUpperCase())) add('plan_ac_unknown', `Phase ${phase.id} cites undeclared ${id}`);
      else covered.add(id.toUpperCase());
    }
    const verification = phase.body.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:Verification|Verifica[cç][aã]o)(?:\*\*)?\s*:\s*(.+)$/im);
    if (!verification || !COMMAND.test(verification[1])) add('plan_phase_verification_missing', `Phase ${phase.id} needs an explicit automated verification command`);
    verifyScripts(verification?.[1], `Phase ${phase.id}`, phase.body);
    const done = phase.body.match(/^\s*(?:[-*]\s*)?(?:Done when|Conclu[ií]d[ao] quando|Pront[ao] quando)\s*:\s*(.+)$/im);
    if (!done || done[1].trim().length < 10) add('plan_phase_done_missing', `Phase ${phase.id} needs an observable completion condition`);
  }
  for (const id of declared) if (!covered.has(id)) add('plan_ac_uncovered', `${id} has no implementation phase`);
  for (const row of delivery.rows || []) {
    const id = /^(?:(?:Phase|Fase)\s+)?(\d+)(?:\b|$)/i.exec(row.phase || '')?.[1];
    if (!id || !byId.has(String(Number(id)))) add('plan_phase_unknown', `${row.cap} refers to absent phase ${row.phase}`);
    if (!COMMAND.test(row.verification || '')) add('plan_verification_unknown', `${row.cap} needs an executable verification mechanism`);
    verifyScripts(row.verification, row.cap, byId.get(String(Number(id)))?.body);
  }
  const source = await planSourceStatus(targetDir, slug, content);
  if (strict && source.freshness !== 'current') add(source.stale ? 'plan_source_stale' : 'plan_source_unbound', 'Bind the reconciled plan to the current PRD with plan:bind; do not rebind before reviewing the product delta');
  // Legacy consumers keep their previous contract; diagnostic callers expose
  // these findings without turning historical documents into blockers.
  return { version: strict ? 2 : 1, phases, source, findings: strict ? issues : [], warnings: strict ? [] : issues };
}

function plannedRuntimeContract(content, slug) {
  const meta = parseFrontmatter(content || '');
  if (meta.runtime_contract !== 'required') return false;
  const contract = `.aioson/plans/${slug}/harness-contract.json`;
  return parsePlanPhases(content).some(phase => phase.body.includes(contract)
    && ['RG-build', 'RG-migrate', 'RG-boot', 'RG-smoke'].every(id => phase.body.includes(id))
    && /aioson\s+harness:check/.test(phase.body));
}

function planHasMigrations(content) {
  return /(?:^|[\s`|,/])(?:[\w.-]+\/)*(?:migrations?|prisma)\/[\w./-]+|\b[\w/-]+\.prisma\b/im.test(withoutFences(content));
}

module.exports = { validatePlanContract, plannedRuntimeContract, planHasMigrations };
