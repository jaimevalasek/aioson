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
 */

const { withoutFences } = require('./plan-document');

const LABELLED = /^\s*(?:[-*]\s*)?(?:\*\*)?(Runtime|Verification|Verifica[cç][aã]o|Production entry point)(?:\*\*)?\s*:/;
const RULE_MENTION = /(?:^|[^\w])Runtime(?![\w-])/;
const RUNTIME_HEADING = /^#{2,6}\s+(?:.*[^\w])?Runtime(?![\w-])/;
const HEADING = /^(#{1,6})\s+/;
const PHASE_HEADING = /^#{2,6}\s+(?:Phase|Fase)\s+(\d+)\b/i;

// A dev server by its usual command, for the stacks a plan names. `vite` alone
// is the dev server; `vite build`, `vite preview` and `vite.config.ts` are not.
const DEV_SERVER = new RegExp([
  String.raw`\b(?:next|nuxt|nuxi|astro|remix|svelte-kit|tauri|wrangler|vercel|netlify|turbo|solid-start|qwik)\s+dev\b`,
  String.raw`\b(?:npm(?:\s+run)?|pnpm(?:\s+run)?|yarn(?:\s+run)?|bun(?:\s+run)?)\s+dev(?::[\w-]+)?(?![\w-])`,
  String.raw`\bvite\b(?![.\-/\w]|\s+(?:build|preview|optimize)\b)`,
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
// flows then see, so `npm run build` does not count.
const PRODUCTION_SERVER = new RegExp([
  String.raw`\b(?:next|nuxt|nuxi|astro|remix|svelte-kit)\s+(?:start|preview)\b`,
  String.raw`\b(?:npm(?:\s+run)?|pnpm(?:\s+run)?|yarn(?:\s+run)?|bun(?:\s+run)?)\s+(?:start|preview|serve)(?::[\w-]+)?(?![\w-])`,
  String.raw`\bvite\s+preview\b`,
  String.raw`\bnode\s+(?:\S*\/)?(?:dist|build|\.output|\.next|server)\b`,
  String.raw`\b(?:gunicorn|php-fpm|puma)\b`,
  String.raw`\bdocker(?:-compose|\s+compose|\s+run)\b`,
  String.raw`\bserve\s+-s\b`,
  String.raw`\btauri\s+build\b`,
  String.raw`\bcargo\s+run\s+--release\b`,
  String.raw`\bdotnet\s+run\b[^\n]*-c\s+Release\b`,
  String.raw`\b(?:production build|build de produ[cç][aã]o|build de producci[oó]n)\b`
].join('|'), 'i');

// `next dev` stopped, not used: "stop `next dev` before the build".
const STOPPED_BEFORE = /\b(?:stop|stops|kill|parar|pare|encerrar|encerre|det[eé]n|detener)\b[^.;]{0,20}$/i;
const STOPPED_AFTER = /^[`'"\s*]*(?:is\s+|must be\s+|precisa estar\s+|deve estar\s+|has to be\s+)?(?:stopped|down|off|parad[oa]|desligad[oa]|detenid[oa]|not running)\b/i;

function devServerCommand(text) {
  for (const match of String(text).matchAll(DEV_SERVER)) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    if (STOPPED_BEFORE.test(before) || STOPPED_AFTER.test(after)) continue;
    return match[0].replace(/\s+/g, ' ');
  }
  return null;
}

/**
 * The lines that set the runtime proof, with the phase each sits in: a labelled
 * field and its indented continuation, a `Runtime` section, and a plan-wide rule
 * that names `Runtime` lines. Table rows are excluded: a delta cell describes a
 * path, it does not order a server.
 */
function collectRuntimeLines(content) {
  const lines = withoutFences(content).split('\n');
  const collected = [];
  let phase = null;
  let sectionLevel = 0;
  let fieldIndent = -1;
  lines.forEach((text, index) => {
    const heading = text.match(HEADING);
    if (heading) {
      const phaseMatch = text.match(PHASE_HEADING);
      if (phaseMatch) phase = Number(phaseMatch[1]);
      else if (heading[1].length <= 2) phase = null;
      if (sectionLevel && heading[1].length <= sectionLevel) sectionLevel = 0;
      if (RUNTIME_HEADING.test(text)) sectionLevel = heading[1].length;
      fieldIndent = -1;
      return;
    }
    if (!text.trim()) return;
    if (/^\s*\|/.test(text)) {
      fieldIndent = -1;
      return;
    }
    const indent = text.match(/^\s*/)[0].length;
    const label = text.match(LABELLED);
    if (label) {
      collected.push({ line: index + 1, phase, text: text.trim(), label: label[1] });
      fieldIndent = indent;
      return;
    }
    if (fieldIndent >= 0 && indent > fieldIndent) {
      collected.push({ line: index + 1, phase, text: text.trim(), label: 'continuation' });
      return;
    }
    fieldIndent = -1;
    if (sectionLevel) collected.push({ line: index + 1, phase, text: text.trim(), label: 'section' });
    else if (RULE_MENTION.test(text)) collected.push({ line: index + 1, phase, text: text.trim(), label: 'rule' });
  });
  return collected;
}

function clip(text, max = 160) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function onDevServer(collected) {
  const warnings = [];
  for (const entry of collected) {
    const command = devServerCommand(entry.text);
    if (!command || PRODUCTION_SERVER.test(entry.text)) continue;
    warnings.push({
      code: 'runtime_on_dev_server',
      line: entry.line,
      phase: entry.phase,
      command,
      sample: clip(entry.text),
      message: `\`${command}\` is the runtime proof with no production build beside it. A dev server compiles on demand and changes streaming, status codes, caching and error handling, so a flow can pass there and fail on the built app. Serve the build for this proof (\`next start\`, \`vite preview\` or the stack's equivalent), or name the production run on this same line.`
    });
  }
  return warnings;
}

/**
 * `{ runtime_lines, warnings: [{ code, line, phase, command, sample, message }] }`.
 * Never throws; a plan with no runtime line reports nothing.
 */
function lintPlanRuntime(content) {
  const collected = collectRuntimeLines(String(content || ''));
  return { runtime_lines: collected.length, warnings: onDevServer(collected) };
}

module.exports = { lintPlanRuntime, collectRuntimeLines, devServerCommand };
