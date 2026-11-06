'use strict';

/**
 * What a plan tells the runtime proof to run against — advisory Gate C findings
 * read from the plan's text, never a refusal.
 *
 * A plan's `Runtime` lines (and the `Verification` and entry-point lines that
 * carry the same proof) decide what every phase is verified on. One plan sent
 * all of them to a dev server: 21 phases of flows passed there, and a status
 * under a streamed loading state and a flow that only breaks on the built app
 * reached QA. Every gate stayed green because none read which server the plan
 * named. Whether a dev server is good enough depends on context, so this warns
 * with the line and the command and leaves the verdict alone.
 *
 * The same plan proved its flows with a hand-written script: 797 runs and 6h26 in
 * one delivery, with `browser:run` never used, because no plan line ever named a
 * walkthrough. `runtime_without_walkthrough` reads that from the same lines.
 *
 * A warning that fires on a sentence forbidding the server, or on a CLI that has no
 * browser, teaches everyone to skip the section. So a phase answers for itself, a
 * rule has to name the `Runtime` lines, and a walkthrough is asked only of a line
 * that shows a browser or a web server.
 */

const { withoutFences } = require('./plan-document');

const LABELLED = /^\s*(?:[-*]\s*)?(?:\*\*)?(Runtime|Verification|Verifica[cç][aã]o|Production entry point)(?:\*\*)?\s*:/;
// A rule about the field, not the word: `Runtime` in code, or "Runtime lines".
const RULE_MENTION = /`Runtime`|\bRuntime lines?\b|\blinhas? Runtime\b|\bl[ií]neas? Runtime\b/;
const RUNTIME_HEADING = /^#{2,6}\s+(?:.*[^\w])?Runtime(?![\w-])/;
const HEADING = /^(#{1,6})\s+/;
const PHASE_HEADING = /^#{2,6}\s+(?:Phase|Fase)\s+(\d+)\b/i;
const FENCE_MARKER = /^\s{0,3}(?:`{3,}|~{3,})/;

// A package manager's script, with or without its flags: `pnpm --filter web dev`.
const SCRIPT_RUNNER = String.raw`\b(?:npm|pnpm|yarn|bun)(?:\s+--?[\w=./@-]+(?:\s+(?!run\b|dev\b)[\w./@-]+)?)*(?:\s+run)?\s+`;

// A dev server by its usual command, for the stacks a plan names. `vite` alone
// is the dev server; `vite build`, `vite preview` and `vite.config.ts` are not.
const DEV_SERVER = new RegExp([
  String.raw`\b(?:next|nuxt|nuxi|astro|remix|svelte-kit|tauri|wrangler|vercel|netlify|solid-start|qwik)\s+dev\b`,
  String.raw`\bturbo\s+(?:run\s+)?dev\b`,
  `${SCRIPT_RUNNER}dev(?::[\\w-]+)?(?![\\w-])`,
  String.raw`\bvite\b(?![.\-/\w]|\s+(?:build|preview|optimize|bundle|config|plugin|output)\b)`,
  String.raw`\b(?:ng|ember|hugo|jekyll)\s+server?\b`,
  String.raw`\b(?:webpack\s+serve|webpack-dev-server|vue-cli-service\s+serve|react-scripts\s+start|gatsby\s+develop|expo\s+start)\b`,
  String.raw`\b(?:nodemon|ts-node-dev)\b`,
  String.raw`\btsx\s+watch\b`,
  String.raw`\b(?:cargo|dotnet)\s+watch\b`,
  String.raw`\bflask\s+run\b`,
  String.raw`\bmanage\.py\s+runserver\b`,
  String.raw`\bphp\s+artisan\s+serve\b`,
  String.raw`\brails\s+(?:s|server)\b(?!.*(?:-e|--environment)[\s=]+production)`,
  String.raw`\buvicorn\b[^\n]*--reload\b`
].join('|'), 'g');

// Serving the built artifact. A build alone proves it compiles and nothing the
// flows then see, and `docker compose up db` beside `next dev` proves nothing either.
const WEB_PRODUCTION = [
  String.raw`\b(?:next|nuxt|nuxi|astro|remix|svelte-kit)\s+(?:start|preview)\b`,
  `${SCRIPT_RUNNER}(?:start|preview|serve)(?::[\\w-]+)?(?![\\w-])`,
  String.raw`\bvite\s+preview\b`,
  String.raw`\bnode\s+(?:\S*\/)?(?:\.output|\.next|server)\b`,
  String.raw`\b(?:gunicorn|php-fpm|puma|nginx|caddy|apache)\b`,
  String.raw`\bserved by\b`,
  String.raw`\bserve\s+-s\b`,
  String.raw`\b(?:production build|built app|build servido|build de produ[cç][aã]o|app compilado|build de producci[oó]n)\b`
];
// The same proof for what may not have a page at all.
const OTHER_PRODUCTION = [
  String.raw`\bnode\s+(?:\S*\/)?(?:dist|build)\b`,
  String.raw`\btauri\s+build\b`,
  String.raw`\bcargo\s+run\s+--release\b`,
  String.raw`\bdotnet\s+run\b[^\n]*-c\s+Release\b`
];
const WEB_SERVER = new RegExp(WEB_PRODUCTION.join('|'), 'i');
const PRODUCTION_SERVER = new RegExp([...WEB_PRODUCTION, ...OTHER_PRODUCTION].join('|'), 'i');

// The server named to be stopped or avoided, not used: "stop `next dev` before the
// build", "never `next dev`", "`next dev` must not be running".
const NOT_USED_BEFORE = /\b(?:stop|stops|stopping|kill|parar|pare|encerrar|encerre|detener|det[eé]n|do not use|don'?t use|not use|never(?: use| run| on| in)?|avoid|instead of|rather than|without|n[aã]o use|n[aã]o usar|n[aã]o rodar|n[aã]o em|nunca(?: use| usar| rode| em)?|evite|evitar|em vez de|ao inv[eé]s de|sem|no use|no usar)(?:\s+(?:the|o|a|el|la))?\s*[`'"*]*$/i;
const NOT_USED_AFTER = /^[`'"\s*]*(?:is\s+|must be\s+|precisa estar\s+|deve estar\s+|has to be\s+)?(?:must not\b|should not\b|is not used\b|stopped|down\b|off\b|parad[oa]|desligad[oa]|detenid[oa]|not running|n[aã]o (?:deve|pode) (?:rodar|estar))/i;

function devServerCommand(text) {
  for (const match of String(text).matchAll(DEV_SERVER)) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    if (NOT_USED_BEFORE.test(before) || NOT_USED_AFTER.test(after)) continue;
    return match[0].replace(/\s+/g, ' ');
  }
  return null;
}

/**
 * The fields that set the runtime proof, each with its text and the phase it sits
 * in: a labelled line with its indented continuation and any fence right below it,
 * a `Runtime` section line, and a plan-wide rule that names `Runtime` lines. Table
 * rows are excluded: a delta cell describes a path, it does not order a server.
 */
function collectFields(content) {
  const raw = String(content).replace(/\r\n/g, '\n').split('\n');
  const lines = withoutFences(content).split('\n');
  const fields = [];
  let phase = null;
  let sectionLevel = 0;
  let open = null;
  lines.forEach((text, index) => {
    const heading = text.match(HEADING);
    if (heading) {
      const phaseMatch = text.match(PHASE_HEADING);
      if (phaseMatch) phase = Number(phaseMatch[1]);
      else if (heading[1].length <= 2) phase = null;
      if (sectionLevel && heading[1].length <= sectionLevel) sectionLevel = 0;
      if (RUNTIME_HEADING.test(text)) sectionLevel = heading[1].length;
      open = null;
      return;
    }
    if (!text.trim()) {
      // A blank line here that was not blank in the file is inside a fence.
      const inFence = raw[index] && raw[index].trim() && !FENCE_MARKER.test(raw[index]);
      if (inFence && open) open.text += ` ${raw[index].trim()}`;
      return;
    }
    if (/^\s*\|/.test(text)) {
      open = null;
      return;
    }
    const indent = text.match(/^\s*/)[0].length;
    const label = text.match(LABELLED);
    if (label) {
      open = { line: index + 1, phase, text: text.trim(), label: label[1], value: text.slice(label[0].length).trim(), indent };
      fields.push(open);
      return;
    }
    if (open && indent > open.indent) {
      open.text += ` ${text.trim()}`;
      return;
    }
    open = null;
    if (sectionLevel) fields.push({ line: index + 1, phase, text: text.trim(), label: 'section', value: text.trim(), indent });
    else if (RULE_MENTION.test(text)) fields.push({ line: index + 1, phase, text: text.trim(), label: 'rule', value: text.trim(), indent });
  });
  return fields;
}

const WALKTHROUGH = /\.aioson\/qa\/walkthroughs\/|\bbrowser:run\b/;
const WALKTHROUGH_FOLDER = /\.aioson\/qa\/walkthroughs\//;
const NEGATED = /\b(?:never|not|don'?t|no|nunca|n[aã]o|sem)\b/i;
const NO_WALKTHROUGH_REASON = /\b(?:no walkthrough|sem percurso|sin recorrido)\s*:/i;
const NO_BROWSER = /\b(?:no browser|sem navegador|sin navegador)\b/i;
const NOTHING_TO_RUN = /^[\s`*_]*(?:none|n\/a|nothing|not applicable|nenhum[a]?|n[aã]o se aplica)\b/i;
// What says a person's view is under proof: a browser or a page, a click, a screen,
// a flow. A CLI's `--help` or a `curl` of an API has none of it.
const BROWSER_SIGNAL = /\b(?:browser|navegador|playwright|puppeteer|cypress|selenium|webdriver|page|pages|p[aá]gina|screen|tela|telas|click|clicks|clicar|clica|flows?|fluxos?|walkthrough|percurso|viewport|modal|button|bot[aã]o|form|formul[aá]rio|login|hydrat\w*|dashboard|ui)\b|--flow\b/i;

function clip(text, max = 160) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function onDevServer(fields) {
  // A phase answers for itself: a production run on any of its lines covers it. A
  // rule or a plan-level line has no phase, and only its own text can answer.
  const provenPhases = new Set(fields.filter((field) => field.phase !== null && PRODUCTION_SERVER.test(field.text)).map((field) => field.phase));
  const warnings = [];
  for (const field of fields) {
    const command = devServerCommand(field.text);
    if (!command || PRODUCTION_SERVER.test(field.text)) continue;
    if (provenPhases.has(field.phase)) continue;
    warnings.push({
      code: 'runtime_on_dev_server',
      line: field.line,
      phase: field.phase,
      command,
      sample: clip(field.text),
      message: `\`${command}\` is the runtime proof with no production build beside it. A dev server compiles on demand and changes streaming, status codes, caching and error handling, so a flow can pass there and fail on the built app. Serve the build for this proof (\`next start\`, \`vite preview\` or the stack's equivalent), or name the production run in this phase.`
    });
  }
  return warnings;
}

function showsABrowser(text) {
  return BROWSER_SIGNAL.test(text) || Boolean(devServerCommand(text)) || WEB_SERVER.test(text);
}

/**
 * One warning per plan, with the phases it covers: the fix is one decision about
 * how the plan proves its flows. A rule that sends the `Runtime` lines to the
 * walkthrough folder answers for all of them, and one that names the instrument to
 * forbid it answers for none.
 */
function withoutWalkthrough(fields) {
  const planWide = fields.some((field) => field.label === 'rule' && WALKTHROUGH_FOLDER.test(field.text) && !NEGATED.test(field.text));
  if (planWide) return [];
  const runtime = fields.filter((field) => field.label === 'Runtime');
  const provenPhases = new Set(runtime.filter((field) => field.phase !== null && WALKTHROUGH.test(field.text)).map((field) => field.phase));
  const missing = runtime.filter((field) => !provenPhases.has(field.phase)
    && !WALKTHROUGH.test(field.text)
    && !NO_WALKTHROUGH_REASON.test(field.text)
    && !NO_BROWSER.test(field.text)
    && !NOTHING_TO_RUN.test(field.value)
    && showsABrowser(field.text));
  if (missing.length === 0) return [];
  const phases = missing.map((field) => field.phase).filter((phase) => phase !== null);
  return [{
    code: 'runtime_without_walkthrough',
    line: missing[0].line,
    phase: missing[0].phase,
    phases,
    count: missing.length,
    sample: clip(missing[0].text),
    message: `${missing.length} \`Runtime\` line(s)${phases.length ? ` (Phase ${phases.join(', ')})` : ''} name no walkthrough. Point each at a script under .aioson/qa/walkthroughs/{slug}/, run with aioson browser:run: it replays, proves the ids it tags, and reuses a login with --state. For what the instrument cannot express, say so on the line (\`no walkthrough: <reason>\`).`
  }];
}

/**
 * `{ runtime_lines, warnings: [{ code, line, phase, command, sample, message }] }`.
 * Never throws; a plan with no runtime line reports nothing.
 */
function lintPlanRuntime(content) {
  const fields = collectFields(String(content || ''));
  return { runtime_lines: fields.length, warnings: [...onDevServer(fields), ...withoutWalkthrough(fields)] };
}

module.exports = { lintPlanRuntime, devServerCommand };
