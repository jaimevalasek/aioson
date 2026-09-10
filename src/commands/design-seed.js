'use strict';

/**
 * design:seed — deterministic palette/pairing/composition draw for cold-start
 * origination, diversified against the operator's recent measured projects.
 *
 * The engine consumes this at origination time when no identity exists: the
 * draw decides where in the design space the work STARTS (hue family, ground
 * pole, scheme, typeface pairing, hero posture), which is exactly the decision
 * a model prior otherwise makes the same way in every project. Advisory raw
 * material — the model picks ONE candidate and refines it with judgment; an
 * extracted identity always outranks the draw.
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');
const { parseFrontmatter } = require('../preflight-engine');
const { validateFeatureSlug } = require('../verification/path-policy');
const {
  generateSeedCandidates,
  projectFingerprintId,
  readRegistry,
  registryPath,
  writeSeedRecord,
  originCounts,
  REGISTERS,
  POLES
} = require('../lib/design-seed');

// 1.3.1: candidates keep their base hues apart and search disjoint rungs of
// the ladder — same inputs draw differently than 1.3.0, so the record says so.
const VERSION = '1.3.1';
const GENERATOR = `aioson design:seed@${VERSION}`;

/**
 * The owner's extracted identity outranks the draw — as a fact the CLI reads,
 * not a sentence the model remembers. `--identity=<path>` names the record;
 * `--slug` resolves the briefing record, then the project brand record. Its
 * `theme` fixes the ground pole (`dark`, `light`, `light-dark` → first token)
 * and an optional `register:` fixes the register.
 */
function resolveIdentity(targetDir, { slug = null, explicit = null } = {}) {
  const candidates = [];
  // A named record is the only candidate: a typo must not fall through to
  // whatever the project happens to hold.
  if (explicit) candidates.push(path.resolve(targetDir, String(explicit)));
  else {
    if (slug) candidates.push(path.join(targetDir, '.aioson', 'briefings', slug, 'identity.md'));
    candidates.push(path.join(targetDir, '.aioson', 'context', 'identity.md'));
  }
  for (const file of candidates) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const frontmatter = /^---\r?\n/.test(content) ? parseFrontmatter(content) : {};
    if (String(frontmatter.kind || '').trim().toLowerCase() !== 'identity') continue;
    const theme = String(frontmatter.theme || '').trim().toLowerCase();
    const themePole = theme.split(/[-_/\s]+/)[0];
    const pole = POLES.includes(themePole) ? themePole : null;
    const register = String(frontmatter.register || '').trim().toLowerCase();
    return {
      path: path.relative(targetDir, file).split(path.sep).join('/'),
      scope: String(frontmatter.scope || '').trim() || null,
      theme: theme || null,
      pole,
      register: REGISTERS.includes(register) ? register : null
    };
  }
  return null;
}

