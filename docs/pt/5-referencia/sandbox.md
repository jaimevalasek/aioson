# Sandbox de Execução

> Executa comandos shell com timeout automático, redação de secrets e summarização de output longo.

O `sandbox:exec` roda comandos em subprocesso isolado com três garantias: o comando é interrompido se passar do tempo máximo, qualquer secret reconhecido no output é redatado antes de ser exibido, e outputs maiores que 5KB são automaticamente resumidos mantendo início e fim.

---

## Comando

### `sandbox:exec`

```bash
aioson sandbox:exec "<comando>" [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--timeout=<ms>` | Interromper após N milissegundos (padrão: 30000) |
| `--cwd=<path>` | Diretório de trabalho do comando |
| `--intent="..."` | Rótulo para output truncado (aparece na marcação de omissão) |
| `--json` | Retorna stdout, stderr, exitCode e timedOut em JSON |

**Exemplos:**

```bash
# Rodar testes com timeout de 60 segundos
aioson sandbox:exec "npm test" --timeout=60000

# Comando que pode exibir secrets (redatado automaticamente)
aioson sandbox:exec "env | grep TOKEN"

# Executar em outro diretório
aioson sandbox:exec "npm run build" --cwd=./frontend

# Capturar resultado estruturado
aioson sandbox:exec "node -e 'console.log(JSON.stringify({ok:true}))'" --json
```

---

## Redação automática de secrets

O output é varrido automaticamente antes de ser exibido. Qualquer padrão reconhecido é substituído por `[REDACTED]`:

| Padrão | Exemplo |
|---|---|
| GitHub token (`ghp_*`) | `ghp_abc123...` → `ghp_[REDACTED]` |
| GitHub fine-grained (`github_pat_*`) | `github_pat_abc...` → `github_pat_[REDACTED]` |
| AWS access key (`AKIA*`) | chave começando com `AKIA` seguida de 16 caracteres → `AKIA[REDACTED]` |
| Google OAuth (`ya29.*`) | `ya29.A0ARrd...` → `ya29.[REDACTED]` |
| Bearer token | `Bearer eyJhb...` → `Bearer [REDACTED]` |
| Senha em URL | `:minhasenha@host` → `:[REDACTED]@host` |
| `password=...` | `password=abc123` → `password=[REDACTED]` |
| `passwd=...` | `passwd=abc123` → `passwd=[REDACTED]` |
| `secret=...` | `secret=xyz` → `secret=[REDACTED]` |
| `api_key=...` | `api_key=sk-abc` → `api_key=[REDACTED]` |
| Bloco de chave privada | linha que começa com `--- BEGIN PRIVATE KEY ---` (PEM) → `[REDACTED]` |

A redação é aplicada tanto ao stdout quanto ao stderr.

---

## Timeout e interrupção

O comando é encerrado com `AbortController` quando o timeout é atingido. O resultado retorna `timedOut: true` e `ok: false`.

```bash
# Vai ser interrompido após 500ms
aioson sandbox:exec "sleep 10" --timeout=500
```

---

## Summarização de output longo

Se o output ultrapassar 5KB, a resposta mantém o início e o fim e indica quantos bytes foram omitidos:

```
[início do output...]

[... 12.450 bytes omitted (npm test) ...]

[...fim do output]
```

Use `--intent="..."` para que o rótulo apareça na marcação de omissão.

---

## JSON output

```json
{
  "ok": true,
  "stdout": "Tests: 42 passed\n",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false,
  "signal": null
}
```

Quando há timeout:

```json
{
  "ok": false,
  "stdout": "",
  "stderr": "Command timed out after 500ms",
  "exitCode": null,
  "timedOut": true
}
```

---

## Quando usar

- Rodar scripts ou testes dentro de uma sessão de agente sem expor secrets do ambiente
- Capturar output de comandos que podem conter variáveis de ambiente sensíveis
- Executar builds ou verificações com tempo máximo controlado
- Testar comandos cujo output vai ser lido de volta pelo agente (redação evita envenenamento de contexto com secrets)
