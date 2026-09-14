'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateFeatureSlug, resolveExistingInsideRoot } = require('../verification/path-policy');
const { readRunState, executionStatusFromState } = require('../agent-execution/execution-run');

async function readHistoricalSnapshot(projectDir, feature) {
  if (!validateFeatureSlug(feature).ok) throw new Error('Invalid feature');
  const root = `.aioson/context/done/${feature}`;
  const readFile = async (name, state = false) => {
    const relative = `${root}/${name}-${feature}.json`;
    const resolved = await resolveExistingInsideRoot(projectDir, relative);
    if (!resolved.ok) {
      // Distinguish missing evidence from an escape or unreadable artifact.
      try { await fs.lstat(path.join(projectDir, relative)); } catch (error) { if (error.code === 'ENOENT') return state ? { state: null } : null; }
      throw new Error('Historical artifact outside the project or unreadable');
    }
    if ((await fs.stat(resolved.real_path)).size > 20 * 1024 * 1024) throw new Error('Historical artifact exceeds 20 MB');
    if (state) return readRunState(resolved.real_path);
    return JSON.parse(await fs.readFile(resolved.real_path, 'utf8'));
  };
  const stateRead = await readFile('execution-state', true);
  const plan = await readFile('execution-plan');
  if (!stateRead.state && !stateRead.corrupt && !stateRead.unreadable && !plan) return null;
  const archivedAt = Date.parse(stateRead.state?.updated_at || stateRead.state?.started_at);
  const status = executionStatusFromState({ feature, stateRead, read: { exists: Boolean(plan), plan }, now: Number.isFinite(archivedAt) ? archivedAt : Date.now() });
  status.archived = true;
  status.path = `${root}/execution-state-${feature}.json`;
  status.follow_command = null;
  status.resume_command = null;
  if (status.engine) status.engine = { ...status.engine, alive: false, state: 'archived' };
  status.running = [];
  return { status, plan };
}

async function archivedFeatures(projectDir) {
  const relative = '.aioson/context/done';
  const resolved = await resolveExistingInsideRoot(projectDir, relative);
  if (!resolved.ok) return [];
  return (await fs.readdir(resolved.real_path, { withFileTypes: true })).filter(entry => entry.isDirectory() && validateFeatureSlug(entry.name).ok).map(entry => entry.name);
}

module.exports = { readHistoricalSnapshot, archivedFeatures };
