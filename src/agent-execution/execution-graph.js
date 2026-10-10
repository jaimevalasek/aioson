'use strict';

/**
 * execution:graph — the compiled execution plan drawn as the graph it is.
 *
 * Nodes are the units (lane units, integration units the session DEV runs
 * after the lanes), edges are the passage rules: the explicit `Depends on`
 * edges the planner declared (`after_dev` / `after_qa`), or — for a unit that
 * declares none — the wave barrier, rendered as implicit edges from every lane
 * unit of the nearest earlier wave. When a run state exists it is laid over
 * the nodes (dev/qa status, host, verdict) so the orchestrator reviews one
 * picture instead of two JSON documents. Deterministic; never a judgment.
 *
 * Formats: `json` (for a supervising client), `mermaid` (for a client that
 * renders it, and for a reader), `ascii` (the terminal).
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { readExecutionPlan, executionPlanRelative } = require('./execution-plan');
const { assertFeatureSlug } = require('./manifest');
const { projectSchedule, formatProjection, measuredDurations } = require('./schedule-projection');

const GRAPH_VERSION = 1;

function runStateRelative(feature) {
  return `.aioson/context/execution-state-${feature}.json`;
}

async function readRunState(projectDir, feature) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectDir, ...runStateRelative(feature).split('/')), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The barrier a unit without edges waits for: every lane unit of every
 * earlier wave. Drawn after transitive reduction — a source already reached
 * through another source (explicitly or through an earlier barrier) is not
 * drawn twice — so the picture stays readable and stays true to the engine.
 */
function implicitEdges(units, explicit) {
  const laneUnits = units.filter((unit) => unit.owner === 'lane');
  const adjacency = new Map(units.map((unit) => [unit.id, new Set()]));
  for (const edge of explicit) adjacency.get(edge.from)?.add(edge.to);
  const reaches = (from, to) => {
    const stack = [from];
    const seen = new Set();
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of adjacency.get(id) || []) stack.push(next);
    }
    return false;
  };
  const edges = [];
  for (const unit of [...units].sort((a, b) => a.wave - b.wave)) {
    if ((unit.depends_on || []).length > 0) continue;
    const sources = laneUnits.filter((other) => other.wave < unit.wave).map((other) => other.id);
    for (const source of sources.filter((s) => !sources.some((t) => t !== s && reaches(s, t)))) {
      edges.push({ from: source, to: unit.id, gate: 'after_qa', explicit: false });
      adjacency.get(source).add(unit.id);
    }
  }
  return edges;
}

function nodeStatus(unit, state) {
  if (!state) return null;
  const entry = state.units?.[unit.id];
  if (!entry) return null;
  if (unit.owner !== 'lane') return 'integration';
  return entry.status || 'pending';
}

