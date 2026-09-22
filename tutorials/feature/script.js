'use strict';

// ── Theme Switcher ──────────────────────────────────────────
const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const themeKey = 'aioson-feature-theme';

function applyTheme(value) {
  const light = value === 'light';
  root.dataset.theme = light ? 'light' : 'dark';
  if (themeToggle) {
    themeToggle.textContent = light ? 'Tema: Porcelana' : 'Tema: Tinta';
    themeToggle.setAttribute('aria-pressed', String(light));
  }
}

try {
  applyTheme(localStorage.getItem(themeKey));
} catch {
  applyTheme('dark');
}

if (themeToggle) {
  themeToggle.hidden = false;
  themeToggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try {
      localStorage.setItem(themeKey, next);
    } catch {
      /* storage unavailable */
    }
  });
}

// ── Route Chooser (Árvore de Decisão Interativa) ─────────────
const routeButtons = document.querySelectorAll('.route-btn');
const routeTitle = document.getElementById('route-display-title');
const routeDesc = document.getElementById('route-display-desc');
const routeNodes = document.getElementById('route-step-nodes');

const routeData = {
  greenfield: {
    title: 'Cenário 1 · Projeto Novo do Zero (Greenfield)',
    desc: 'Quando o projeto ainda não existe ou está na sua primeira grande entrega, não há código anterior nem padrões consolidados. O processo DEVE começar no @briefing para desempacotar as ideias, mapear o problema real e passar pelo @refiner para gerar o protótipo visual antes de gastar um centavo em código de backend.',
    chain: [
      { name: '@briefing', first: true },
      { name: '@refiner' },
      { name: 'Aprovação Humana' },
      { name: '@product' },
      { name: '@sheldon' },
      { name: '@planner' },
      { name: '@dev' },
      { name: '@qa' }
    ]
  },
  evolution: {
    title: 'Cenário 2 · Projeto Existente: Melhoria ou Correção Pontual',
    desc: 'O projeto já possui arquitetura, banco, rotas e arquivos funcionais registrados em .aioson/context/project.context.md. Comece DIRETO no @product! Não é preciso fazer um briefing filosófico para corrigir um cálculo de frete ou adicionar um filtro na busca existente.',
    chain: [
      { name: '@product', first: true },
      { name: '@sheldon' },
      { name: '@planner' },
      { name: '@dev' },
      { name: '@qa' }
    ]
  },
  section: {
    title: 'Cenário 3 · Projeto Existente: Nova Seção ou Grande Mudança de Fluxo',
    desc: 'O sistema já existe, mas você quer introduzir uma seção totalmente nova (ex: uma nova área de relatórios analíticos, marketplace ou painel financeiro). Mesmo com base de código pronta, comece no @briefing! É crucial conversar com o agente para entender se a nova área realmente se justifica, explorar modelos mentais com o @refiner e validar o protótipo visual interativo da tela antes de programar.',
    chain: [
      { name: '@briefing', first: true },
      { name: '@refiner' },
      { name: 'Protótipo & Aprovação' },
      { name: '@product' },
      { name: '@sheldon' },
      { name: '@planner' },
      { name: '@dev' },
      { name: '@qa' }
    ]
  }
};

function selectRoute(key) {
  routeButtons.forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.route === key));
  });

  const data = routeData[key];
  if (!data) return;

  routeTitle.textContent = data.title;
  routeDesc.textContent = data.desc;

  routeNodes.innerHTML = '';
  data.chain.forEach((step, idx) => {
    if (idx > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'route-arrow';
      arrow.textContent = '→';
      routeNodes.appendChild(arrow);
    }
    const node = document.createElement('span');
    node.className = `route-step-node ${step.first ? 'active-first' : ''}`;
    node.textContent = step.name;
    routeNodes.appendChild(node);
  });
}

routeButtons.forEach(btn => {
  btn.addEventListener('click', () => selectRoute(btn.dataset.route));
});

// Inicializar na primeira rota
selectRoute('greenfield');

