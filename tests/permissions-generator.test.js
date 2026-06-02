'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  resolveToolSets,
  buildClaudeSettings,
  buildCodexPermissions,
  buildOpencodeYaml,
  generatePermissions
} = require('../src/permissions-generator');

const PROTOCOL_V11 = {
  version: '1.1',
  global_mode: 'guarded',
  tiers: {
    tier1_silent: {
      shell_patterns: ['git status', 'git log *'],
      aioson_commands: ['preflight', 'doctor']
    },
    tier2_notified: {
      shell_patterns: [],
      aioson_commands: ['memory:reflect-prepare', 'workflow:next']
    },
    tier3_blocking: {
      shell_patterns: ['git push *', 'rm -rf *'],
      aioson_commands: ['cloud:publish:*', 'genome:publish']
    }
  },
  tools: {
    claude: {
      mode: 'trusted',
      derived_from_tiers: ['tier1_silent', 'tier2_notified'],
      requires_tty: false
    },
    codex: {
      mode: 'trusted',
      derived_from_tiers: ['tier1_silent', 'tier2_notified'],
      requires_tty: false
    },
    opencode: {
      mode: 'guarded',
      derived_from_tiers: ['tier1_silent'],
      requires_tty: true
    }
  }
};

const PROTOCOL_V10 = {
  version: '1.0',
  global_mode: 'guarded',
  tools: {
    claude: {
      mode: 'trusted',
      shell_whitelist: ['git status', 'npm test'],
      aioson_whitelist: ['workflow:next'],
      requires_tty: false
    }
  }
};

async function makeProject(protocol) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-permgen-'));
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'config', 'autonomy-protocol.json'),
    JSON.stringify(protocol, null, 2),
    'utf8'
  );
  return dir;
}

test('resolveToolSets unions tier1+tier2 and excludes tier3', () => {
  const sets = resolveToolSets(PROTOCOL_V11, PROTOCOL_V11.tools.claude);
  assert.ok(sets.shellPatterns.includes('git status'));
  assert.ok(sets.aiosonCommands.includes('preflight'));
  assert.ok(sets.aiosonCommands.includes('memory:reflect-prepare'));
  assert.ok(!sets.shellPatterns.includes('git push *'), 'tier3 shell must be excluded');
  assert.ok(!sets.shellPatterns.includes('rm -rf *'), 'tier3 shell must be excluded');
  assert.ok(!sets.aiosonCommands.includes('cloud:publish:*'), 'tier3 aioson must be excluded');
  assert.ok(!sets.aiosonCommands.includes('genome:publish'), 'tier3 aioson must be excluded');
});

test('resolveToolSets never includes tier3 even when listed in derived_from_tiers', () => {
  const malicious = {
    ...PROTOCOL_V11,
    tools: {
      claude: {
        mode: 'trusted',
        derived_from_tiers: ['tier1_silent', 'tier2_notified', 'tier3_blocking']
      }
    }
  };
  const sets = resolveToolSets(malicious, malicious.tools.claude);
  assert.ok(!sets.shellPatterns.includes('git push *'), 'tier3 must be hard-rejected');
  assert.ok(!sets.aiosonCommands.includes('cloud:publish:*'), 'tier3 must be hard-rejected');
});

test('resolveToolSets falls back to legacy whitelists for v1.0', () => {
  const sets = resolveToolSets(PROTOCOL_V10, PROTOCOL_V10.tools.claude);
  assert.deepEqual(sets.shellPatterns.sort(), ['git status', 'npm test'].sort());
  assert.deepEqual(sets.aiosonCommands, ['workflow:next']);
});

test('buildClaudeSettings wraps patterns in Bash(...) with :* suffix when wildcard', () => {
  const result = buildClaudeSettings({
    shellPatterns: ['git status', 'git log *'],
    aiosonCommands: ['preflight']
  });
  assert.ok(result.permissions.allow.includes('Bash(git status)'));
  assert.ok(result.permissions.allow.includes('Bash(git log:*)'));
  assert.ok(result.permissions.allow.includes('Bash(aioson preflight:*)'));
});

test('buildCodexPermissions emits stable JSON shape with mode and tty', () => {
  const out = buildCodexPermissions(
    { shellPatterns: ['git status'], aiosonCommands: ['preflight'] },
    { mode: 'trusted', requires_tty: false }
  );
  assert.equal(out.version, '1.1');
  assert.equal(out.mode, 'trusted');
  assert.equal(out.requires_tty, false);
  assert.deepEqual(out.shell_allowed, ['git status']);
  assert.deepEqual(out.aioson_allowed, ['preflight']);
});

