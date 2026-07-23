# AIOSON Play — Voz local (Text-to-Speech): como um app consome

Este doc explica como qualquer app instalado no Play pode gerar áudio falado
(inglês americano, voz Kokoro local, offline) sem embutir nenhum modelo de TTS
próprio. É o mesmo mecanismo que o English Tube foi desenhado pra usar.

## 0. TL;DR pra IA — leia isto antes de codar

1. **Não precisa de SDK.** É HTTP puro no ProductBridge (`http://localhost:5180`),
   igual aos outros endpoints documentados em `ai-app-integration.md` §7. `fetch()`
   funciona de qualquer frontend/backend do app, sem `@tauri-apps/api`.
2. **Uma chamada gera o áudio, outra toca.** `POST /api/tts/synthesize` retorna um
   `audioUrl`; seu app toca com `<audio src={audioUrl} />` ou `new Audio(audioUrl).play()`.
3. **Seu app NUNCA aciona o download do modelo.** Se o modelo não estiver
   instalado, você recebe `MODEL_NOT_INSTALLED` — mostre um estado degradado e
   oriente o usuário a ir em `Configurações → Entrada e saída de voz`. Baixar
   modelo é ação exclusiva do dono, a partir do Settings do Play.
4. **Só `en-US` no MVP.** Outros `locale` retornam `UNSUPPORTED_LOCALE`.
5. **Texto tem teto de 1000 caracteres** (após trim/normalização de espaços).
   Textos maiores: quebre em frases antes de chamar.
6. **Cachear é automático.** O mesmo texto normalizado + voz + velocidade retorna
   `cacheHit: true` sem re-sintetizar — não implemente seu próprio cache de áudio.

## 1. O que é

Provider único: `kokoro_local` (Kokoro-82M, ONNX, rodando in-process no Rust do
Play — `ort` + G2P `misaki-rs`, sem depender de rede pra sintetizar). O Play é
dono do ciclo de vida do modelo (download sob consentimento, verificação por
SHA-256, cache de áudio, métricas agregadas); apps só consomem a API.

- Vozes disponíveis (todas inglês americano): `af_heart` (default, feminina),
  `af_bella`, `af_nicole` (femininas), `am_fenrir`, `am_michael`, `am_puck`
  (masculinas — escolhidas pela nota oficial do Kokoro em `VOICES.md`: essas
  três são grade C+, o melhor patamar entre as vozes masculinas do catálogo;
  `am_adam`, usada até 2026-06-30, tinha grade F+ e foi removida).
- Saída: WAV 24kHz mono, servido por URL local — nunca um path de arquivo
  absoluto.
- Privacidade: o texto enviado nunca sai da máquina e nunca é persistido em
  filenames, logs, métricas ou linhas de cache — só o hash normalizado.

## 2. Endpoints

| Endpoint | Método | Para que |
|---|---|---|
| `/api/tts/synthesize` | `POST` | Sintetiza (ou retorna do cache) o áudio de um texto |
| `/api/tts/audio/{artifactId}` | `GET` | Serve o WAV indexado pelo `artifactId` retornado acima |

Base URL: `http://localhost:5180` (ProductBridge — mesmo servidor de
`/api/registry`, `/api/mcp/execute` etc., ver `ai-app-integration.md` §7).

### 2.1 `POST /api/tts/synthesize`

Requisição:

```json
{
  "text": "Repeat after me.",
  "locale": "en-US",
  "voice": "af_heart",
  "speed": 1.0
}
```

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `text` | string | Sim | Não vazio após trim; máx. 1000 caracteres |
| `locale` | string | Sim | Só `"en-US"` no MVP |
| `voice` | string | Não | Default = voz selecionada nas Configurações (`af_heart` de fábrica). Deve estar na allowlist. |
| `speed` | number | Não | `0.75`–`1.25`. Default = velocidade selecionada nas Configurações (`1.0` de fábrica). |

Resposta de sucesso (`200`):

```json
{
  "ok": true,
  "audioUrl": "http://localhost:5180/api/tts/audio/tts_3f9a1c...",
  "cacheHit": false,
  "provider": "kokoro_local",
  "modelVersion": "kokoro-82m-v1",
  "voice": "af_heart",
  "locale": "en-US",
  "durationMs": 842
}
```

Resposta de falha (ainda `200` — cheque `ok`, não o status HTTP):

```json
{
  "ok": false,
  "error": {
    "code": "MODEL_NOT_INSTALLED",
    "message": "Instale a voz local do Play em Configurações.",
    "action": "open_settings_voice"
  }
}
```

### 2.2 `GET /api/tts/audio/{artifactId}`

Serve o WAV pelo `artifactId` retornado em `audioUrl` — sempre use o
`audioUrl` retornado, nunca construa a URL manualmente. Responde `200` +
`audio/wav`, ou `404` + o mesmo formato `{ ok: false, error }` acima
(`AUDIO_NOT_FOUND`) se o artefato não existir mais (cache limpo, modelo
removido, ou evicção por espaço — ver §5).

## 3. Taxonomia de erros

