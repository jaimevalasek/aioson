'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { sessionDirectory } = require('./plan-store');

const digest = value => createHash('sha256').update(value).digest('hex');

async function preserveOutput(projectDir, squad, session, taskId, output) {
  const data = Buffer.from(JSON.stringify({ schema_version: 1, task_id: taskId, output }, null, 2));
  const hash = digest(data);
  const directory = path.join(sessionDirectory(projectDir, squad, session), 'deliveries');
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, `${hash}.json`);
  const temporary = path.join(directory, `.delivery-${randomUUID()}.tmp`);
  try {
    const file = await fs.open(temporary, 'wx');
    try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
    try { await fs.link(temporary, destination); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (digest(await fs.readFile(destination)) !== hash) throw new Error('Existing delivery artifact failed integrity verification', { cause: error });
    }
  } finally { await fs.rm(temporary, { force: true }); }
  return { path: path.relative(projectDir, destination).replace(/\\/g, '/'), sha256: hash, bytes: data.length, kind: 'worker-output' };
}

async function readPreservedOutput(projectDir, reference) {
  if (!reference || !/^[a-f0-9]{64}$/.test(reference.sha256) || typeof reference.path !== 'string') throw new Error('Invalid delivery reference');
  const root = await fs.realpath(projectDir);
  const file = await fs.realpath(path.resolve(root, reference.path));
  const relative = path.relative(root, file);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Delivery path escapes project');
  const data = await fs.readFile(file);
  if (digest(data) !== reference.sha256) throw new Error('Delivery artifact failed integrity verification');
  const document = JSON.parse(data.toString('utf8'));
  if (document.schema_version !== 1) throw new Error('Unsupported delivery schema');
  return document;
}

module.exports = { preserveOutput, readPreservedOutput };
