'use strict';

// Additive JSON merge for .aioson/config/*.json on `aioson update`.
//
// Why this file exists (M-01, identified during active-learning-loop closure
// 2026-05-14): the regular installer copy path overwrites these configs
// without a backup, silently destroying user customizations of
// autonomy-protocol.json, learning-loop.json, scout-engine.json. None of them
// are in PROJECT_LOCAL_FILES (so they're not preserved) nor in MANAGED_FILES
// (so they get no backup either). This module handles them with merge
// semantics: new keys from the template are added, user values are preserved,
// arrays are unioned, and the prior file is backed up to
// .aioson/backups/{ts}/.aioson/config/*.json before any mutation.

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { nowStamp } = require('./utils');

// Keys whose value is owned by the framework, not the user. On a key collision
// the template's value wins. Everything else is "current wins" (user-preserve).
const TEMPLATE_OWNED_KEYS = new Set(['version', '$schema']);

const CONFIG_MERGE_PATTERN = /^\.aioson\/config\/[^/]+\.json$/;

function isConfigMergePath(rel) {
  return CONFIG_MERGE_PATTERN.test(rel.split(path.sep).join('/'));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function primitiveKey(item) {
  const t = typeof item;
  if (item === null) return 'null:null';
  if (t === 'string' || t === 'number' || t === 'boolean') return `${t}:${item}`;
  return null;
}

function structurallyEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// Union semantics: keep all user items in order, then append template items
// that aren't already present. Primitives dedup by (type, value); objects dedup
// by structural equality (best-effort — good enough for the small arrays in
// these configs).
function mergeArrayUnion(currentArr, templateArr) {
  const result = [...currentArr];
  const seenPrimitives = new Set();
  for (const item of currentArr) {
    const key = primitiveKey(item);
    if (key !== null) seenPrimitives.add(key);
  }
  for (const item of templateArr) {
    const key = primitiveKey(item);
    if (key !== null) {
      if (!seenPrimitives.has(key)) {
        result.push(item);
        seenPrimitives.add(key);
      }
    } else if (!result.some((c) => structurallyEqual(c, item))) {
      result.push(item);
    }
  }
  return result;
}

function mergeJsonAdditive(template, current) {
  if (isPlainObject(template) && isPlainObject(current)) {
    const result = {};
    const keys = new Set([...Object.keys(current), ...Object.keys(template)]);
    for (const key of keys) {
      const inTemplate = Object.prototype.hasOwnProperty.call(template, key);
      const inCurrent = Object.prototype.hasOwnProperty.call(current, key);
      if (inTemplate && !inCurrent) {
        result[key] = template[key];
      } else if (!inTemplate && inCurrent) {
        result[key] = current[key];
      } else if (TEMPLATE_OWNED_KEYS.has(key)) {
        result[key] = template[key];
      } else {
        result[key] = mergeJsonAdditive(template[key], current[key]);
      }
    }
    return result;
  }

  if (Array.isArray(template) && Array.isArray(current)) {
    return mergeArrayUnion(current, template);
  }

  // Type mismatch or primitive collision — user wins.
  return current === undefined ? template : current;
}

// Notepad and Windows PowerShell 5 save UTF-8 with a byte-order mark, and
// JSON.parse rejects it: a user's valid config read as "unparseable" and was
// replaced by the template, losing every key the user had set.
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readJsonOrNull(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(stripBom(raw));
  } catch {
    return null;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// `install` runs the installer without a backup folder (only `update` opens
// one), yet an unparseable config is replaced wholesale — the one mutation
// here that discards what the user wrote. It gets a folder of its own, under
// the same `.aioson/backups/<stamp>/<relative path>` layout, shared by every
// file this process backs up for the project so one run leaves one folder
// (rollback retention counts folders). A later run that would back up the same
// file again opens a fresh folder rather than overwrite the earlier copy.
const fallbackBackupRoots = new Map();

function fallbackBackupRoot(targetDir, relPath, { dryRun = false } = {}) {
  const fresh = () => path.join(targetDir, '.aioson', 'backups', nowStamp());
  if (dryRun) return fresh();
  const key = path.resolve(targetDir);
  let root = fallbackBackupRoots.get(key);
  if (!root || fsSync.existsSync(path.join(root, relPath))) {
    root = fresh();
    fallbackBackupRoots.set(key, root);
  }
  return root;
}

async function backupConfigFile(targetDir, relPath, backupRoot) {
  if (!backupRoot) return { backupPath: null, error: null };
  const source = path.join(targetDir, relPath);
  if (!(await pathExists(source))) return { backupPath: null, error: null };
  const dest = path.join(backupRoot, relPath);
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(source, dest);
    return { backupPath: dest, error: null };
  } catch (err) {
    return { backupPath: null, error: err && err.message ? err.message : String(err) };
  }
}

// Single-file orchestration. Returns:
//   { action, backupPath, error? }
// where action ∈ {
//   'created'           — destination was absent; template copied verbatim
//   'merged'            — destination existed, content changed after merge
//   'unchanged'         — destination existed, merge added nothing (its
//                         formatting and any BOM are left as saved)
//   'invalid_current'   — destination existed but was unparseable (a leading
//                         BOM alone does not count); backed up + overwritten,
//                         in every mode — without a backupRoot it opens its own
//   'invalid_template'  — template was unparseable; no-op (returns error)
// }
async function mergeConfigFile({
  templatePath,
  targetDir,
  relPath,
  backupRoot = null,
  dryRun = false
}) {
  const destPath = path.join(targetDir, relPath);
  const templateData = await readJsonOrNull(templatePath);
  if (templateData === null) {
    return { action: 'invalid_template', backupPath: null, error: `unparseable template at ${templatePath}` };
  }

  const destExists = await pathExists(destPath);

  if (!destExists) {
    if (!dryRun) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(templatePath, destPath);
    }
    return { action: 'created', backupPath: null };
  }

  const currentData = await readJsonOrNull(destPath);
  if (currentData === null) {
    const invalidBackupRoot = backupRoot || fallbackBackupRoot(targetDir, relPath, { dryRun });
    if (dryRun) {
      return { action: 'invalid_current', backupPath: path.join(invalidBackupRoot, relPath), backupError: null };
    }
    const backupResult = await backupConfigFile(targetDir, relPath, invalidBackupRoot);
    await fs.copyFile(templatePath, destPath);
    return { action: 'invalid_current', backupPath: backupResult.backupPath, backupError: backupResult.error };
  }

  const merged = mergeJsonAdditive(templateData, currentData);
  // A merge that adds nothing leaves the file exactly as the user saved it,
  // whatever its formatting. The templates ship compact arrays (["MICRO"])
  // that the serializer below expands, and a BOM is not data: comparing bytes
  // reflowed every freshly installed config on the next update or forced
  // install, each time taking a backup folder that rollback retention counts.
  if (structurallyEqual(merged, currentData)) {
    return { action: 'unchanged', backupPath: null };
  }
  const mergedSerialized = `${JSON.stringify(merged, null, 2)}\n`;

  let backupResult = { backupPath: null, error: null };
  if (!dryRun) {
    backupResult = await backupConfigFile(targetDir, relPath, backupRoot);
    await fs.writeFile(destPath, mergedSerialized, 'utf8');
  } else if (backupRoot) {
    backupResult = { backupPath: path.join(backupRoot, relPath), error: null };
  }
  return { action: 'merged', backupPath: backupResult.backupPath, backupError: backupResult.error };
}

module.exports = {
  CONFIG_MERGE_PATTERN,
  TEMPLATE_OWNED_KEYS,
  isConfigMergePath,
  isPlainObject,
  mergeArrayUnion,
  mergeJsonAdditive,
  mergeConfigFile
};