test('buildOpencodeYaml emits valid YAML lists', () => {
  const yaml = buildOpencodeYaml(
    { shellPatterns: ['git status'], aiosonCommands: [] },
    { mode: 'guarded', requires_tty: true }
  );
  assert.match(yaml, /version: "1\.1"/);
  assert.match(yaml, /shell_allowed:\s+- "git status"/);
  assert.match(yaml, /aioson_allowed:\s+\[\]/);
});

test('generatePermissions writes supported files and reports them', async () => {
  const dir = await makeProject(PROTOCOL_V11);
  const result = await generatePermissions(dir);
  assert.equal(result.missing, false);
  assert.deepEqual(result.written.sort(), [
    '.claude/settings.json',
    '.codex/permissions.json',
    '.opencode/permissions.yaml'
  ].sort());

  const claude = JSON.parse(await fs.readFile(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(Array.isArray(claude.permissions.allow));
  assert.ok(claude.permissions.allow.some((r) => r.includes('aioson preflight')));
  assert.ok(!claude.permissions.allow.some((r) => /git push/.test(r)));
});

test('generatePermissions preserves existing claude allow entries (merge)', async () => {
  const dir = await makeProject(PROTOCOL_V11);
  await fs.mkdir(path.join(dir, '.claude'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({
      permissions: { allow: ['Bash(custom-user-cmd:*)'] }
    }, null, 2),
    'utf8'
  );

  const result = await generatePermissions(dir);
  assert.ok(result.backedUp.length >= 1, 'previous .claude/settings.json must be backed up');

  const claude = JSON.parse(await fs.readFile(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(claude.permissions.allow.includes('Bash(custom-user-cmd:*)'), 'user entry preserved');
  assert.ok(claude.permissions.allow.some((r) => r.includes('aioson preflight')), 'generated entry added');
});

test('generatePermissions reports missing protocol gracefully', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-permgen-empty-'));
  const result = await generatePermissions(dir);
  assert.equal(result.missing, true);
  assert.equal(result.written.length, 0);
});

test('generatePermissions honours v1.0 fallback via legacy whitelists', async () => {
  const dir = await makeProject(PROTOCOL_V10);
  await generatePermissions(dir);
  const claude = JSON.parse(await fs.readFile(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(claude.permissions.allow.includes('Bash(git status)'));
  assert.ok(claude.permissions.allow.includes('Bash(aioson workflow:next:*)'));
  assert.ok(!claude.permissions.allow.some((r) => r.includes('preflight')), 'v1.0 has no tier1 commands');
});

// SF-project-24: tier3_blocking + tool.shell_blacklist must materialize as deny rules

test('SF-project-24: resolveToolSets exposes deny patterns from tier3_blocking', () => {
  const sets = resolveToolSets(PROTOCOL_V11, PROTOCOL_V11.tools.claude);
  assert.ok(Array.isArray(sets.denyShellPatterns));
  assert.ok(sets.denyShellPatterns.includes('git push *'));
  assert.ok(sets.denyShellPatterns.includes('rm -rf *'));
  assert.ok(Array.isArray(sets.denyAiosonCommands));
  assert.ok(sets.denyAiosonCommands.includes('cloud:publish:*'));
  assert.ok(sets.denyAiosonCommands.includes('genome:publish'));
});

test('SF-project-24: resolveToolSets unions tool.shell_blacklist into deny set', () => {
  const protocol = {
    ...PROTOCOL_V11,
    tools: {
      claude: {
        mode: 'trusted',
        derived_from_tiers: ['tier1_silent'],
        shell_blacklist: ['rm -rf /', 'curl * | sh']
      }
    }
  };
  const sets = resolveToolSets(protocol, protocol.tools.claude);
  assert.ok(sets.denyShellPatterns.includes('rm -rf /'));
  assert.ok(sets.denyShellPatterns.includes('curl * | sh'));
  // tier3 entries still flow in alongside the tool-level blacklist
  assert.ok(sets.denyShellPatterns.includes('git push *'));
});

test('SF-project-24: buildClaudeSettings emits permissions.deny when deny entries exist', () => {
  const result = buildClaudeSettings({
    shellPatterns: ['git status'],
    aiosonCommands: ['preflight'],
    denyShellPatterns: ['rm -rf *', 'git push *'],
    denyAiosonCommands: ['genome:publish']
  });
  assert.ok(Array.isArray(result.permissions.deny), 'deny array missing from Claude settings');
  assert.ok(result.permissions.deny.includes('Bash(rm -rf:*)'));
  assert.ok(result.permissions.deny.includes('Bash(git push:*)'));
  assert.ok(result.permissions.deny.includes('Bash(aioson genome:publish:*)'));
});

test('SF-project-24: buildClaudeSettings omits deny key when nothing to deny', () => {
  const result = buildClaudeSettings({
    shellPatterns: ['git status'],
    aiosonCommands: ['preflight'],
    denyShellPatterns: [],
    denyAiosonCommands: []
  });
  assert.equal(result.permissions.deny, undefined);
});

test('SF-project-24: buildCodexPermissions emits shell_denied + aioson_denied', () => {
  const out = buildCodexPermissions(
    {
      shellPatterns: ['git status'],
      aiosonCommands: ['preflight'],
      denyShellPatterns: ['rm -rf /', 'git push *'],
      denyAiosonCommands: ['cloud:publish:*']
    },
    { mode: 'trusted', requires_tty: false }
  );
  assert.deepEqual(out.shell_denied, ['rm -rf /', 'git push *']);
  assert.deepEqual(out.aioson_denied, ['cloud:publish:*']);
});

test('SF-project-24: buildOpencodeYaml emits shell_denied + aioson_denied lists', () => {
  const yaml = buildOpencodeYaml(
    {
      shellPatterns: ['git status'],
      aiosonCommands: [],
      denyShellPatterns: ['rm -rf *', 'curl * | sh'],
      denyAiosonCommands: ['cloud:publish:*']
    },
    { mode: 'guarded', requires_tty: true }
  );
  assert.match(yaml, /shell_denied:\s+- "rm -rf \*"/);
  assert.match(yaml, /aioson_denied:\s+- "cloud:publish:\*"/);
});

test('SF-project-24: generatePermissions writes deny rules to .claude/settings.json end-to-end', async () => {
  const dir = await makeProject(PROTOCOL_V11);
  await generatePermissions(dir);
  const claude = JSON.parse(await fs.readFile(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(Array.isArray(claude.permissions.deny), 'deny missing from generated .claude/settings.json');
  assert.ok(claude.permissions.deny.includes('Bash(git push:*)'), 'tier3 git push not denied');
  assert.ok(claude.permissions.deny.includes('Bash(rm -rf:*)'), 'tier3 rm -rf not denied');
  assert.ok(claude.permissions.deny.includes('Bash(aioson cloud:publish:*:*)'), 'tier3 cloud:publish not denied');
});

// SF-project-25: drift surface on existing allow entries

test('SF-project-25: mergeClaudeSettings reports unexpected existing allow entries', async () => {
  const dir = await makeProject(PROTOCOL_V11);
  await fs.mkdir(path.join(dir, '.claude'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({
      permissions: { allow: ['Bash(rm-injected:*)', 'Bash(another-injected:*)'] }
    }, null, 2),
    'utf8'
  );

  const result = await generatePermissions(dir);
  assert.ok(Array.isArray(result.notices));
  const drift = result.notices.find((n) => n.kind === 'unexpected_claude_allow');
  assert.ok(drift, 'expected unexpected_claude_allow notice');
  assert.deepEqual(drift.entries.sort(), ['Bash(another-injected:*)', 'Bash(rm-injected:*)'].sort());
  assert.match(drift.message, /generator did not produce/);

  // SF-25 must preserve UX: the existing entries are still in the merged file.
  const claude = JSON.parse(await fs.readFile(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(claude.permissions.allow.includes('Bash(rm-injected:*)'));
  assert.ok(claude.permissions.allow.includes('Bash(another-injected:*)'));
});

test('SF-project-25: mergeClaudeSettings emits no drift notice when existing entries match generated set', async () => {
  const dir = await makeProject(PROTOCOL_V11);
  // pre-write a settings.json that mirrors what the generator will emit
  const expected = buildClaudeSettings(resolveToolSets(PROTOCOL_V11, PROTOCOL_V11.tools.claude));
  await fs.mkdir(path.join(dir, '.claude'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify(expected, null, 2),
    'utf8'
  );
  const result = await generatePermissions(dir);
  const drift = (result.notices || []).find((n) => n.kind === 'unexpected_claude_allow');
  assert.equal(drift, undefined, `unexpected drift notice: ${JSON.stringify(drift)}`);
});
