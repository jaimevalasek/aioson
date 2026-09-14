'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseFrontmatter } = require('../preflight-engine');

function withoutFences(content) {
  let fence = null;
  return String(content || '').split(/\r?\n/).map(line => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

function parsePlanPhases(content) {
  const text = withoutFences(content);
  const matches = [...text.matchAll(/^(#{2,3})\s+(?:Phase|Fase)\s+(\d+)(?:\s*[:—–-]\s*(.+)|\s*)$/gim)];
  return matches.map((match, i) => ({
    id: String(Number(match[2])),
    title: (match[3] || '').trim(),
    body: text.slice(match.index + match[0].length, matches[i + 1]?.index ?? text.length).split(new RegExp('^#{1,' + match[1].length + '}\\s+', 'm'))[0]
  }));
}

function setPlanField(content, key, value) {
  const text = String(content || '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return `---\n${key}: ${value}\n---\n\n${text}`;
  const lines = match[1].split('\n').filter(line => !line.startsWith(`${key}:`));
  lines.push(`${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---${text.slice(match[0].length)}`;
}

async function readProjectFile(root, relative, encoding = 'utf8') {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) throw new Error('Unsafe project path');
  const target = path.resolve(root, relative);
  const within = (base, file) => { const rel = path.relative(base, file); return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
  if (!within(path.resolve(root), target)) throw new Error('Path escapes project');
  const [realRoot, realTarget, stat] = await Promise.all([fs.realpath(root), fs.realpath(target), fs.stat(target)]);
  if (!within(realRoot, realTarget) || !stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('Unsafe or oversized project file');
  return fs.readFile(realTarget, encoding);
}

function sourcePrdPath(meta, slug) {
  const expected = `.aioson/context/prd${slug ? `-${slug}` : ''}.md`;
  const source = String(meta.source_prd || expected).replace(/\\/g, '/').replace(/^\.\//, '');
  if (source !== expected) throw new Error('source_prd must name this feature\'s canonical PRD');
  return source;
}

function contentHash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

async function planSourceStatus(root, slug, content) {
  const meta = parseFrontmatter(content);
  let source;
  try {
    source = sourcePrdPath(meta, slug);
    let text;
    try { text = await readProjectFile(root, source); }
    catch (error) {
      if (error.code !== 'ENOENT' || !slug) throw error;
      text = await readProjectFile(root, `.aioson/context/done/${slug}/prd-${slug}.md`);
    }
    const hash = contentHash(text);
    if (!meta.source_prd_sha256) return { freshness: 'unknown', stale: null, source, hash, reason: 'source_baseline_missing' };
    const stale = meta.source_prd_sha256 !== hash;
    return { freshness: stale ? 'stale' : 'current', stale, source, hash };
  } catch (error) {
    return { freshness: 'unknown', stale: null, source, reason: 'source_unavailable', error: error.message };
  }
}

module.exports = { parsePlanPhases, withoutFences, setPlanField, readProjectFile, sourcePrdPath, contentHash, planSourceStatus };
