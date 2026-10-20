'use strict';

// Pedidos autenticados a um site da loja, iguais em todos os comandos store:
// o erro do site vira a mensagem (`HTTP 413: …`) e resposta sem JSON é `null`.
// Cada comando escolhe o tempo-limite do POST; o GET é sempre 15 s.

async function storeRequest(url, token, init, timeoutMs) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* resposta sem JSON */ }
  if (!response.ok) {
    const detail = (parsed && parsed.error) ? String(parsed.error) : `${response.status} ${response.statusText}`;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return parsed;
}

function storeGet(url, token) {
  return storeRequest(url, token, {}, 15000);
}

function storePostJson(url, payload, token, timeoutMs) {
  return storeRequest(url, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }, timeoutMs);
}

module.exports = { storeRequest, storeGet, storePostJson };
