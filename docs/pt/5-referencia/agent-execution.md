# Execução de agentes e resolução de modelos

O subsistema de execução de agentes permite validar e despachar subagentes a partir de um manifesto por feature. Ele separa o modelo solicitado do modelo efetivamente executado, resolve nomes humanos ou com pequenos erros contra o catálogo local do Codex e mantém essa decisão nos relatórios e na telemetria.

## Quando usar

Use este fluxo quando uma feature precisa executar `@qa`, `@tester`, `@pentester`, `@validator` ou outro agente em um processo separado, com contrato verificável e possibilidade de retomada.

O fluxo é opt-in por feature. A ausência do manifesto preserva o comportamento legado (`configured-default`).

## Ciclo básico

```bash
aioson agent:execution:init . --feature=minha-feature --host=codex
aioson agent:execution:validate . --feature=minha-feature --json
aioson agent:execution:show . --feature=minha-feature --json
aioson agent:execution:dispatch . --feature=minha-feature --agent=qa
aioson agent:execution:status . --feature=minha-feature --json
aioson agent:execution:events . --feature=minha-feature --run=<telemetry_run_id>
```

Se uma execução ficar pausada, retome com:

```bash
aioson agent:execution:resume . --feature=minha-feature
```

Todos os comandos que produzem dados para automação aceitam `--json`.

## Manifesto

O arquivo é criado dentro dos artefatos da feature. Um exemplo mínimo:

```json
{
  "version": 1,
  "feature": "minha-feature",
  "host": "codex",
  "agents": {
    "qa": {
      "mode": "native",
      "model": "GPT 5.6 Terra",
      "reasoning_effort": "high",
      "report": ".aioson/context/done/minha-feature/qa-report-{run_id}.md"
    }
  }
}
```

O manifesto guarda exatamente o valor pedido. O dispatcher não o reescreve; o valor canônico resolvido fica na tentativa (`attempt`) e no relatório.

## Como o modelo é resolvido

Para `codex`, o AIOSON lê o catálogo local em `~/.codex/models_cache.json` (ou em `$CODEX_HOME`). A seleção é determinística e conservadora, nesta ordem:

1. slug exato;
2. nome normalizado (`gpt-5.6-terra`, `GPT 5.6 Terra`, acentos e separadores equivalentes);
3. alias único por sufixo;
4. correção aproximada limitada (por exemplo, um typo curto);
5. falha explícita quando não há candidato ou há ambiguidade.

Os números informados são invariantes: `gpt-5.6` nunca pode virar `gpt-5.5`. Um alias genérico como `gpt` não é suficiente para escolher um modelo.

O resultado expõe:

- `model_requested`: o texto original;
- `model_resolved`: o slug canônico;
- `model_resolution_strategy`: `exact_slug`, `normalized_name`, `unique_alias`, `fuzzy_unique`, `configured_default` ou `unverified_literal`;
- `catalog_source` e `catalog_fetched_at`, quando o catálogo estava disponível.

Ambiguidade, catálogo inválido, catálogo grande demais e entradas fora dos limites são bloqueados antes do spawn. Sem catálogo, um ID literal seguro pode continuar como `unverified_literal`; o AIOSON nunca finge que validou disponibilidade.

## Reasoning effort

`reasoning_effort` é independente do nome do modelo. Os valores aceitos pelo manifesto são `low`, `medium`, `high`, `xhigh`, `max` e `ultra`. Quando o catálogo informa níveis do modelo, o AIOSON recusa um nível incompatível; não faz downgrade silencioso.

```json
{
  "model": "gpt-5.6-terra",
  "reasoning_effort": "high"
}
```

O nível escolhido acompanha a tentativa, o fallback, o relatório, o plano de verificação e os eventos de telemetria. Se o fallback não suporta o nível pedido, a execução pausa e pede correção.

## Fallback e capacidade

O dispatcher valida host, modo, executável, permissões de escrita e capability antes de iniciar o processo. Uma falha transitória pode seguir a sequência de fallback configurada, mas cada candidato é resolvido e validado novamente. Se nenhum candidato for seguro, o estado vira `paused` e o comando de `resume` é retornado.

Relatórios são aceitos somente quando pertencem à tentativa registrada: caminho, feature, agente, modelo resolvido, estratégia, reasoning effort e veredicto são comparados antes de avançar o estado.

## Observabilidade

`status` mostra as tentativas por feature/agente. `events` lê eventos ordenados por cursor, com limites e saída sanitizada. O runtime preserva correlação entre `run_id`, feature, agente, host, modelo solicitado/resolvido e transições como `retry`, `fallback`, `paused`, `passed` e `failed`.

Para investigar uma execução:

```bash
aioson agent:execution:status . --feature=minha-feature --agent=qa --json
aioson agent:execution:events . --feature=minha-feature --run=<run_id> --limit=100 --json
```

## Segurança e limites

- nomes de modelo têm tamanho máximo de 200 caracteres;
- o catálogo local é limitado a 5 MiB e 1.000 modelos;
- IDs aceitos usam apenas caracteres literais seguros;
- caminhos de prompt e relatório ficam dentro das raízes permitidas;
- stdout/stderr de subagentes são tratados como saída não confiável e passam por redação e limites;
- adapters indisponíveis falham fechado; não há simulação de sucesso.

## Integração com o plano de verificação

Quando a feature possui manifesto, `aioson verification:plan` usa o mesmo resolver. A saída mostra o modelo solicitado, o resolvido, a estratégia e o reasoning effort de cada verificador:

```bash
aioson verification:plan . --feature=minha-feature --trigger=per-phase --json
```

Assim, o plano, o spawn e a auditoria não podem divergir sobre qual modelo será usado.