async function runDesignSeed({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const project = path.basename(path.resolve(targetDir));
  const projectId = projectFingerprintId(targetDir);
  const slug = options.slug ? String(options.slug).trim() : null;
  const registerOption = options.register ? String(options.register).trim().toLowerCase() : null;
  const poleOption = options.pole ? String(options.pole).trim().toLowerCase() : null;

  if (registerOption && !REGISTERS.includes(registerOption)) {
    const msg = `design:seed: unknown register "${registerOption}". Registers: ${REGISTERS.join(', ')}`;
    if (options.json) { process.exitCode = 1; return { ok: false, error: 'unknown_register', registers: REGISTERS }; }
    logger.error(msg);
    process.exitCode = 1;
    return { ok: false };
  }
  if (poleOption && !POLES.includes(poleOption)) {
    const msg = `design:seed: unknown pole "${poleOption}". Poles: ${POLES.join(', ')}`;
    if (options.json) { process.exitCode = 1; return { ok: false, error: 'unknown_pole', poles: POLES }; }
    logger.error(msg);
    process.exitCode = 1;
    return { ok: false };
  }
  // The slug becomes a path segment (features/<slug>/design-seed.json,
  // briefings/<slug>/identity.md): `--slug=../../../../x` wrote the draw
  // outside the project. The canonical feature-slug rule holds before any join.
  const slugCheck = slug ? validateFeatureSlug(slug) : { ok: true };
  if (!slugCheck.ok) {
    const msg = `design:seed: --slug="${slug}" is not a feature slug (lowercase letters and digits in hyphen-separated words) — refused before any path is built`;
    if (options.json) { process.exitCode = 1; return { ok: false, error: 'invalid_slug', reason: slugCheck.reason, slug }; }
    logger.error(msg);
    process.exitCode = 1;
    return { ok: false, error: 'invalid_slug' };
  }

  const identity = options.identity === false ? null : resolveIdentity(targetDir, { slug, explicit: typeof options.identity === 'string' ? options.identity : null });
  if (typeof options.identity === 'string' && !identity) {
    const msg = `design:seed: --identity=${options.identity} is not an identity record (kind: identity)`;
    if (options.json) { process.exitCode = 1; return { ok: false, error: 'identity_not_found', identity: options.identity }; }
    logger.error(msg);
    process.exitCode = 1;
    return { ok: false };
  }
  // An explicit flag states a preference; the identity states a fact. The
  // flag wins only when the operator typed it.
  const register = registerOption || (identity && identity.register) || null;
  const pole = poleOption || (identity && identity.pole) || null;

  const count = Math.max(1, Math.min(6, Number(options.count) || 3));
  const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 0;

  const registry = readRegistry();
  const avoid = registry.entries.filter((entry) => entry && (entry.project_id ? entry.project_id !== projectId : entry.project !== project));
  const result = generateSeedCandidates({ project: projectId, slug: slug || project, register, count, seed, avoid, pole });
  const origins = originCounts(avoid);

  const payload = {
    generator: GENERATOR,
    ok: true,
    project,
    project_id: projectId,
    slug,
    register: result.register,
    pole: result.pole,
    identity: identity ? { ...identity, applied: { pole: Boolean(identity.pole && !poleOption), register: Boolean(identity.register && !registerOption) } } : null,
    seed,
    basis: result.basis,
    registry: { path: registryPath(), entries: registry.entries.length, avoided: avoid.length, origins },
    candidates: result.candidates,
    warnings: result.warnings,
    recorded: null
  };

  // The draw is a fact the gate can read back, not a sentence the model
  // remembers: recorded next to the feature so `verify:artifact --kind=visual`
  // can say whether the built palette came from it. `--no-persist` keeps a
  // diagnostic run from writing into the project.
  const persist = !(options['no-persist'] || options.noPersist);
  if (persist) {
    try {
      const file = writeSeedRecord(targetDir, slug, payload);
      payload.recorded = file ? path.relative(targetDir, file).split(path.sep).join('/') : null;
    } catch {
      payload.recorded = null;
    }
  }

  if (options.json) return payload;

  logger.log(`design:seed — ${result.candidates.length} contrast-solved candidate(s) for ${slug || project}${result.register ? ` (${result.register} register)` : ''}${result.pole ? ` · ${result.pole} ground fixed` : ''}`);
  if (identity) {
    logger.log(`  identity ${identity.path}${identity.theme ? ` (theme ${identity.theme})` : ''} — ${identity.pole ? `${identity.pole} ground` : 'no theme'}${identity.register ? `, ${identity.register} register` : ''}: the owner's record outranks the draw`);
  }
  logger.log(avoid.length > 0
    ? `  diversified against ${avoid.length} recent project fingerprint(s) from ${registryPath()}${result.pole ? ' (hue and pairing only — the ground pole is the owner\'s)' : ''}`
    : '  fingerprint registry is empty — first project draws free');
  if (avoid.length > 0) {
    logger.log(`  where those palettes came from: seed ${origins.seed} · identity ${origins.identity} · prior ${origins.prior} · unrecorded ${origins.unrecorded} (distinct projects)`);
  }
  logger.log(payload.recorded
    ? `  recorded at ${payload.recorded} — kind=visual reads it back as palette.origin`
    : (persist ? '  not recorded (no .aioson/ here) — kind=visual will read the manifest seed label instead' : '  not recorded (--no-persist)'));
  logger.log('');
  for (const c of result.candidates) {
    logger.log(`► ${c.label} · ${c.register} · ${c.pole} ground · ${c.scheme}`);
    const r = c.roles;
    logger.log(`  ground ${r.ground.hex} · surface ${r.surface.hex} · ink ${r.ink.hex} · muted ${r.muted.hex}`);
    logger.log(`  accent ${r.accent.hex} (${c.accent_hue}°) · on-accent ${r.accent_ink.hex} · wash ${r.wash.hex}${r.accent_2 ? ` · accent-2 ${r.accent_2.hex}` : ''}`);
    if (c.blocks) logger.log(`  blocks ${c.blocks.map((b) => `${b.hex}/${b.ink}`).join(' · ')}`);
    logger.log(`  contrast: ink ${c.contrast.ink_on_ground} · muted ${c.contrast.muted_on_ground} · accent ${c.contrast.accent_on_ground} · accent-ink ${c.contrast.accent_ink_on_accent}`);
    logger.log(`  type: ${c.pairing.display} / ${c.pairing.ui} (${c.pairing.host}) — ${c.pairing.vibe}`);
    logger.log(`  composition: ${c.composition.hero} — ${c.composition.note}`);
    logger.log(`  rhythm ${c.composition.rhythm} · material: ${c.composition.material}`);
    logger.log(`  finishing floor: ${c.composition.finishing}`);
    logger.log('');
  }
  logger.log('Build FROM one candidate: hue family, pole, and pairing are the starting material; refine roles, scales, and');
  logger.log('composition with judgment. An extracted identity.md outranks any draw. Re-roll with --seed=N; same inputs, same draw.');
  for (const warning of payload.warnings) logger.log(`  diversity warning: ${warning}`);

  return payload;
}

module.exports = { runDesignSeed, resolveIdentity, GENERATOR };
