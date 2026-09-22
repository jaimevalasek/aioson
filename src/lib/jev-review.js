'use strict';

const path = require('node:path');
const { redact, sanitize } = require('./jev-privacy');

const PROFILES = new Set([
  'premium',
  'prototype',
  'qa',
  'design-system',
  'accessibility',
  'code-quality'
]);
const MAX_EXCERPT_CHARS = 6000;
const MAX_CRITERIA_CHARS = 24000;

function count(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function uniqueMatches(text, pattern, limit = 20) {
  const values = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(pattern)) {
    const value = String(match[1] || match[0] || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function redactText(value, maxChars = MAX_EXCERPT_CHARS) {
  const text = redact(value);
  if (text.length > maxChars) return `${text.slice(0, maxChars)}\n[excerpt truncated]`;
  return text;
}

function detectFramework(components) {
  const text = String(components || '');
  const signals = [];
  if (/\bfrom\s+['"]react['"]|\bReact\.|\buse(?:State|Effect|Memo|Ref)\s*\(/.test(text)) signals.push('react');
  if (/\bfrom\s+['"]vue['"]|<template\b|\bdefineComponent\s*\(/.test(text)) signals.push('vue');
  if (/\bfrom\s+['"]svelte['"]|<svelte:/.test(text)) signals.push('svelte');
  if (/\bfrom\s+['"]@angular\/|\bangular\.module\s*\(/.test(text)) signals.push('angular');
  if (/\bfrom\s+['"]next\/|\bgetServerSideProps\b|\buse client\b/.test(text)) signals.push('next');
  if (/\bAstro\.|---[\s\S]*---/.test(text)) signals.push('astro');
  return signals;
}

function analyzeSourcePatterns(sources, { includeSource = false } = {}) {
  const html = String(sources?.html || '');
  const css = String(sources?.css || '');
  const components = String(sources?.components || '');
  const markup = `${html}\n${components}`;
  const styles = `${css}\n${uniqueMatches(components, /<style[^>]*>([\s\S]*?)<\/style>/gi, 50).join('\n')}`;
  const headings = {};
  for (let level = 1; level <= 6; level += 1) headings[`h${level}`] = count(markup, new RegExp(`<h${level}\\b`, 'gi'));

  const patterns = {
    inventory: {
      ...(sources?.corpus || {}),
      files: Array.isArray(sources?.files) ? sources.files.slice(0, 60) : [],
      entry: sources?.entry || null
    },
    html: {
      documents: sources?.corpus?.documents || 0,
      has_doctype: /<!doctype\s+html/i.test(html),
      has_lang: /<html\b[^>]*\blang\s*=/i.test(html),
      landmarks: {
        header: count(markup, /<header\b/gi),
        nav: count(markup, /<nav\b/gi),
        main: count(markup, /<main\b/gi),
        aside: count(markup, /<aside\b/gi),
        footer: count(markup, /<footer\b/gi)
      },
      headings,
      controls: {
        buttons: count(markup, /<button\b/gi),
        links: count(markup, /<a\b/gi),
        inputs: count(markup, /<(?:input|select|textarea)\b/gi),
        dialogs: count(markup, /<(?:dialog)\b|role\s*=\s*["']dialog["']/gi)
      },
      images: count(markup, /<img\b/gi),
      images_without_alt_signal: count(markup, /<img\b(?![^>]*\balt\s*=)[^>]*>/gi),
      inline_styles: count(markup, /\bstyle\s*=\s*["']/gi),
      aria_attributes: count(markup, /\baria-[\w-]+\s*=/gi),
      data_aioson_markers: count(markup, /\bdata-aioson-[\w-]+\s*=/gi)
    },
    css: {
      stylesheets: sources?.corpus?.stylesheets || 0,
      custom_property_definitions: count(styles, /--[\w-]+\s*:/g),
      custom_property_uses: count(styles, /var\(\s*--[\w-]+/g),
      important_declarations: count(styles, /!important\b/gi),
      media_queries: count(styles, /@media\b/gi),
      container_queries: count(styles, /@container\b/gi),
      grid_declarations: count(styles, /\bdisplay\s*:\s*(?:inline-)?grid\b/gi),
      flex_declarations: count(styles, /\bdisplay\s*:\s*(?:inline-)?flex\b/gi),
      absolute_positions: count(styles, /\bposition\s*:\s*absolute\b/gi),
      animations: count(styles, /@keyframes\b/gi),
      reduced_motion_queries: count(styles, /prefers-reduced-motion/gi),
      breakpoints: uniqueMatches(styles, /(?:min|max)-width\s*:\s*([^;)]+)/gi),
      literal_colors: uniqueMatches(styles, /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\))/gi)
    },
    javascript: {
      component_files: sources?.corpus?.components || 0,
      frameworks: detectFramework(components),
      event_listeners: count(components, /\baddEventListener\s*\(/g),
      dom_queries: count(components, /\bquerySelector(?:All)?\s*\(/g),
      network_calls: count(components, /\bfetch\s*\(|\baxios\b/g),
      async_functions: count(components, /\basync\s+(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*\()/g),
      unsafe_html_sinks: count(components, /\binnerHTML\s*=|dangerouslySetInnerHTML|\bdocument\.write\s*\(/g),
      dynamic_code_execution: count(components, /\beval\s*\(|\bnew\s+Function\s*\(/g),
      native_dialogs: count(components, /\b(?:alert|confirm|prompt)\s*\(/g),
      console_errors: count(components, /\bconsole\.error\s*\(/g),
      storage_calls: count(components, /\b(?:localStorage|sessionStorage)\b/g)
    },
    source_policy: {
      raw_source_included: Boolean(includeSource),
      notice: includeSource
        ? 'Redacted excerpts are included because --include-source was explicitly requested.'
        : 'Only derived measurements are included; source code is not sent without --include-source.'
    }
  };

  if (includeSource) {
    patterns.excerpts = {
      html: redactText(html),
      css: redactText(css),
      javascript: redactText(components)
    };
  }
  return patterns;
}

function bounded(value, depth = 0) {
  if (depth > 7) return '[nested evidence omitted]';
  if (typeof value === 'string') return value.length > 1600 ? `${value.slice(0, 1600)}…` : value;
  if (Array.isArray(value)) return [...value.slice(0, 30).map((item) => bounded(item, depth + 1)), ...(value.length > 30 ? [{ omitted_items: value.length - 30 }] : [])];
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(sanitize(value));
  return { ...Object.fromEntries(entries.slice(0, 80).map(([key, item]) => [key, bounded(item, depth + 1)])), ...(entries.length > 80 ? { omitted_fields: entries.length - 80 } : {}) };
}

function compactVisualEvidence(report) {
  const metrics = report?.metrics || {};
  const selected = {
    declarations: metrics.declarations,
    token_adherence_pct: metrics.token_adherence_pct,
    spacing_off_grid: metrics.spacing_off_grid,
    depth_strategies: metrics.depth_strategies,
    font_families: metrics.font_families,
    font_delivery: metrics.font_delivery,
    max_font_size_px: metrics.max_font_size_px,
    fluid_type: metrics.fluid_type,
    reduced_motion_handled: metrics.reduced_motion_handled,
    states_present: metrics.states_present,
    states_unmet: metrics.states_unmet,
    interactive_surface: metrics.interactive_surface,
    max_card_nesting: metrics.max_card_nesting,
    max_card_sibling_run: metrics.max_card_sibling_run,
    media_evidence: metrics.media_evidence,
    palette: metrics.palette,
    tells: metrics.tells,
    surface_mode: metrics.surface_mode,
    utility_classes: metrics.utility_classes,
    craft: metrics.craft,
    runtime: metrics.runtime,
    conformance: metrics.conformance
  };
  return bounded({
    verdict: report?.verdict || 'unavailable',
    issues: report?.issues || [],
    warnings: report?.warnings || [],
    metrics: Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== undefined))
  });
}

function profileQuestions(profile) {
  if (profile === 'accessibility') {
    return {
      accessible_use: {
        type: 'noul',
        instructions: 'Using `deterministic` and `patterns`, is the interface plausibly usable without excluding keyboard, screen-reader, reduced-motion, or low-vision users? Objective issues outweigh visual polish.',
        criteria: { true: 'Evidence supports usable and inclusive interaction.', false: 'Material accessibility risk or missing evidence remains.' }
      },
      accessibility_risk: {
        type: 'score',
        instructions: 'Rate the remaining accessibility risk in `evidence`.',
        criteria: ['No material risk found', 'Minor risk', 'Material risk', 'Blocking risk']
      }
    };
  }
  if (profile === 'code-quality') {
    return {
      implementation_coherence: {
        type: 'noul',
        instructions: 'Do the HTML, CSS, and JavaScript signals form a coherent, maintainable implementation for `intent` and `criteria`?',
        criteria: { true: 'Patterns are consistent, purposeful, and maintainable.', false: 'Patterns are contradictory, fragile, unsafe, or visibly improvised.' }
      },
      maintainability: {
        type: 'score',
        instructions: 'Rate implementation maintainability using only the supplied evidence.',
        criteria: ['Fragile', 'Needs material cleanup', 'Sound', 'Exceptionally coherent']
      }
    };
  }
  if (profile === 'design-system') {
    return {
      system_coherence: {
        type: 'noul',
        instructions: 'Does the implementation show a coherent design system rather than disconnected local styling?',
        criteria: { true: 'Tokens, typography, spacing, components, and states form one system.', false: 'Repeated literals, inconsistent patterns, or missing states show drift.' }
      },
      consistency: {
        type: 'score',
        instructions: 'Rate design-system consistency using `deterministic`, `patterns`, `intent`, and `criteria`.',
        criteria: ['Systemless', 'Inconsistent', 'Coherent', 'Highly disciplined']
      }
    };
  }
  if (profile === 'qa') {
    return {
      implementation_ready: {
        type: 'noul',
        instructions: 'Given the deterministic findings, runtime evidence, source patterns, intent, and acceptance criteria, is this visual implementation ready for independent QA acceptance? Never overlook an objective failure.',
        criteria: { true: 'Evidence is coherent and supports readiness.', false: 'A material defect, contradiction, or evidence gap remains.' }
      },
      delivered_quality: {
        type: 'score',
        instructions: 'Rate delivered implementation quality. Evaluate completeness, consistency, interaction states, responsive evidence, and craft.',
        criteria: ['Broken or incomplete', 'Material revision needed', 'Solid delivery', 'Exceptional delivery']
      }
    };
  }
  if (profile === 'prototype') {
    return {
      direction_specific: {
        type: 'noul',
        instructions: 'Does the prototype express a distinctive, domain-specific direction that could not be replaced by a generic template without losing meaning?',
        criteria: { true: 'The direction is coherent, specific, complete, and intentional.', false: 'It is generic, incomplete, contradictory, or mostly cosmetic.' }
      },
      prototype_quality: {
        type: 'score',
        instructions: 'Rate the prototype against `intent`, `criteria`, deterministic measurements, interaction completeness, mobile evidence, and craft.',
        criteria: ['Unusable direction', 'Promising but unresolved', 'Approval-quality', 'Distinctive premium prototype']
      }
    };
  }
  return {
    premium_fit: {
      type: 'noul',
      instructions: 'Does this surface satisfy `intent` with coherent, distinctive premium execution rather than generic model styling?',
      criteria: { true: 'Distinctive, coherent, domain-specific premium execution.', false: 'Generic, incoherent, incomplete, or visibly under-finished execution.' }
    },
    craft: {
      type: 'score',
      instructions: 'Rate visual craft using deterministic measurements, source patterns, runtime evidence, intent, and criteria.',
      criteria: ['Broken or generic', 'Usable but ordinary', 'Coherent and polished', 'Distinctive premium execution']
    }
  };
}

function buildReviewSpec({ profile = 'premium', evidence, intent = '', criteria = '' } = {}) {
  if (!PROFILES.has(profile)) return null;
  const questions = profileQuestions(profile);
  const ids = Object.keys(questions);
  const scoreId = ids.find((id) => questions[id].type === 'score');
  const noulId = ids.find((id) => questions[id].type === 'noul');
  const riskProfile = profile === 'accessibility';
  return {
    version: 1,
    id: `jev-review-${profile}`,
    state: {
      profile,
      intent: redactText(intent, MAX_CRITERIA_CHARS),
      criteria: redactText(criteria, MAX_CRITERIA_CHARS),
      evidence
    },
    questions,
    decision: {
      type: 'gate',
      mode: 'all',
      rules: [
        { question: noulId, metric: 'noul', op: 'gte', value: 0.7 },
        { question: scoreId, metric: 'score', op: riskProfile ? 'lte' : 'gte', value: riskProfile ? 1.25 : 2 },
        { question: scoreId, metric: 'confidence', op: 'gte', value: 0.45 }
      ],
      on_pass: 'accept',
      on_fail: riskProfile ? 'remediate' : 'refine'
    }
  };
}

function normalizeProfile(value) {
  const profile = String(value || 'premium').trim().toLowerCase();
  return PROFILES.has(profile) ? profile : null;
}

function relativeFiles(targetDir, files) {
  return (files || []).map((file) => path.relative(targetDir, path.resolve(targetDir, file)).split(path.sep).join('/'));
}

module.exports = {
  MAX_CRITERIA_CHARS,
  PROFILES,
  analyzeSourcePatterns,
  buildReviewSpec,
  compactVisualEvidence,
  normalizeProfile,
  redactText,
  relativeFiles
};