// ── Calculator: Dev Único vs Orquestrado ──────────────────────
const calcFiles = document.getElementById('calc-files');
const calcScope = document.getElementById('calc-scope');
const calcIsolation = document.getElementById('calc-isolation');
const calcBadge = document.getElementById('calc-verdict-badge');
const calcTitle = document.getElementById('calc-verdict-title');
const calcText = document.getElementById('calc-verdict-text');
const calcWhy = document.getElementById('calc-verdict-why');

function updateCalculator() {
  if (!calcFiles || !calcScope || !calcIsolation) return;

  const filesVal = calcFiles.value; // 'small', 'medium', 'large'
  const scopeVal = calcScope.value; // 'single', 'dual', 'multi'
  const isoVal = calcIsolation.value; // 'shared', 'isolated'

  // Pontuação heurística alinhada com o motor plan-scale do AIOSON
  let score = 0;
  if (filesVal === 'medium') score += 2;
  if (filesVal === 'large') score += 4;

  if (scopeVal === 'dual') score += 3;
  if (scopeVal === 'multi') score += 5;

  if (isoVal === 'isolated') score += 2;
  else score -= 3; // Banco compartilhado penaliza paralelismo

  const isOrchestrated = score >= 4 && isoVal === 'isolated';

  if (isOrchestrated) {
    calcBadge.className = 'calc-badge calc-badge--orch';
    calcBadge.textContent = 'DEV Orquestrado (Lanes Paralelas)';
    calcTitle.textContent = 'Recomendado: Execução Orquestrada via execution:run';
    calcText.textContent = 'Esta feature possui tamanho e desacoplamento suficientes para dividir em lanes paralelas (ex: backend_dev e frontend_dev) com um integration_dev e QA compartilhado.';
    calcWhy.textContent = 'Por que orquestrar aqui: Reduz o tempo total decorrido (wall-clock time), aproveita modelos especialistas em cada frente e mantém o foco cognitivo de cada worker abaixo de 10 arquivos por unidade.';
  } else {
    calcBadge.className = 'calc-badge calc-badge--single';
    calcBadge.textContent = 'DEV Único (Sessão Contínua)';
    calcTitle.textContent = 'Recomendado: Implementação com DEV Único';
    calcText.textContent = 'O trabalho deve ser executado pelo @dev de forma direta e sequencial na sessão, avançando fase por fase.';
    calcWhy.textContent = isoVal === 'shared' && (scopeVal !== 'single' || filesVal !== 'small')
      ? 'Atenção ao isolamento: Os arquivos ou recursos (banco de testes, portas) são compartilhados. Dividir em workers concorrentes causaria conflitos de merge e falhas falsas de teste. Um DEV único é muito mais seguro e econômico.'
      : 'Trabalho focado: Como o escopo cabe em poucas unidades e poucos arquivos, o overhead de orquestração não traz ganhos. Um único DEV resolve com rapidez e menor consumo de tokens.';
  }
}

if (calcFiles && calcScope && calcIsolation) {
  calcFiles.addEventListener('change', updateCalculator);
  calcScope.addEventListener('change', updateCalculator);
  calcIsolation.addEventListener('change', updateCalculator);
  updateCalculator();
}

// ── Command Builder ──────────────────────────────────────────
const inputPath = document.getElementById('project-path');
const inputSlug = document.getElementById('feature-slug');
const selectPipeline = document.getElementById('pipeline-mode');
const copyFeedback = document.getElementById('copy-feedback');

const cmdBlocks = {
  req: document.getElementById('cmd-req'),
  audit: document.getElementById('cmd-audit'),
  plan: document.getElementById('cmd-plan'),
  single: document.getElementById('cmd-single'),
  orch: document.getElementById('cmd-orch')
};

