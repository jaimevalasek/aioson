'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { selectContext, pathMatchesPattern } = require('../src/context-selector');
const { runContextSelect } = require('../src/commands/context-select');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-context-select-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

function logger() {
  const lines = [];
  return {
    lines,
    log(value) { lines.push(String(value)); }
  };
}

test('pathMatchesPattern supports prefix, single-star and double-star matches', () => {
  assert.equal(pathMatchesPattern('src/commands/context-select.js', 'src/**'), true);
  assert.equal(pathMatchesPattern('src/commands/context-select.js', 'src/*'), false);
  assert.equal(pathMatchesPattern('src/cli.js', 'src/*.js'), true);
  assert.equal(pathMatchesPattern('tests/context-select.test.js', 'src/**'), false);
});

test('context:select keeps governance out of planning when no trigger fires', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: (none)\n---\n# Pulse');
    await writeFile(dir, '.aioson/design-docs/folder-structure.md', [
      '---',
      'description: "Folder structure"',
      'agents: [dev, deyvin, architect]',
      'modes: [planning, executing]',
      'task_types: [implementation-architecture, file-creation]',
      'load_tier: trigger',
      'triggers: [creating files, designing implementation structure]',
      'paths: [src/**]',
      '---',
      '# Folder Structure'
    ].join('\n'));

    const result = await selectContext(dir, {
      agent: 'deyvin',
      mode: 'planning',
      task: 'summarize current status'
    });

    const selected = result.selected.map((item) => item.path);
    assert.ok(selected.includes('.aioson/context/project.context.md'));
    assert.ok(selected.includes('.aioson/context/project-pulse.md'));
    assert.equal(selected.includes('.aioson/design-docs/folder-structure.md'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select keeps implementation-only foundation out of product planning', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: (none)\n---\n# Pulse');
    await writeFile(dir, '.aioson/context/dev-state.md', '---\nactive_feature: demo\n---\n# Dev State');
    await writeFile(dir, '.aioson/context/memory-index.md', '# Memory Index');

    const product = await selectContext(dir, {
      agent: 'product',
      mode: 'planning',
      task: 'prepare product intake'
    });
    const productSelected = product.selected.map((item) => item.path);
    assert.ok(productSelected.includes('.aioson/context/project.context.md'));
    assert.ok(productSelected.includes('.aioson/context/project-pulse.md'));
    assert.equal(productSelected.includes('.aioson/context/dev-state.md'), false);
    assert.equal(productSelected.includes('.aioson/context/memory-index.md'), false);

    const dev = await selectContext(dir, {
      agent: 'dev',
      mode: 'planning',
      task: 'resume implementation'
    });
    const devSelected = dev.selected.map((item) => item.path);
    assert.ok(devSelected.includes('.aioson/context/dev-state.md'));
    assert.ok(devSelected.includes('.aioson/context/memory-index.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select keeps active feature specs out of deyvin activation-only planning', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: checkout\n---\n# Pulse');
    await writeFile(dir, '.aioson/context/dev-state.md', '---\nactive_feature: checkout\n---\n# Dev State');
    await writeFile(dir, '.aioson/context/memory-index.md', '# Memory Index');
    await writeFile(dir, '.aioson/context/spec-checkout.md', '---\nfeature: checkout\n---\n# Spec');
    await writeFile(dir, '.aioson/context/features/checkout/dossier.md', '---\nfeature: checkout\n---\n# Dossier');

    const activation = await selectContext(dir, {
      agent: 'deyvin',
      mode: 'planning',
      task: 'agent activation without concrete task'
    });
    const activationSelected = activation.selected.map((item) => item.path);
    assert.equal(activation.activation_only, true);
    assert.ok(activationSelected.includes('.aioson/context/project.context.md'));
    assert.ok(activationSelected.includes('.aioson/context/project-pulse.md'));
    assert.ok(activationSelected.includes('.aioson/context/dev-state.md'));
    assert.equal(activationSelected.includes('.aioson/context/memory-index.md'), false);
    assert.equal(activationSelected.includes('.aioson/context/spec-checkout.md'), false);
    assert.equal(activationSelected.includes('.aioson/context/features/checkout/dossier.md'), false);

    const continuation = await selectContext(dir, {
      agent: 'deyvin',
      mode: 'planning',
      task: 'continue checkout implementation'
    });
    const continuationSelected = continuation.selected.map((item) => item.path);
    assert.equal(continuation.activation_only, false);
    assert.ok(continuationSelected.includes('.aioson/context/spec-checkout.md'));
    assert.ok(continuationSelected.includes('.aioson/context/features/checkout/dossier.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select restricts briefing activation-only planning to foundation context', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: checkout\n---\n# Pulse');
    await writeFile(dir, '.aioson/context/dev-state.md', '---\nactive_feature: checkout\n---\n# Dev State');
    await writeFile(dir, '.aioson/context/prd-checkout.md', '---\nfeature: checkout\n---\n# PRD');
    await writeFile(dir, '.aioson/context/features/checkout/dossier.md', '---\nfeature: checkout\n---\n# Dossier');

    const activation = await selectContext(dir, {
      agent: 'briefing',
      mode: 'planning',
      task: 'agent activation without concrete task'
    });
    const activationSelected = activation.selected.map((item) => item.path);
    assert.equal(activation.activation_only, true);
    assert.ok(activationSelected.includes('.aioson/context/project.context.md'));
    assert.ok(activationSelected.includes('.aioson/context/project-pulse.md'));
    assert.equal(activationSelected.includes('.aioson/context/dev-state.md'), false);
    assert.equal(activationSelected.includes('.aioson/context/prd-checkout.md'), false);
    assert.equal(activationSelected.includes('.aioson/context/features/checkout/dossier.md'), false);

    const drafting = await selectContext(dir, {
      agent: 'briefing',
      mode: 'planning',
      task: 'draft briefing for checkout feature'
    });
    assert.equal(drafting.activation_only, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select restricts product activation-only planning to foundation context', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: checkout\n---\n# Pulse');
    await writeFile(dir, '.aioson/context/dev-state.md', '---\nactive_feature: checkout\n---\n# Dev State');
    await writeFile(dir, '.aioson/context/prd-checkout.md', '---\nfeature: checkout\n---\n# PRD');
    await writeFile(dir, '.aioson/context/features/checkout/dossier.md', '---\nfeature: checkout\n---\n# Dossier');

    const activation = await selectContext(dir, {
      agent: 'product',
      mode: 'planning',
      task: 'agent activation without concrete task'
    });
    const activationSelected = activation.selected.map((item) => item.path);
    assert.equal(activation.activation_only, true);
    assert.ok(activationSelected.includes('.aioson/context/project.context.md'));
    assert.ok(activationSelected.includes('.aioson/context/project-pulse.md'));
    assert.equal(activationSelected.includes('.aioson/context/dev-state.md'), false);
    assert.equal(activationSelected.includes('.aioson/context/prd-checkout.md'), false);
    assert.equal(activationSelected.includes('.aioson/context/features/checkout/dossier.md'), false);

    const concrete = await selectContext(dir, {
      agent: 'product',
      mode: 'planning',
      task: 'prepare product intake for checkout'
    });
    assert.equal(concrete.activation_only, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select restricts sheldon and analyst activation-only planning to foundation context', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: checkout\n---\n# Pulse');
    await writeFile(dir, '.aioson/context/dev-state.md', '---\nactive_feature: checkout\n---\n# Dev State');
    await writeFile(dir, '.aioson/context/prd-checkout.md', '---\nfeature: checkout\n---\n# PRD');
    await writeFile(dir, '.aioson/context/features/checkout/dossier.md', '---\nfeature: checkout\n---\n# Dossier');

    for (const agent of ['sheldon', 'analyst', 'architect', 'ux-ui', 'pm', 'qa', 'orchestrator', 'scope-check', 'discovery-design-doc']) {
      const activation = await selectContext(dir, {
        agent,
        mode: 'planning',
        task: 'agent activation without concrete task'
      });
      const selected = activation.selected.map((item) => item.path);
      assert.equal(activation.activation_only, true, `${agent} activation must be activation-only`);
      assert.ok(selected.includes('.aioson/context/project.context.md'), agent);
      assert.ok(selected.includes('.aioson/context/project-pulse.md'), agent);
      assert.equal(selected.includes('.aioson/context/dev-state.md'), false, agent);
      assert.equal(selected.includes('.aioson/context/prd-checkout.md'), false, agent);
      assert.equal(selected.includes('.aioson/context/features/checkout/dossier.md'), false, agent);

      const concrete = await selectContext(dir, {
        agent,
        mode: 'planning',
        task: 'enrich the checkout PRD'
      });
      assert.equal(concrete.activation_only, false, `${agent} concrete task must not be activation-only`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select loads governance for executing file creation paths', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/design-docs/folder-structure.md', [
      '---',
      'description: "Folder structure"',
      'agents: [dev, deyvin, architect]',
      'modes: [planning, executing]',
      'task_types: [implementation-architecture, file-creation]',
      'load_tier: trigger',
      'triggers: [creating files, designing implementation structure]',
      'paths: [src/**]',
      '---',
      '# Folder Structure'
    ].join('\n'));
    await writeFile(dir, '.aioson/design-docs/naming.md', [
      '---',
      'description: "Naming conventions"',
      'agents: [dev, deyvin, architect]',
      'modes: [planning, executing]',
      'task_types: [file-creation, naming]',
      'load_tier: trigger',
      'triggers: [creating files, naming files]',
      'paths: [src/**]',
      '---',
      '# Naming'
    ].join('\n'));

    const result = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'create a new CLI command file',
      paths: 'src/commands/context-select.js'
    });

    const selected = result.selected.map((item) => item.path);
    assert.ok(selected.includes('.aioson/design-docs/folder-structure.md'));
    assert.ok(selected.includes('.aioson/design-docs/naming.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select loads governance for architect implementation planning', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/design-docs/componentization.md', [
      '---',
      'description: "Componentization"',
      'agents: [dev, deyvin, architect]',
      'modes: [planning, executing]',
      'task_types: [implementation-architecture, module-boundary]',
      'load_tier: trigger',
      'triggers: [split module, designing implementation structure]',
      'paths: [src/**]',
      '---',
      '# Componentization'
    ].join('\n'));

    const result = await selectContext(dir, {
      agent: 'architect',
      mode: 'planning',
      task: 'design implementation architecture and module boundaries',
      paths: 'src/lib/context.js'
    });

    assert.ok(result.selected.some((item) => item.path === '.aioson/design-docs/componentization.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select loads ui-spec only for UI implementation context', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/ui-spec.md', '# UI Spec\n\nScreens and frontend states.');

    const backend = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'implement the API service and repository',
      paths: 'src/services/orders.js'
    });
    assert.equal(
      backend.selected.some((item) => item.path === '.aioson/context/ui-spec.md'),
      false
    );

    const frontend = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'implement UI components from the UI spec',
      paths: 'src/components/OrderPanel.jsx'
    });
    assert.ok(frontend.selected.some((item) => item.path === '.aioson/context/ui-spec.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select recognizes feature-scoped ui-spec artifacts', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/context/ui-spec-checkout.md', '# UI Spec\n\nCheckout UI.');

    const result = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      feature: 'checkout',
      task: 'implement checkout frontend'
    });

    assert.ok(result.selected.some((item) => item.path === '.aioson/context/ui-spec-checkout.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select command returns JSON-compatible selected paths', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    const result = await runContextSelect({
      args: [dir],
      options: { agent: 'dev', mode: 'planning', json: true },
      logger: logger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.agent, 'dev');
    assert.ok(result.selected.some((item) => item.path === '.aioson/context/project.context.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select separates product planning docs from PRD writing docs', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/docs/product/conversation-playbook.md', [
      '---',
      'description: "Product conversation playbook"',
      'agents: [product]',
      'modes: [planning]',
      'task_types: [product-intake, feature-definition]',
      'load_tier: trigger',
      'triggers: [structured intake, product questions]',
      '---',
      '# Conversation'
    ].join('\n'));
    await writeFile(dir, '.aioson/docs/product/prd-contract.md', [
      '---',
      'description: "Product PRD contract"',
      'agents: [product]',
      'modes: [executing]',
      'task_types: [prd-writing, output-contract]',
      'load_tier: trigger',
      'triggers: [writing PRD, PRD contract]',
      '---',
      '# PRD Contract'
    ].join('\n'));

    const planning = await selectContext(dir, {
      agent: 'product',
      mode: 'planning',
      task: 'prepare structured intake for feature definition'
    });
    const planningSelected = planning.selected.map((item) => item.path);
    assert.ok(planningSelected.includes('.aioson/docs/product/conversation-playbook.md'));
    assert.equal(planningSelected.includes('.aioson/docs/product/prd-contract.md'), false);

    const executing = await selectContext(dir, {
      agent: 'product',
      mode: 'executing',
      task: 'writing PRD and applying PRD contract',
      paths: '.aioson/context/prd-checkout.md'
    });
    const executingSelected = executing.selected.map((item) => item.path);
    assert.ok(executingSelected.includes('.aioson/docs/product/prd-contract.md'));
    assert.equal(executingSelected.includes('.aioson/docs/product/conversation-playbook.md'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select loads briefing craft only when justified by briefing triggers', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/docs/briefing/briefing-craft.md', [
      '---',
      'description: "Briefing craft guide"',
      'agents: [briefing]',
      'modes: [planning, executing]',
      'task_types: [briefing-craft, jtbd-framing, gap-classification]',
      'load_tier: justified',
      'triggers: [weak briefing, generic conversation, JTBD, more than 3 open questions]',
      'tags: [briefing, jtbd, gaps]',
      '---',
      '# Briefing Craft'
    ].join('\n'));

    const ordinary = await selectContext(dir, {
      agent: 'briefing',
      mode: 'planning',
      task: 'create a new briefing from a clear plan'
    });
    assert.equal(
      ordinary.selected.some((item) => item.path === '.aioson/docs/briefing/briefing-craft.md'),
      false
    );

    const justified = await selectContext(dir, {
      agent: 'briefing',
      mode: 'planning',
      task: 'fix a weak briefing with generic conversation, JTBD framing, and more than 3 open questions'
    });
    assert.ok(justified.selected.some((item) => item.path === '.aioson/docs/briefing/briefing-craft.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select semantic search loads eligible rules by body content without bypassing agent scope', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', [
      '---',
      'framework: Laravel',
      'project_type: web-app',
      '---',
      '# Project'
    ].join('\n'));
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: (none)\n---\n# Pulse');
    await writeFile(dir, '.aioson/rules/implementation-style.md', [
      '---',
      'name: implementation-style',
      'description: "General implementation style"',
      'agents: [dev, deyvin]',
      'modes: [executing]',
      'load_tier: trigger',
      '---',
      '# Implementation Style',
      '',
      'Source code identifiers must be English and Laravel controllers should stay thin.'
    ].join('\n'));
    await writeFile(dir, '.aioson/rules/squad-only.md', [
      '---',
      'name: squad-only',
      'description: "Squad language rule"',
      'agents: [squad]',
      'modes: [executing]',
      'load_tier: trigger',
      '---',
      '# Squad Only',
      '',
      'Source code identifiers must be English.'
    ].join('\n'));

    const result = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'implementar controller Laravel com código em inglês',
      paths: 'app/Http/Controllers/OrderController.php'
    });
    const selected = result.selected.map((item) => item.path);

    assert.ok(result.semantic.enabled);
    assert.ok(result.semantic.terms.includes('english'));
    assert.ok(selected.includes('.aioson/rules/implementation-style.md'));
    assert.equal(selected.includes('.aioson/rules/squad-only.md'), false);
    assert.ok(
      result.selected.find((item) => item.path === '.aioson/rules/implementation-style.md').reason.includes('semantic:')
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:select loads implementation structure rules for Laravel data-access tasks', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/context/project.context.md', [
      '---',
      'framework: Laravel',
      'project_type: web-app',
      '---',
      '# Project'
    ].join('\n'));
    await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: checkout\n---\n# Pulse');
    await writeFile(dir, '.aioson/rules/source-code-language-convention.md', await fs.readFile(path.join(__dirname, '..', 'template/.aioson/rules/source-code-language-convention.md'), 'utf8'));
    await writeFile(dir, '.aioson/rules/implementation-structure-and-data-access.md', await fs.readFile(path.join(__dirname, '..', 'template/.aioson/rules/implementation-structure-and-data-access.md'), 'utf8'));

    const result = await selectContext(dir, {
      agent: 'deyvin',
      mode: 'executing',
      task: 'componentizar feature Laravel e evitar query builder exposto no controller',
      paths: 'app/Http/Controllers/CheckoutController.php,app/Services/CheckoutService.php'
    });
    const selected = result.selected.map((item) => item.path);

    assert.ok(selected.includes('.aioson/rules/source-code-language-convention.md'));
    assert.ok(selected.includes('.aioson/rules/implementation-structure-and-data-access.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