| `code` | Gatilho | O que seu app deve fazer |
|---|---|---|
| `MODEL_NOT_INSTALLED` | Nenhum modelo verificado instalado | Mostrar estado degradado + orientar pra `Configurações → Entrada e saída de voz`. **Nunca tente baixar você mesmo.** |
| `MODEL_DOWNLOADING` | Install/repair em andamento | Repetir mais tarde; não inicie outra instalação |
| `MODEL_CORRUPTED` | Falha de manifest/checksum/runtime | Pedir pro dono reparar/reinstalar em Configurações |
| `UNSUPPORTED_LOCALE` | `locale` != `en-US` | Mostrar quais locales são suportados |
| `UNSUPPORTED_VOICE` | Voz fora da allowlist | Repetir com a voz default |
| `INVALID_TEXT` | Texto vazio após normalização | Pedir texto não vazio |
| `TEXT_TOO_LONG` | Texto > 1000 caracteres | Quebrar o texto antes de chamar de novo |
| `INVALID_SPEED` | `speed` fora de `0.75..1.25` | Fixar/clampar antes de reenviar |
| `SYNTHESIS_BUSY` | Já existe uma síntese ou um install/repair/remove em andamento | Retry com backoff curto |
| `SYNTHESIS_FAILED` | Kokoro/runtime falhou após validação | Oferecer retry |
| `CACHE_WRITE_FAILED` | Não conseguiu persistir o áudio local | Oferecer retry / avisar sobre espaço em disco |
| `AUDIO_NOT_FOUND` | `artifactId` não resolve mais | Chamar `synthesize` de novo (o áudio será regerado) |

## 4. Exemplo de código

Sem SDK — `fetch()` puro, do frontend ou do backend do seu app:

```typescript
type TtsResponse =
  | { ok: true; audioUrl: string; cacheHit: boolean; provider: string; modelVersion: string; voice: string; locale: string; durationMs: number }
  | { ok: false; error: { code: string; message: string; action?: string } };

async function speak(text: string): Promise<void> {
  const res = await fetch("http://localhost:5180/api/tts/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale: "en-US" }),
  });
  const payload = (await res.json()) as TtsResponse;

  if (!payload.ok) {
    if (payload.error.code === "MODEL_NOT_INSTALLED") {
      // Mostre um botão/link "Instalar voz local" que leva pra
      // Configurações → Entrada e saída de voz. NÃO chame install você mesmo —
      // essa é uma ação exclusiva do owner dentro do Play.
      showDegradedVoiceState();
      return;
    }
    console.warn(`TTS failed: ${payload.error.code} — ${payload.error.message}`);
    return;
  }

  await new Audio(payload.audioUrl).play();
}
```

```bash
# Smoke manual (Play precisa estar rodando)
curl -s http://localhost:5180/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Repeat after me.","locale":"en-US"}' | jq
```

## 5. Cache e limites de recurso

- Áudio é cacheado automaticamente por `(provider, versão do modelo/checksum,
  locale, voz, velocidade, hash do texto normalizado)` — repetir o mesmo
  pedido retorna `cacheHit: true` sem re-sintetizar.
- O cache local tem teto de **200MB**; quando excedido, entradas menos
  recentemente usadas são removidas automaticamente (LRU por
  `last_accessed_at`) a cada nova síntese. Não assuma que um `audioUrl`
  antigo continua válido pra sempre — se um `GET` retornar
  `AUDIO_NOT_FOUND`, apenas sintetize de novo.
- Não existe rate limit dedicado por app — a síntese é single-flight (uma por
  vez no processo do Play; concorrência extra recebe `SYNTHESIS_BUSY`). Evite
  chamar em loop apertado; prefira debounce/gate no seu app.

## 6. Onde está implementado (Play, pra quem for aprofundar)

- `src-tauri/src/local_tts/` — módulo Rust: `bridge.rs` (rotas/validação/cache),
  `provider.rs` (inferência Kokoro via `ort`), `phonemes.rs` (G2P via
  `misaki-rs` + vocabulário Kokoro-82M), `model.rs` (manifest/download/checksum),
  `cache.rs` (chaves/eviction), `store.rs` (SQLite `aioson-play-tts.db`).
- `src-tauri/src/http_server.rs` — dispatch das rotas `/api/tts/*` no
  ProductBridge.
- `src/services/local-tts.ts` — cliente TypeScript de referência (usado pelo
  próprio Settings do Play; mesmo padrão `fetch()` que seu app deve seguir).
- `src/components/features/local-tts/LocalTtsSettingsPanel.tsx` — UI de
  instalar/remover/reparar/limpar cache/selecionar voz, se você quiser
  entender o fluxo de consentimento do lado do dono.
- Feature arquivada: `.aioson/context/done/local-neural-tts/` (PRD,
  requirements, spec, design-doc — histórico completo da decisão e das ACs).

## 7. Checklist rápido pro seu app

- [ ] Nunca chama `install_local_tts_model` (é um comando Tauri interno do
      Play, não uma rota do ProductBridge — nem estaria acessível a apps)
- [ ] Trata `MODEL_NOT_INSTALLED` com estado degradado + link pras
      Configurações, não com erro genérico
- [ ] Usa sempre o `audioUrl` retornado pela resposta, nunca monta a URL à mão
- [ ] Não implementa cache de áudio próprio — o Play já cacheia
- [ ] Não manda texto > 1000 caracteres numa chamada só
- [ ] Trata `AUDIO_NOT_FOUND` regenerando (chamando `synthesize` de novo), não
      como erro fatal