function updateCommandBuilder() {
  if (!inputPath || !inputSlug || !selectPipeline) return;

  const rawPath = inputPath.value.trim() || '.';
  const path = rawPath === '.' ? '.' : `'${rawPath.replace(/'/g, "''")}'`;
  let slug = inputSlug.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  if (!slug) slug = 'minha-feature';

  const mode = selectPipeline.value; // 'with-briefing' | 'direct-product'

  if (mode === 'with-briefing') {
    cmdBlocks.req.textContent = [
      `# 1. Explorar a necessidade com o Briefing e Refiner`,
      `aioson briefing:sources ${path} --slug=${slug}`,
      `# (Converse com @briefing e depois com @refiner)`,
      `aioson briefing:review ${path} --slug=${slug}`,
      `aioson briefing:approve ${path} --slug=${slug}`
    ].join('\n');
  } else {
    cmdBlocks.req.textContent = [
      `# 1. Projeto existente: Iniciar direto com o Product`,
      `# (No seu cliente de IA, chame @product)`,
      `# "@product Defina o PRD da feature ${slug} com capacidades e critérios observáveis"`,
      `# O artefato nascerá em .aioson/context/prd-${slug}.md`
    ].join('\n');
  }

  cmdBlocks.audit.textContent = [
    `# 2. Auditoria Semântica Jev e Revisão do Sheldon`,
    `aioson jev:agent-review ${path} --agent=product --feature=${slug}`,
    `# (Chame @sheldon para revisar o PRD e blindar o Gate B)`,
    `aioson gate:check ${path} --feature=${slug} --gate=B`
  ].join('\n');

  cmdBlocks.plan.textContent = [
    `# 3. Criação do Plano pelo Planner e Validação Gate C`,
    `# (Chame @planner para desenhar o plano de implementação)`,
    `aioson plan:bind ${path} --feature=${slug}`,
    `aioson gate:check ${path} --feature=${slug} --gate=C`,
    `aioson jev:agent-review ${path} --agent=planner --feature=${slug}`
  ].join('\n');

  cmdBlocks.single.textContent = [
    `# 4A. Execução com DEV Único (Caminho Simples / Focado)`,
    `aioson workflow:status ${path}`,
    `aioson workflow:next ${path} --expect-feature=${slug}`
  ].join('\n');

  cmdBlocks.orch.textContent = [
    `# 4B. Execução Orquestrada (Lanes em Paralelo no Motor)`,
    `aioson execution:offer ${path} --feature=${slug}`,
    `aioson execution:compile ${path} --feature=${slug}`,
    `aioson execution:run ${path} --feature=${slug} --preflight`,
    `aioson execution:run ${path} --feature=${slug} --until-complete`,
    `# Em outro terminal, abra o painel visual:`,
    `aioson execution:dashboard ${path} --feature=${slug}`
  ].join('\n');
}

if (inputPath && inputSlug && selectPipeline) {
  inputPath.addEventListener('input', updateCommandBuilder);
  inputSlug.addEventListener('input', updateCommandBuilder);
  selectPipeline.addEventListener('change', updateCommandBuilder);
  updateCommandBuilder();
}

// Botões de cópia
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.copy;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetEl.textContent);
      } else {
        const range = document.createRange();
        range.selectNodeContents(targetEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
      }
      if (copyFeedback) {
        copyFeedback.textContent = '✓ Comando copiado para a área de transferência!';
        setTimeout(() => { copyFeedback.textContent = ''; }, 3000);
      }
    } catch {
      if (copyFeedback) {
        copyFeedback.textContent = 'Selecione o texto manualmente e use Ctrl+C.';
      }
    }
  });
});

// ── Active Navigation (IntersectionObserver) ─────────────────
const sidebarLinks = [...document.querySelectorAll('.sidebar a[href^="#"]')];
if ('IntersectionObserver' in window && sidebarLinks.length > 0) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      sidebarLinks.forEach(link => {
        if (link.hash === `#${entry.target.id}`) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }
  }, { rootMargin: '-10% 0px -75% 0px' });

  document.querySelectorAll('.article > section[id]').forEach(section => {
    observer.observe(section);
  });
}
