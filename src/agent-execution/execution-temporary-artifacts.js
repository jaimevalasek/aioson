'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_TEMP_PREFIX = '.tmp-';

function temporaryDirectoryRelative(feature, runId, unit, stage) {
  return `.aioson/runtime/execution-temp/${feature}/${runId}/${unit}-${stage}`;
}

async function listRootTemporaryArtifacts(projectDir) {
  let entries;
  try {
    entries = await fs.readdir(projectDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.name.startsWith(ROOT_TEMP_PREFIX) && !entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function cleanupExecutionTemporaryArtifacts(projectDir, { feature, runId, rootBaseline = null }) {
  const baseline = new Set(Array.isArray(rootBaseline) ? rootBaseline : []);
  const removed = [];
  const failed = [];
  const managedRelative = `.aioson/runtime/execution-temp/${feature}/${runId}`;
  const managedPath = path.join(projectDir, ...managedRelative.split('/'));

  try {
    await fs.rm(managedPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    removed.push(managedRelative);
  } catch (error) {
    failed.push({ path: managedRelative, error: error.code || error.message });
  }

  if (Array.isArray(rootBaseline)) {
    for (const name of await listRootTemporaryArtifacts(projectDir)) {
      if (baseline.has(name)) continue;
      const file = path.join(projectDir, name);
      try {
        await fs.rm(file, { force: true });
        removed.push(name);
      } catch (error) {
        failed.push({ path: name, error: error.code || error.message });
      }
    }
  }

  return { removed, failed };
}

module.exports = {
  ROOT_TEMP_PREFIX,
  temporaryDirectoryRelative,
  listRootTemporaryArtifacts,
  cleanupExecutionTemporaryArtifacts
};
