'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BOOLEAN_FLAGS, parseArgv } = require('../src/parser');
const englishMessages = require('../src/i18n/messages/en');

describe('parser.js — parseArgv', () => {
  it('parses command and positional args', () => {
    const result = parseArgv(['node', 'aioson', 'setup', '.']);
    assert.equal(result.command, 'setup');
    assert.deepEqual(result.args, ['.']);
    assert.deepEqual(result.options, {});
  });

  it('parses long flags with values', () => {
    const result = parseArgv(['node', 'aioson', 'workflow:next', '.', '--agent', 'dev']);
    assert.equal(result.command, 'workflow:next');
    assert.equal(result.options.agent, 'dev');
  });

  it('parses long flags with = syntax', () => {
    const result = parseArgv(['node', 'aioson', 'workflow:next', '.', '--agent=dev']);
    assert.equal(result.options.agent, 'dev');
  });

  it('parses boolean-only flags without consuming next token', () => {
    const result = parseArgv(['node', 'aioson', 'workflow:next', '.', '--json', '--agent', 'dev']);
    assert.equal(result.options.json, true);
    assert.equal(result.options.agent, 'dev');
  });

  it('keeps every documented bare long flag boolean-only', () => {
    const documentedBareFlags = new Set();

    for (const [key, line] of Object.entries(englishMessages.cli)) {
      if (!key.startsWith('help_') || typeof line !== 'string') continue;

      for (const match of line.matchAll(/--([a-z0-9-]+)(?![a-z0-9-])/gi)) {
        const suffix = line.slice(match.index + match[0].length);
        if (suffix.startsWith('=')) continue;
        documentedBareFlags.add(match[1]);
      }
    }

    const missing = [...documentedBareFlags]
      .filter((flag) => !BOOLEAN_FLAGS.has(flag))
      .sort();
    assert.deepEqual(missing, []);

    for (const flag of documentedBareFlags) {
      const result = parseArgv(['node', 'aioson', 'example', `--${flag}`, 'target-dir']);
      assert.equal(result.options[flag], true, `--${flag} should be boolean`);
      assert.deepEqual(result.args, ['target-dir'], `--${flag} swallowed the positional path`);
    }
  });

  it('parses --agentic as a boolean-only flag', () => {
    const result = parseArgv(['node', 'aioson', 'workflow:execute', '--agentic', '.', '--feature', 'checkout']);
    assert.equal(result.command, 'workflow:execute');
    assert.equal(result.options.agentic, true);
    assert.deepEqual(result.args, ['.']);
    assert.equal(result.options.feature, 'checkout');
  });

  it('parses briefing:apply-feedback booleans without swallowing the path positional', () => {
    const result = parseArgv(['node', 'aioson', 'briefing:apply-feedback', '--confirm', '.', '--slug=idea']);
    assert.equal(result.options.confirm, true);
    assert.deepEqual(result.args, ['.']);
    assert.equal(result.options.slug, 'idea');

    const declined = parseArgv(['node', 'aioson', 'briefing:apply-feedback', '--declined', '.', '--allow-stale', '.']);
    assert.equal(declined.options.declined, true);
    assert.equal(declined.options['allow-stale'], true);
    assert.deepEqual(declined.args, ['.', '.']);
  });

  it('parses short flags', () => {
    const result = parseArgv(['node', 'aioson', 'setup', '.', '-f', '-h', '-j', '-v']);
    assert.equal(result.options.force, true);
    assert.equal(result.options.help, true);
    assert.equal(result.options.json, true);
    assert.equal(result.options.version, true);
  });

  it('parses combined short flags', () => {
    const result = parseArgv(['node', 'aioson', 'setup', '.', '-fhj']);
    assert.equal(result.options.force, true);
    assert.equal(result.options.help, true);
    assert.equal(result.options.json, true);
  });

  it('defaults to help command when no command given', () => {
    const result = parseArgv(['node', 'aioson']);
    assert.equal(result.command, 'help');
    assert.deepEqual(result.args, []);
  });

  it('parses multiple positional args', () => {
    const result = parseArgv(['node', 'aioson', 'squad:plan', 'auth', 'messaging']);
    assert.equal(result.command, 'squad:plan');
    assert.deepEqual(result.args, ['auth', 'messaging']);
  });

  it('treats unknown token after bool flag as arg, not value', () => {
    // --json is bool-only, so 'dev' should not be consumed as its value
    const result = parseArgv(['node', 'aioson', 'workflow:next', '.', '--json', 'dev']);
    assert.equal(result.options.json, true);
    assert.deepEqual(result.args, ['.', 'dev']);
  });

  it('treats token starting with - after flag as boolean', () => {
    const result = parseArgv(['node', 'aioson', 'cmd', '--agent', '--json']);
    assert.equal(result.options.agent, true);
    assert.equal(result.options.json, true);
  });

  it('preserves `=` characters inside flag values (regression: dev-state-producer)', () => {
    // Pre-fix: `.split('=')` + destructuring chopped after the second `=`,
    // silently truncating any flag value containing `=` (URLs, sentences,
    // SQL, key=value pairs in messages).
    const result = parseArgv([
      'node', 'aioson', 'state:save', '.',
      '--next=Phase 2: profile=creator; cap=20000; CONTEXT_ALLOWED_PROFILES'
    ]);
    assert.equal(
      result.options.next,
      'Phase 2: profile=creator; cap=20000; CONTEXT_ALLOWED_PROFILES'
    );
  });

  it('preserves multi-line / long flag values without truncation', () => {
    const longValue = 'A'.repeat(500) + ' middle=marker ' + 'B'.repeat(500);
    const result = parseArgv(['node', 'aioson', 'cmd', `--note=${longValue}`]);
    assert.equal(result.options.note, longValue);
    assert.equal(result.options.note.length, 500 + ' middle=marker '.length + 500);
  });

  it('preserves URL query strings in flag values', () => {
    const result = parseArgv([
      'node', 'aioson', 'cmd',
      '--url=https://example.com/api?foo=1&bar=2&baz=qux'
    ]);
    assert.equal(
      result.options.url,
      'https://example.com/api?foo=1&bar=2&baz=qux'
    );
  });
});

it('parseArgv: --seed and --seed-only are boolean-only and never swallow the path positional', () => {
  const parsed = parseArgv(['node', 'aioson', 'workflow:execute', '--feature=x', '--seed', '.']);
  assert.equal(parsed.options.seed, true);
  assert.deepEqual(parsed.args, ['.']);
  const parsedOnly = parseArgv(['node', 'aioson', 'workflow:execute', '--seed-only', '.', '--tool=claude']);
  assert.equal(parsedOnly.options['seed-only'], true);
  assert.deepEqual(parsedOnly.args, ['.']);
});
