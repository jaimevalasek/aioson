'use strict';

/**
 * Cross-AI Review Synthesizer — Phase 4.4
 *
 * Detects available AI CLIs (claude, codex), sends identical review
 * prompts to each (excluding the current runtime), and synthesizes the
 * responses into a REVIEWS.md file.
 *
 * Detection: checks PATH for each CLI binary.
 * Current runtime: detected via AIOSON_TOOL env var (set by claude/codex hooks).
 *
 * Output: outputs/REVIEWS.md with consensus, divergences, and per-reviewer sections.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

// CLI invocation patterns for each supported tool
const CLI_RUNNERS = {
  claude: {
    bin: 'claude',
    buildArgs: (prompt) => ['--print', '--model', 'claude-haiku-4-5-20251001', prompt],
    parseOutput: (stdout) => stdout.trim()
  },
  codex: {
    bin: 'codex',
    buildArgs: (prompt) => ['-q', prompt],
    parseOutput: (stdout) => stdout.trim()
  }
};

/**
 * Check if a binary is available in PATH.
 */
function binaryExists(bin) {
  const result = spawnSync('which', [bin], { encoding: 'utf8', timeout: 3000 });
  return result.status === 0 && Boolean(result.stdout.trim());
}

/**
 * Detect which AI CLIs are available in the current environment.
 * Excludes the current runtime (detected from AIOSON_TOOL or process title).
 */
function detectAvailableCLIs({ excludeCurrent = true } = {}) {
  const currentTool = process.env.AIOSON_TOOL || '';
  const available = [];

  for (const [name, runner] of Object.entries(CLI_RUNNERS)) {
    if (excludeCurrent && currentTool && currentTool.toLowerCase().includes(name)) continue;
    if (binaryExists(runner.bin)) {
      available.push(name);
    }
  }

  return available;
}

/**
 * Send a prompt to a specific CLI and return its response.
 */
function queryCliReviewer(cliName, prompt, timeoutMs = 60_000) {
  const runner = CLI_RUNNERS[cliName];
  if (!runner) return { ok: false, error: `Unknown CLI: ${cliName}` };

  try {
    const result = spawnSync(runner.bin, runner.buildArgs(prompt), {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: 'pipe'
    });

    if (result.status !== 0) {
      return {
        ok: false,
        cli: cliName,
        error: (result.stderr || '').trim() || `exited with code ${result.status}`
      };
    }

    const response = runner.parseOutput(result.stdout || '');
    return { ok: true, cli: cliName, response };
  } catch (err) {
    return { ok: false, cli: cliName, error: err.message };
  }
}

/**
 * Build a review prompt for a given output file.
 */
function buildReviewPrompt(outputContent, reviewCriteria = []) {
  const criteria = reviewCriteria.length > 0
    ? reviewCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '1. Is the content complete and accurate?\n2. Are there any logical errors or gaps?\n3. What could be improved?';

  return `You are reviewing the following output. Be concise and direct.

## Content to Review

\`\`\`
${outputContent.slice(0, 4000)}${outputContent.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

## Review Criteria

${criteria}

## Your Review

Provide your review in 3 sections:
- **Strengths**: what works well
- **Issues**: specific problems found (if any)
- **Recommendations**: concrete improvements (max 3)

Keep total response under 400 words.`;
}

/**
 * Synthesize multiple reviews into a REVIEWS.md document.
 */
function synthesizeReviews(reviews, outputPath, squadSlug) {
  const ts = new Date().toISOString();
  const successful = reviews.filter((r) => r.ok);
  const failed = reviews.filter((r) => !r.ok);

  const lines = [
    `# Cross-AI Review`,
    ``,
    `**Squad:** ${squadSlug || 'unknown'}  `,
    `**Output:** ${outputPath || 'unknown'}  `,
    `**Generated:** ${ts}  `,
    `**Reviewers:** ${successful.map((r) => r.cli).join(', ') || 'none'}`,
    ``
  ];

  if (successful.length === 0) {
    lines.push('> No AI reviewers were available or all failed.');
    if (failed.length > 0) {
      lines.push('');
      lines.push('**Failed reviewers:**');
      for (const f of failed) {
        lines.push(`- ${f.cli}: ${f.error}`);
      }
    }
    return lines.join('\n');
  }

  // Per-reviewer sections
  for (const review of successful) {
    lines.push(`## ${review.cli.charAt(0).toUpperCase() + review.cli.slice(1)}'s Review`);
    lines.push('');
    lines.push(review.response);
    lines.push('');
  }

  // Divergence note (heuristic: reviewers that mention different keywords)
  if (successful.length > 1) {
    const issueKeywords = ['problem', 'error', 'issue', 'missing', 'incorrect', 'wrong', 'fail'];
    const reviewersWithIssues = successful.filter((r) =>
      issueKeywords.some((kw) => r.response.toLowerCase().includes(kw))
    );

    lines.push('---');
    lines.push('');
    lines.push('## Synthesis');
    lines.push('');

    if (reviewersWithIssues.length === 0) {
      lines.push('**Consensus:** All reviewers found no significant issues.');
    } else if (reviewersWithIssues.length === successful.length) {
      lines.push(`**Consensus:** All reviewers identified issues — address before shipping.`);
    } else {
      lines.push(`**Divergence:** ${reviewersWithIssues.map((r) => r.cli).join(', ')} found issues; others approved.`);
    }
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push('> **Note:** The following reviewers failed: ' + failed.map((f) => `${f.cli} (${f.error})`).join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Run the full cross-AI review pipeline.
 *
 * @param {{ projectDir, outputFile, reviewCriteria?, squadSlug?, excludeCurrent?, synthesizeTo? }} opts
 */
async function runCrossAIReview({
  projectDir,
  outputFile,
  reviewCriteria = [],
  squadSlug = '',
  excludeCurrent = true,
  synthesizeTo = null,
  timeoutMs = 60_000
}) {
  // Read output content
  let outputContent;
  try {
    outputContent = await fs.readFile(outputFile, 'utf8');
  } catch {
    return { ok: false, error: `Output file not found: ${outputFile}` };
  }

  // Detect available CLIs
  const clis = detectAvailableCLIs({ excludeCurrent });
  if (clis.length === 0) {
    return {
      ok: false,
      error: 'No AI CLIs detected. Install claude or codex in PATH.',
      detectedCLIs: []
    };
  }

  // Build review prompt
  const prompt = buildReviewPrompt(outputContent, reviewCriteria);

  // Query each reviewer
  const reviews = clis.map((cli) => queryCliReviewer(cli, prompt, timeoutMs));

  // Synthesize
  const markdown = synthesizeReviews(reviews, outputFile, squadSlug);

  // Write REVIEWS.md
  const reviewsPath = synthesizeTo ||
    path.join(path.dirname(outputFile), 'REVIEWS.md');

  await fs.mkdir(path.dirname(reviewsPath), { recursive: true });
  await fs.writeFile(reviewsPath, markdown, 'utf8');

  return {
    ok: true,
    reviewers: clis,
    successCount: reviews.filter((r) => r.ok).length,
    failCount: reviews.filter((r) => !r.ok).length,
    reviewsPath,
    reviews
  };
}

module.exports = { runCrossAIReview, detectAvailableCLIs, synthesizeReviews, buildReviewPrompt };