function buildExecutionGraph({ plan, state = null }) {
  const units = plan.units || [];
  const explicit = plan.edges || [];
  const nodes = units.map((unit) => {
    const entry = state?.units?.[unit.id] || null;
    return {
      id: unit.id,
      kind: unit.owner === 'lane' ? 'unit' : 'integration',
      lane: unit.lane,
      wave: unit.wave,
      phase: unit.phase,
      files: unit.files.length,
      caps: unit.caps || [],
      depends_on: unit.depends_on || [],
      status: nodeStatus(unit, state),
      dev: entry && unit.owner === 'lane' ? { status: entry.dev?.status || 'pending', host: entry.dev?.host || null, model: entry.dev?.model || null, verdict: entry.dev?.verdict || null } : null,
      qa: entry && unit.owner === 'lane' ? { status: entry.qa?.status || 'pending', host: entry.qa?.host || null, model: entry.qa?.model || null, verdict: entry.qa?.verdict || null, findings: Array.isArray(entry.qa?.findings) ? entry.qa.findings.length : 0 } : null,
      decision: entry?.pending_decision ? { stage: entry.pending_decision.stage, reason: entry.pending_decision.reason } : null,
      messages: entry ? (entry.dev?.messages?.length || 0) + (entry.qa?.messages?.length || 0) : 0
    };
  });
  const edges = [...explicit.map((edge) => ({ from: edge.from, to: edge.to, gate: edge.gate, explicit: true })), ...implicitEdges(units, explicit)];
  const waves = (plan.waves || []).map((wave) => ({
    wave: wave.wave,
    units: wave.units,
    status: state?.waves?.find((w) => w.wave === wave.wave)?.status || null
  }));
  // A run applies the roles file's policy at runtime; the compiled value is
  // only what the plan declared.
  const runtime = state?.parallel || null;
  const measured = measuredDurations(state);
  const projection = projectSchedule(plan, measured ? { ...measured, maxConcurrent: runtime?.max_concurrent_lanes, source: `measured over ${measured.samples} attempt(s)` } : { maxConcurrent: runtime?.max_concurrent_lanes });
  return {
    version: GRAPH_VERSION,
    feature: plan.feature,
    scheduling: runtime?.scheduling === 'lanes' ? `lanes (${runtime.lane_gate || 'after_qa'})` : (plan.scheduling || (explicit.length > 0 ? 'dependencies' : 'waves')),
    projection,
    plan: { path: executionPlanRelative(plan.feature), generated_at: plan.generated_at || null, digest: plan.source?.plan_digest || null },
    run: state ? { run_id: state.run_id, status: state.status, reason: state.reason || null, current_wave: state.current_wave ?? null, decisions_pending: Object.values(state.units || {}).filter((u) => u.pending_decision).length } : null,
    parallel: runtime ? { max_concurrent_lanes: runtime.max_concurrent_lanes } : (plan.parallel || { max_concurrent_lanes: 1 }),
    waves,
    nodes,
    edges,
    integration: plan.integration || { owner: 'dev', units: [], role: null },
    summary: { nodes: nodes.length, lane_units: nodes.filter((n) => n.kind === 'unit').length, integration_units: nodes.filter((n) => n.kind === 'integration').length, edges: edges.length, explicit_edges: edges.filter((e) => e.explicit).length }
  };
}

// ─── mermaid ───

function mermaidId(id) {
  return String(id).replace(/[^A-Za-z0-9_]/g, '_');
}

function mermaidLabel(text) {
  return String(text).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
}

function nodeClass(node) {
  if (node.kind === 'integration') return 'integration';
  switch (node.status) {
    case 'passed':
      return node.qa?.status === 'failed' ? 'qa_failed' : 'passed';
    case 'running':
      return 'running';
    case 'decision_required':
      return 'decision';
    case 'skipped':
      return 'skipped';
    default:
      return 'pending';
  }
}

function stateLine(node) {
  if (node.kind === 'integration') return 'integration (session dev)';
  if (!node.dev) return 'not started';
  const dev = `dev ${node.dev.status}${node.dev.host ? ` ${node.dev.host}` : ''}`;
  const qa = node.qa && node.qa.status !== 'not_applicable' ? ` · qa ${node.qa.status}${node.qa.findings ? ` (${node.qa.findings})` : ''}` : '';
  const decision = node.decision ? ` · DECISION ${node.decision.stage}:${node.decision.reason}` : '';
  return `${dev}${qa}${decision}`;
}

function renderMermaid(graph) {
  const lines = ['flowchart TD'];
  for (const wave of graph.waves) {
    lines.push(`  subgraph wave_${wave.wave}["Wave ${wave.wave}${wave.status ? ` · ${wave.status}` : ''}"]`);
    for (const id of wave.units) {
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) continue;
      const label = [`${node.id}`, node.kind === 'unit' ? `${node.lane} · ${node.phase}` : `${node.phase}`, stateLine(node)].map(mermaidLabel).join('<br/>');
      lines.push(`    ${mermaidId(node.id)}["${label}"]`);
    }
    lines.push('  end');
  }
  for (const edge of graph.edges) {
    lines.push(edge.explicit
      ? `  ${mermaidId(edge.from)} -->|${edge.gate}| ${mermaidId(edge.to)}`
      : `  ${mermaidId(edge.from)} -.->|wave barrier| ${mermaidId(edge.to)}`);
  }
  lines.push(
    '  classDef pending fill:#f8fafc,stroke:#94a3b8,color:#334155',
    '  classDef running fill:#dbeafe,stroke:#2563eb,color:#1e3a8a',
    '  classDef passed fill:#dcfce7,stroke:#16a34a,color:#14532d',
    '  classDef qa_failed fill:#fef9c3,stroke:#ca8a04,color:#713f12',
    '  classDef decision fill:#fee2e2,stroke:#dc2626,color:#7f1d1d',
    '  classDef skipped fill:#f3f4f6,stroke:#9ca3af,color:#374151,stroke-dasharray:4 2',
    '  classDef integration fill:#fef3c7,stroke:#d97706,color:#78350f'
  );
  for (const node of graph.nodes) lines.push(`  class ${mermaidId(node.id)} ${nodeClass(node)}`);
  return `${lines.join('\n')}\n`;
}

