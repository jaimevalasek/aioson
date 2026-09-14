'use strict';

const { StringDecoder } = require('node:string_decoder');

const TOKEN_KEYS = ['input_tokens', 'uncached_input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'output_tokens', 'reasoning_tokens'];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const sumKnown = values => values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;

function normalizeUsage(host, raw) {
  if (!raw || typeof raw !== 'object') return null;
  let input, uncached, read, write, output, reasoning;
  let basis = 'inclusive';
  if (host === 'opencode') {
    uncached = count(raw.input);
    read = count(raw.cache?.read);
    write = count(raw.cache?.write);
    input = sumKnown([uncached, read, write]);
    reasoning = count(raw.reasoning);
    output = sumKnown([count(raw.output), reasoning]); // OpenCode separates reasoning from visible output.
  } else if (host === 'claude') {
    uncached = count(raw.input_tokens);
    read = count(raw.cache_read_input_tokens);
    write = count(raw.cache_creation_input_tokens);
    input = sumKnown([uncached, read, write]);
    output = count(raw.output_tokens);
    reasoning = null;
  } else if (host === 'codex') {
    input = count(raw.input_tokens);
    read = count(raw.cached_input_tokens);
    write = 0; // This protocol does not bill cache creation separately.
    uncached = input !== null && read !== null && read <= input ? input - read : null;
    output = count(raw.output_tokens);
    reasoning = count(raw.reasoning_output_tokens);
  } else if (host === 'antigravity') {
    // Published AGY examples disagree on whether cached input is included.
    // Preserve the reported number; never fabricate a billing decomposition.
    input = count(raw.input_tokens);
    read = count(raw.cache_read_tokens);
    write = count(raw.cache_creation_tokens);
    uncached = null;
    output = count(raw.output_tokens);
    reasoning = count(raw.thinking_tokens);
    basis = 'provider_reported_cache_inclusion_unknown';
  } else return null;
  if (input === null && uncached === null && output === null) return null;
  return { input_tokens: input, uncached_input_tokens: uncached, cache_read_tokens: read, cache_write_tokens: write, output_tokens: output, reasoning_tokens: reasoning, input_basis: basis };
}

function aggregateUsage(records) {
  const present = records.filter(Boolean);
  const totals = Object.fromEntries(TOKEN_KEYS.map(key => [key, present.length && present.every(row => count(row[key]) !== null) ? present.reduce((sum, row) => sum + row[key], 0) : null]));
  return { ...totals, measured_attempts: present.length, total_attempts: records.length, complete: records.length > 0 && present.length === records.length && present.every(row => row.complete !== false), input_basis: present.some(row => row.input_basis !== 'inclusive') ? 'mixed_or_unknown' : 'inclusive' };
}

/** Bounded JSONL parser. Text/tool payloads are neither retained nor executed. */
function createUsageCollector(host, { onUpdate, onContext, onEvent, maxLineBytes = 1024 * 1024 } = {}) {
  const decoder = new StringDecoder('utf8');
  const entries = new Map();
  let pending = '', discarding = false, truncated = false, terminal = null, turn = 0;
  let session = null, peak = null, contextSource = null, actualCost = null, lastUpdate = null;
  const snapshot = () => {
    const usage = terminal || (entries.size ? aggregateUsage([...entries.values()]) : null);
    return usage ? { ...usage, source: `${host}_structured_output`, complete: !truncated && (terminal !== null || host === 'opencode'), peak_context_tokens: peak, context_source: contextSource, session_id: session, reported_cost_usd: actualCost } : null;
  };
  const context = (tokens, source, window = null) => {
    if (count(tokens) === null) return;
    peak = Math.max(peak || 0, tokens);
    contextSource = source;
    onContext?.({ tokens, source, context_window_tokens: count(window) });
  };
  const accept = event => {
    if (!event || typeof event !== 'object') return;
    onEvent?.(event);
    if (host === 'codex') {
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') session = event.thread_id.slice(0, 200);
      if (event.type === 'turn.started') turn++;
      if (event.type === 'turn.completed') {
        const usage = normalizeUsage(host, event.usage);
        if (usage) { entries.set(`turn:${turn}`, usage); terminal = aggregateUsage([...entries.values()]); }
      }
      // Some harness versions expose per-call info. Turn totals alone are NOT
      // the current context window and must never trigger a context restart.
      const payload = event.type === 'event_msg' ? event.payload : event;
      if (payload?.type === 'token_count' && payload.info?.last_token_usage) context(payload.info.last_token_usage.total_tokens, 'harness_last_call', payload.info.model_context_window);
    } else if (host === 'opencode' && event.type === 'step_finish') {
      const part = event.part;
      if (!part || typeof part.id !== 'string') return;
      const usage = normalizeUsage(host, part.tokens);
      if (!usage) return;
      session = typeof event.sessionID === 'string' ? event.sessionID.slice(0, 200) : session;
      const key = part.id.slice(0, 200);
      // Repeated part updates replace rather than add the same model call.
      entries.set(key, { ...usage, reported_cost_usd: typeof part.cost === 'number' && Number.isFinite(part.cost) && part.cost >= 0 ? part.cost : null });
      const costs = [...entries.values()].map(row => row.reported_cost_usd);
      actualCost = costs.every(value => value !== null) ? costs.reduce((sum, value) => sum + value, 0) : null;
      context(usage.input_tokens, 'harness_step_input');
    } else if (host === 'antigravity') {
      if (event.event === 'init' && typeof event.conversation_id === 'string') session = event.conversation_id.slice(0, 200);
      const step = event.step_update;
      if (event.event === 'step_update' && step?.state === 'DONE' && Number.isSafeInteger(step.step_index)) {
        const usage = normalizeUsage(host, step.usage);
        if (usage) entries.set(String(step.step_index), usage);
      }
      if (event.event === 'result') terminal = normalizeUsage(host, event.result?.usage);
    } else if (host === 'claude') {
      if (event.type === 'result') {
        // Execution errors can return zeroed totals. Assistant output counts
        // are placeholders; modelUsage is the authoritative fallback when supplied.
        const models = event.modelUsage && typeof event.modelUsage === 'object' ? Object.values(event.modelUsage) : [];
        const modelUsage = models.map(row => normalizeUsage(host, {
          input_tokens: row.inputTokens, output_tokens: row.outputTokens,
          cache_read_input_tokens: row.cacheReadInputTokens, cache_creation_input_tokens: row.cacheCreationInputTokens
        })).filter(Boolean);
        if (modelUsage.length) terminal = aggregateUsage(modelUsage);
        else if (event.subtype !== 'error_during_execution' && event.subtype !== 'error_max_budget_usd') terminal = normalizeUsage(host, event.usage);
        actualCost = typeof event.total_cost_usd === 'number' && event.total_cost_usd >= 0 && Number.isFinite(event.total_cost_usd) ? event.total_cost_usd : null;
      }
      if (typeof event.session_id === 'string') session = event.session_id.slice(0, 200);
      if (event.type === 'assistant' && event.message?.id) {
        const usage = normalizeUsage(host, event.message.usage);
        if (usage) { entries.set(String(event.message.id).slice(0, 200), { ...usage, output_tokens: null }); context(usage.input_tokens, 'harness_message_input'); }
      }
    }
    if (entries.size > 10000) { entries.delete(entries.keys().next().value); truncated = true; }
    const value = snapshot();
    const encoded = JSON.stringify(value);
    if (encoded !== lastUpdate) { lastUpdate = encoded; if (value) onUpdate?.(value); }
  };
  const line = text => { try { accept(JSON.parse(text)); } catch { /* ordinary text or unsupported event */ } };
  return {
    push(chunk) {
      const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      for (const piece of text.split(/(?<=\n)/)) {
        const ended = piece.endsWith('\n');
        if (!discarding) {
          pending += piece;
          if (Buffer.byteLength(pending) > maxLineBytes) { pending = ''; discarding = true; truncated = true; }
        }
        if (ended) { if (!discarding) line(pending); pending = ''; discarding = false; }
      }
    },
    finish() { pending += decoder.end(); if (pending && !discarding) line(pending); pending = ''; return snapshot(); },
    snapshot
  };
}

module.exports = { TOKEN_KEYS, normalizeUsage, aggregateUsage, createUsageCollector };
