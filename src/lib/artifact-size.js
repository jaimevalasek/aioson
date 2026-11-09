'use strict';

/**
 * Advisory size budget for the two feature documents every downstream agent
 * opens — prd-{slug}.md and implementation-plan-{slug}.md. Real ones reached
 * 86 KB and 134 KB: each read costs tens of thousands of tokens, and the read
 * stays in the context for every later call of that session. The dev kernel
 * now starts from the phase capsule, but Sheldon, Planner and QA still read
 * them whole. Size alone never proves a document wrong, so this only warns,
 * with the numbers and the largest sections, telling the author what to move
 * out (appendices, raw research, long examples) and what must stay.
 */

const SIZE_BUDGET = {
  prd: 48 * 1024,
  plan: 64 * 1024
};

const KEEP = {
  prd: 'decisions, the CAP and AC tables and Source Coverage',
  plan: 'the phases, Implementation Delta, Engineering Controls and Execution Sequence'
};

// At Gate C the PRD is approved and bound to its review by hash: editing it to
// save bytes stales that review and blocks the gate, so the advice changes.
const SEALED_ADVICE = 'it is approved and bound to its review, so do not edit it for size now; read it by section and report the size to the person';

function kb(bytes) {
  return `${Math.round(bytes / 102.4) / 10} KB`;
}

/** Each `## ` section with its own bytes, largest first. */
function largestSections(text, limit = 3) {
  const sections = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], bytes: 0 };
      sections.push(current);
    }
    if (current) current.bytes += Buffer.byteLength(`${line}\n`, 'utf8');
  }
  return sections.sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}

/**
 * null when the document fits its budget; otherwise the advisory, with its
 * numbers, the three largest sections and a directed rewrite.
 */
function sizeAdvisory({ kind, text, file, budget, sealed = false }) {
  const limit = budget || SIZE_BUDGET[kind];
  if (!limit) return null;
  const bytes = Buffer.byteLength(String(text || ''), 'utf8');
  if (bytes <= limit) return null;
  const largest = largestSections(text);
  const sample = largest.map((section) => `${section.heading} ${kb(section.bytes)}`).join(', ');
  return {
    code: 'artifact_oversize',
    kind,
    file,
    bytes,
    budget: limit,
    tokens_estimate: Math.round(bytes / 4),
    largest_sections: largest,
    message: `${file} is ${kb(bytes)} (advisory budget ${kb(limit)}, about ${Math.round(bytes / 4 / 1000)}k tokens for every agent that reads it whole): ${sealed ? SEALED_ADVICE : `move appendices, raw research and long examples to a linked file and keep ${KEEP[kind]} here`}. Largest sections: ${sample}.`
  };
}

module.exports = { SIZE_BUDGET, sizeAdvisory, largestSections };
