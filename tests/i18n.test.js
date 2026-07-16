'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalLocaleTag, createTranslator, normalizeLocale } = require('../src/i18n');

test('normalizeLocale falls back to en', () => {
  assert.equal(normalizeLocale('pt-BR'), 'pt-br');
  assert.equal(normalizeLocale('pt_br'), 'pt-br');
  assert.equal(normalizeLocale('pt'), 'pt-br');
  assert.equal(normalizeLocale('es-MX'), 'es');
  assert.equal(normalizeLocale('fr-CA'), 'fr');
  assert.equal(normalizeLocale('EN-us'), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
});

test('normalizeLocale resolves base locale when region variant is requested', () => {
  const resolved = normalizeLocale('fr-CA', { en: {}, fr: {} });
  assert.equal(resolved, 'fr');
});

test('translator returns english messages and key fallback', () => {
  const { t } = createTranslator('en');
  assert.equal(t('cli.title'), 'AIOSON CLI');
  assert.equal(t('not.exists.key'), 'not.exists.key');
});

test('translator resolves pt-BR dictionary', () => {
  const { locale, t } = createTranslator('pt-BR');
  assert.equal(locale, 'pt-br');
  assert.equal(t('cli.title'), 'CLI do AIOSON');
  assert.equal(t('cli.usage'), 'Uso:');
});

test('translator resolves regional variants to es and fr dictionaries', () => {
  const es = createTranslator('es-MX');
  assert.equal(es.locale, 'es');
  assert.equal(es.t('cli.usage'), 'Uso:');
  assert.equal(es.t('cli.unknown_command', { command: 'x' }), 'Comando desconocido: x');

  const fr = createTranslator('fr_CA');
  assert.equal(fr.locale, 'fr');
  assert.equal(fr.t('cli.usage'), 'Utilisation :');
  assert.equal(fr.t('cli.unknown_command', { command: 'x' }), 'Commande inconnue : x');
});

test('english fallback help keeps the requested locale in copyable commands', () => {
  assert.equal(canonicalLocaleTag('pt-br'), 'pt-BR');

  const cases = [
    ['pt-BR', 'cli.help_scaffold_complete', '--locale=pt-BR'],
    ['es', 'cli.help_runtime_init', '--locale=es'],
    ['fr', 'cli.help_runtime_init', '--locale=fr']
  ];

  for (const [locale, key, expected] of cases) {
    const line = createTranslator(locale).t(key);
    assert.equal(line.includes(expected), true, `${key} should preserve ${locale}`);
    assert.equal(line.includes('--locale=en'), false, `${key} should not switch back to English`);
  }
});

test('translator exposes parse reason unknown fallback key per locale', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(en.t('context_validate.parse_reason_unknown'), 'unknown');
  assert.equal(pt.t('context_validate.parse_reason_unknown'), 'desconhecido');
  assert.equal(es.t('context_validate.parse_reason_unknown'), 'desconocido');
  assert.equal(fr.t('context_validate.parse_reason_unknown'), 'inconnu');
});

test('translator exposes context parse reason keys across locales', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(
    en.t('context_validate.parse_reason_unclosed_frontmatter'),
    'unclosed frontmatter block'
  );
  assert.equal(
    pt.t('context_validate.parse_reason_unclosed_frontmatter'),
    'bloco de frontmatter nao fechado'
  );
  assert.equal(
    es.t('context_validate.parse_reason_unclosed_frontmatter'),
    'bloque de frontmatter sin cerrar'
  );
  assert.equal(
    fr.t('context_validate.parse_reason_unclosed_frontmatter'),
    'bloc de frontmatter non ferme'
  );
});

test('translator exposes localized diagnostic line format keys', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(en.t('mcp_doctor.hint_line', { hint: 'x' }), '  Hint: x');
  assert.equal(pt.t('mcp_doctor.hint_line', { hint: 'x' }), '  Dica: x');
  assert.equal(es.t('parallel_doctor.hint_line', { hint: 'x' }), '  Sugerencia: x');
  assert.equal(fr.t('parallel_doctor.hint_line', { hint: 'x' }), '  Astuce : x');
});

test('translator exposes localized doctor command wrapper keys', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(en.t('doctor.fix_action_line', { action: 'x' }), '- Action: x');
  assert.equal(pt.t('doctor.fix_action_line', { action: 'x' }), '- Acao: x');
  assert.equal(es.t('doctor.fix_action_line', { action: 'x' }), '- Accion: x');
  assert.equal(fr.t('doctor.fix_action_line', { action: 'x' }), '- Action : x');
  assert.equal(
    en.t('doctor.fix_action_gateway_contracts').includes('gateway contract files'),
    true
  );
});

test('translator exposes localized doctor gateway contract keys', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(en.t('doctor.gateway_codex_pointer').includes('Codex gateway'), true);
  assert.equal(pt.t('doctor.gateway_codex_pointer').includes('Gateway do Codex'), true);
  assert.equal(es.t('doctor.gateway_codex_pointer').includes('gateway de Codex'), true);
  assert.equal(fr.t('doctor.gateway_codex_pointer').includes('passerelle Codex'), true);
  assert.equal(en.t('doctor.gateway_opencode_pointer').includes('OpenCode gateway'), true);
});

test('translator exposes localized cli line wrapper keys', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(en.t('cli.help_item_line', { text: 'x' }), '  x');
  assert.equal(pt.t('cli.help_item_line', { text: 'x' }), '  x');
  assert.equal(es.t('cli.help_item_line', { text: 'x' }), '  x');
  assert.equal(fr.t('cli.help_item_line', { text: 'x' }), '  x');

  assert.equal(en.t('cli.unknown_command_line', { message: 'x' }), 'x\n');
  assert.equal(pt.t('cli.unknown_command_line', { message: 'x' }), 'x\n');
  assert.equal(es.t('cli.unknown_command_line', { message: 'x' }), 'x\n');
  assert.equal(fr.t('cli.unknown_command_line', { message: 'x' }), 'x\n');
});

test('translator exposes localized init/install onboarding guidance keys', () => {
  const en = createTranslator('en');
  const pt = createTranslator('pt-BR');
  const es = createTranslator('es');
  const fr = createTranslator('fr');

  assert.equal(
    en.t('init.step_agent_prompt', { tool: 'codex' }).includes('--tool=codex'),
    true
  );
  assert.equal(
    pt.t('install.step_setup_context').includes('aioson setup:context --defaults'),
    true
  );
  assert.equal(es.t('init.step_agents').includes('aioson agents'), true);
  assert.equal(fr.t('install.step_agent_prompt', { tool: 'opencode' }).includes('--tool=opencode'), true);
  assert.equal(en.t('cli.help_update').includes('--lang='), true);
});
