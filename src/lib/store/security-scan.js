'use strict';

const crypto = require('node:crypto');

// ── Extension allowlists ─────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = {
  genome: new Set(['.md', '.json']),
  skill: new Set(['.md', '.json', '.yaml', '.yml', '.txt']),
  squad: new Set(['.md', '.json', '.yaml', '.yml', '.txt'])
};

// ── Size limits ──────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 512 * 1024;       // 512 KB per file
const MAX_PACKAGE_BYTES = 5 * 1024 * 1024; // 5 MB total

// ── Malicious pattern detection ──────────────────────────────────────────────

/**
 * Patterns that flag a file for review.
 * Each entry: { id, pattern, description }
 * All patterns are applied to raw file content (string).
 */
const THREAT_PATTERNS = [
  // Shell execution — $(...) substitution is always suspicious; backticks alone
  // are too noisy in markdown (false positives for inline code), so we only flag
  // backtick spans containing dangerous shell keywords.
  { id: 'shell_exec',      pattern: /\$\([^)]*(?:rm|curl|wget|eval|exec|chmod|sudo|bash|sh|python|node|ruby|perl|nc|netcat|fetch|http)\b[^)]*\)|`[^`]*\b(?:rm\s+-rf?|curl\s+-?\w*\s*http|wget\s+-\w*\s*http|sudo\s|chmod\s+\+x|eval\s*\(|exec\s*\(|nc\s+-?\w+\s|bash\s+<|sh\s+-c)\b[^`]*`/i, description: 'shell command substitution with dangerous keywords' },
  { id: 'curl_pipe',       pattern: /curl\s+.*\|\s*(ba)?sh/i,                           description: 'curl pipe to shell' },
  { id: 'wget_pipe',       pattern: /wget\s+.*-O\s*-\s*\|\s*(ba)?sh/i,                 description: 'wget pipe to shell' },
  { id: 'exec_call',       pattern: /\bexec\s*\(/,                                      description: 'exec() call' },
  { id: 'eval_call',       pattern: /\beval\s*\(/,                                      description: 'eval() call' },
  { id: 'spawn_call',      pattern: /child_process|\.spawn\s*\(|\.execSync\s*\(/,       description: 'child_process / spawn' },

  // Encoded payloads
  { id: 'long_base64',     pattern: /[A-Za-z0-9+/]{200,}={0,2}/,                       description: 'long base64 blob (potential encoded payload)' },
  { id: 'hex_payload',     pattern: /\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){15,}/,      description: 'hex-encoded payload sequence' },

  // Network calls inside markdown/config
  { id: 'js_fetch',        pattern: /\bfetch\s*\(\s*['"`]https?:\/\//,                  description: 'fetch() to external URL' },
  { id: 'require_http',    pattern: /require\s*\(\s*['"`]https?:\/\//,                  description: 'require() from HTTP URL' },
  { id: 'dynamic_import',  pattern: /import\s*\(\s*['"`]https?:\/\//,                   description: 'dynamic import from HTTP URL' },

  // Filesystem destructive ops
  { id: 'rm_rf',           pattern: /rm\s+-rf?\s+[/~]/,                                 description: 'rm -rf on root or home' },
  { id: 'mkfs',            pattern: /\bmkfs\b|\bdd\s+if=\/dev\//,                       description: 'mkfs or dd on device' },

  // Crypto mining markers
  { id: 'miner_pool',      pattern: /stratum\+tcp:\/\/|minexmr\.com|xmrig/i,            description: 'crypto mining pool reference' },

  // Exfiltration patterns
  { id: 'env_exfil',       pattern: /process\.env\b.*\b(fetch|axios|request)\b/,        description: 'env vars sent over network' },
  { id: 'ssh_key_path',    pattern: /\.ssh\/id_rsa|\.ssh\/id_ed25519/,                  description: 'SSH private key path reference' },

  // Obfuscation
  { id: 'atob_chain',      pattern: /atob\s*\(\s*atob/,                                 description: 'double-decoded base64 (obfuscation)' },
  { id: 'charcode_concat', pattern: /String\.fromCharCode\s*\(\s*\d[\d,\s]{30,}\)/,     description: 'String.fromCharCode long sequence' }
];

/**
 * Scan a single file's content for threat patterns.
 * Returns array of { id, description, line } for each match.
 */
function scanContent(content) {
  const findings = [];
  const lines = content.split('\n');

  for (const { id, pattern, description } of THREAT_PATTERNS) {
    // Check full content first (for multi-char patterns)
    if (!pattern.test(content)) continue;

    // Find which line triggered it
    let lineNum = null;
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        lineNum = i + 1;
        break;
      }
    }

    findings.push({ id, description, line: lineNum });
  }

  return findings;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan a files map { relPath: content } for security issues.
 *
 * @param {Record<string, string>} files
 * @param {'genome'|'skill'|'squad'} packageType
 * @returns {{ ok: boolean, errors: string[], warnings: string[], hash: string }}
 */
function scanPackage(files, packageType) {
  const allowedExts = ALLOWED_EXTENSIONS[packageType] ?? ALLOWED_EXTENSIONS.squad;
  const errors = [];
  const warnings = [];
  let totalBytes = 0;

  for (const [relPath, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;

    const ext = relPath.includes('.') ? `.${relPath.split('.').pop().toLowerCase()}` : '';
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;

    // Extension check
    if (!allowedExts.has(ext)) {
      errors.push(`Blocked file type: "${relPath}" (extension "${ext}" not allowed for ${packageType} packages)`);
      continue; // don't scan content of blocked files
    }

    // Per-file size check
    if (bytes > MAX_FILE_BYTES) {
      errors.push(`File too large: "${relPath}" (${(bytes / 1024).toFixed(0)} KB, limit is ${MAX_FILE_BYTES / 1024} KB)`);
    }

    // Threat patterns
    const findings = scanContent(content);
    for (const finding of findings) {
      const loc = finding.line ? `:${finding.line}` : '';
      warnings.push(`Suspicious pattern in "${relPath}"${loc} — ${finding.description} [${finding.id}]`);
    }
  }

  // Total package size
  if (totalBytes > MAX_PACKAGE_BYTES) {
    errors.push(`Package too large: ${(totalBytes / 1024 / 1024).toFixed(2)} MB (limit is ${MAX_PACKAGE_BYTES / 1024 / 1024} MB)`);
  }

  // Deterministic hash of the full package contents
  const hash = hashPackage(files);

  return { ok: errors.length === 0, errors, warnings, hash, totalBytes };
}

/**
 * Compute a deterministic SHA-256 of the package contents.
 * Files are sorted by path before hashing.
 */
function hashPackage(files) {
  const h = crypto.createHash('sha256');
  const sortedPaths = Object.keys(files).sort();
  for (const p of sortedPaths) {
    h.update(`\0${p}\0`);
    h.update(files[p] ?? '');
  }
  return h.digest('hex');
}

/**
 * Format scan results for CLI output.
 * Returns lines to log.
 */
function formatScanReport(scanResult, logger) {
  const lines = [];

  if (scanResult.errors.length > 0) {
    lines.push('Security scan FAILED:');
    for (const e of scanResult.errors) lines.push(`  [ERROR] ${e}`);
  }

  if (scanResult.warnings.length > 0) {
    lines.push('Security scan warnings:');
    for (const w of scanResult.warnings) lines.push(`  [WARN]  ${w}`);
  }

  for (const line of lines) logger.log(line);
  return lines;
}

module.exports = { scanPackage, hashPackage, formatScanReport, ALLOWED_EXTENSIONS, MAX_FILE_BYTES, MAX_PACKAGE_BYTES };
