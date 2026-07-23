# Execução de agentes, faixas de desenvolvimento e modelos

O AIOSON usa `.aioson/context/agent-execution-{feature}.json` para executar uma tarefa delimitada por um host CLI e um modelo registrados. Esse manifesto é configuração de runtime, não outra especificação.

## Padrões

Um manifesto novo habilita somente:

- `dev`;
- `qa`.

`tester`, `pentester`, `validator` e todas as faixas de desenvolvimento começam desligados. A classificação MICRO/SMALL/MEDIUM nunca os habilita.

A rota canônica continua Product → Planner → DEV → QA. Faixas opcionais rodam dentro do DEV; revisores opcionais só podem rodar depois do QA quando estiverem explicitamente habilitados e tiverem um gatilho concreto.

## Comandos

```bash
aioson agent:execution:init . --feature=minha-feature --host=codex
aioson agent:execution:validate . --feature=minha-feature --json
aioson agent:execution:show . --feature=minha-feature --json
aioson agent:execution:dispatch . --feature=minha-feature --agent=qa
aioson agent:execution:dispatch . --feature=minha-feature --lane=backend
aioson agent:execution:resume . --feature=minha-feature
aioson agent:execution:status . --feature=minha-feature --json
```

A inicialização é create-once. Novos init, resume e seeds do workflow preservam byte por byte o manifesto que já pertence ao desenvolvedor.

## Faixas de desenvolvimento

Use faixas somente quando o usuário ou o plano aprovado pedir hosts/modelos diferentes ou escopos separados.

```json
{
  "development_lanes": {
    "strategy": "split",
    "integration_owner": "dev",
    "lanes": {
      "backend": {
        "enabled": true,
        "host": "codex",
        "mode": "external",
        "model": "gpt-5.6-sol",
        "reasoning_effort": "high",
        "writable_roots": [],
        "prompt": ".aioson/context/execution-prompts/minha-feature/backend.md",
        "write_paths": ["src/api/**", "tests/api/**"],
        "fallbacks": [],
        "report": ".aioson/context/reports/minha-feature/{run_id}/dev-backend.json"
      },
      "frontend": {
        "enabled": true,
        "host": "opencode",
        "mode": "external",
        "model": "provider/model-id",
        "writable_roots": [],
        "prompt": ".aioson/context/execution-prompts/minha-feature/frontend.md",
        "write_paths": ["src/ui/**", "tests/ui/**"],
        "fallbacks": [],
        "report": ".aioson/context/reports/minha-feature/{run_id}/dev-frontend.json"
      }
    }
  }
}
```

`host` identifica um adaptador CLI registrado; `model` é o identificador de modelo/provedor aceito por esse host. Um modelo como Grok pode ser usado por um host compatível, como OpenCode; não é necessário criar agentes canônicos `@frontend` e `@backend`.

O DEV cria o prompt curto de runtime a partir do PRD e do plano aprovados, despacha as faixas habilitadas sequencialmente no worktree compartilhado, confere o diff contra `write_paths`, integra as fronteiras compartilhadas e roda a verificação completa. O relatório vincula a identidade da faixa e seus caminhos declarados.

Os adaptadores registrados atualmente incluem Codex, Claude Code, OpenCode e Kimi Code. Um host novo precisa de adaptador para manter resolução de executável, capabilities, argumentos, redação e telemetria em modo fail-closed.

## Fallback somente explícito

CLI ausente, capability incompatível ou modelo indisponível pausa a execução. O modelo do chat atual nunca pode imitar silenciosamente o modelo solicitado.

Um fallback só roda quando a entrada e a política global o autorizam:

```json
{
  "fallbacks": [
    {
      "host": "codex",
      "model": "configured-default",
      "on": ["unavailable", "capacity"]
    }
  ],
  "capacity_policy": {
    "strategy": "fallback",
    "max_attempts": 2,
    "backoff_ms": 0,
    "allow_cross_host": true
  }
}
```

Sem essa declaração, o estado fica `paused` e traz um comando de retomada.

## Resolução e vínculo do relatório

Nomes de modelos Codex são resolvidos de forma conservadora pelo catálogo local: slug exato, nome normalizado, alias único e correção curta limitada. Versões numéricas nunca mudam. Outros hosts aceitam IDs literais seguros quando não possuem catálogo.

Estado, relatório e telemetria preservam:

- modelo solicitado e resolvido;
- estratégia de resolução;
- reasoning effort quando suportado;
- host e histórico de fallback;
- feature, run, tentativa, agente/faixa, raízes graváveis e caminhos declarados.

Relatórios que não correspondem à tentativa registrada são recusados.

## Política de revisão

`aioson verification:plan . --feature=minha-feature --trigger=per-phase` não roda revisor por padrão. Em `end-of-feature`, somente QA é padrão. Tester, Pentester e Validator só rodam quando sua entrada no manifesto estiver habilitada e o gatilho correspondente existir.