// ─── ascii ───

const GLYPH = { pending: '○', running: '◐', passed: '●', decision_required: '✗', skipped: '–', integration: '◇' };

function renderAscii(graph) {
  const lines = [];
  const run = graph.run ? ` · run ${String(graph.run.run_id).slice(0, 8)} ${graph.run.status}${graph.run.reason ? ` (${graph.run.reason})` : ''}` : ' · no run';
  lines.push(`${graph.feature} — execution graph · scheduling: ${graph.scheduling} · max ${graph.parallel.max_concurrent_lanes} concurrent${run}`);
  const width = Math.max(4, ...graph.nodes.map((n) => n.id.length));
  const laneWidth = Math.max(4, ...graph.nodes.map((n) => (n.lane || 'integration').length));
  for (const wave of graph.waves) {
    lines.push(`wave ${wave.wave}${wave.status ? ` [${wave.status}]` : ''}`);
    for (const id of wave.units) {
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) continue;
      const glyph = node.kind === 'integration' ? GLYPH.integration : (GLYPH[node.status] || GLYPH.pending);
      const deps = node.depends_on.length > 0 ? `  ← ${node.depends_on.map((d) => `${d.unit} (${d.gate})`).join(', ')}` : '';
      lines.push(`  ${glyph} ${node.id.padEnd(width)}  ${(node.lane || 'integration').padEnd(laneWidth)}  ${stateLine(node)}${deps}`);
    }
  }
  const explicit = graph.edges.filter((e) => e.explicit);
  if (explicit.length > 0) {
    lines.push('edges (explicit)');
    for (const edge of explicit) lines.push(`  ${edge.from} ─${edge.gate}→ ${edge.to}`);
  }
  if (String(graph.scheduling).startsWith('lanes')) lines.push('lanes: units without `Depends on` follow only the previous unit of their own lane; two units sharing a file never write at once (a DEV, or a review that may fix files); a unit only waiting for its review slot holds nothing');
  else if (graph.edges.some((e) => !e.explicit)) lines.push(`barrier: units without \`Depends on\` wait for every lane unit of the earlier waves (${graph.edges.filter((e) => !e.explicit).length} implicit edge(s))`);
  if (graph.integration?.units?.length) lines.push(`integration (session ${graph.integration.owner}): ${graph.integration.units.join(', ')}`);
  lines.push(...formatProjection(graph.projection));
  return `${lines.join('\n')}\n`;
}

const FORMATS = ['ascii', 'mermaid', 'json'];

function renderExecutionGraph(graph, format = 'ascii') {
  switch (format) {
    case 'mermaid':
      return renderMermaid(graph);
    case 'json':
      return `${JSON.stringify(graph, null, 2)}\n`;
    default:
      return renderAscii(graph);
  }
}

async function graphExecution({ projectDir, feature: featureInput, format = 'ascii' }) {
  const feature = assertFeatureSlug(featureInput);
  if (!FORMATS.includes(format)) return { ok: false, reason: 'invalid_format', feature, valid: FORMATS, exitCode: 1 };
  const read = await readExecutionPlan(projectDir, feature);
  if (!read.exists) return { ok: false, reason: 'plan_not_compiled', feature, message: `${executionPlanRelative(feature)} not found — run: aioson execution:compile . --feature=${feature}`, exitCode: 1 };
  if (!read.plan) return { ok: false, reason: 'plan_invalid', feature, message: `${executionPlanRelative(feature)} is not valid JSON (${read.error})`, exitCode: 1 };
  const state = await readRunState(projectDir, feature);
  const graph = buildExecutionGraph({ plan: read.plan, state });
  return { ok: true, feature, format, graph, rendered: renderExecutionGraph(graph, format), exitCode: 0 };
}

module.exports = { FORMATS, buildExecutionGraph, graphExecution, renderAscii, renderExecutionGraph, renderMermaid };
