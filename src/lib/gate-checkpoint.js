'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const CHECKPOINTS_DIR = '.aioson/runtime/checkpoints';

async function readFreshGateCheckpoint(targetDir, gateLetter, slug, artifactPath) {
  const checkpointPath = path.join(
    targetDir,
    CHECKPOINTS_DIR,
    `gate-${gateLetter}-${slug}.json`
  );

  try {
    const [raw, checkpointStat, artifactStat, artifactContent] = await Promise.all([
      fs.readFile(checkpointPath, 'utf8'),
      fs.stat(checkpointPath),
      fs.stat(artifactPath),
      fs.readFile(artifactPath)
    ]);
    const checkpoint = JSON.parse(raw);
    const matchesGate = String(checkpoint.gate || '').toUpperCase() === String(gateLetter).toUpperCase();
    const matchesFeature = String(checkpoint.slug || '') === String(slug);
    const artifactName = path.basename(artifactPath);
    const snapshot = Array.isArray(checkpoint.prerequisites_snapshot)
      ? checkpoint.prerequisites_snapshot.find((entry) => entry.file === artifactName)
      : null;
    const artifactDigest = crypto.createHash('sha256').update(artifactContent).digest('hex');
    const isFresh = snapshot?.sha256
      ? snapshot.sha256 === artifactDigest
      : snapshot?.mtime
        ? snapshot.mtime === artifactStat.mtime.toISOString()
        : checkpointStat.mtimeMs >= artifactStat.mtimeMs;

    return matchesGate && matchesFeature && isFresh
      ? { exists: true, path: checkpointPath, checkpoint }
      : { exists: false, path: checkpointPath };
  } catch {
    return { exists: false, path: checkpointPath };
  }
}

module.exports = {
  CHECKPOINTS_DIR,
  readFreshGateCheckpoint
};
