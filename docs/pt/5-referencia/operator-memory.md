# Memória do operador

A memória do operador guarda decisões persistentes da pessoa que usa o AIOSON, separadas por identidade local. Ela é opcional, fica em `~/.aioson/operators/` e não deve ser commitada no projeto.

## Ativar ou desativar

Em instalações v1.15.0 ou mais novas, o carregamento automático fica **ligado por padrão**. Para desativar explicitamente:

```bash
$env:AIOSON_OPERATOR_MEMORY="false"  # PowerShell
export AIOSON_OPERATOR_MEMORY=false   # macOS/Linux
```

Em instalações antigas, `AIOSON_OPERATOR_MEMORY=true` ativa o comportamento. Quando habilitado, o agente lê `MEMORY.md` no início da sessão e carrega uma decisão completa apenas quando o título ou o tipo de sinal combina com a tarefa. Se uma regra em `.aioson/rules/` conflitar com uma decisão, a regra do projeto sempre vence e o aviso aparece no stderr.

## Identidade e armazenamento

Por padrão a identidade é `sha256(git config user.email)[0..16]`. Em CI ou em uma máquina compartilhada, use um ID explícito por processo:

```bash
aioson op:identity show --json
aioson op:identity set ci-bot-shared
```

O armazenamento fica em:

```text
~/.aioson/operators/{identity}/
├── MEMORY.md              # decisões ativas, carregadas no preflight
├── MEMORY-archive.md      # decisões arquivadas, carregadas sob demanda
├── decisions/             # fonte de verdade das decisões
├── proposals/             # sinais aguardando promoção
└── history/               # itens esquecidos/arquivados
```

O ID explícito vale para o processo atual; persista-o no ambiente do CI se esse for o comportamento desejado.

## Capturar uma decisão

Agentes observam quatro tipos de sinal: `authorization`, `exclusion`, `correction` e `confirmation`.

```bash
aioson op:capture \
  --signal=authorization \
  --quote="Pode commitar depois que eu aprovar a fatia" \
  --proposal="commit autônomo após aprovação explícita" \
  --source-agent=dev
```

O slug é derivado de forma determinística do proposal. A promoção depende do tipo de sinal:

| Sinal | Detecções para promover |
|---|---:|
| `authorization` | 1 |
| `exclusion` | 1 |
| `correction` | 1 |
| `confirmation` | 2 |

Uma autorização, exclusão ou correção explícita já é uma decisão permanente. `confirmation` continua exigindo duas ocorrências para evitar transformar uma aceitação pontual em preferência estável.

## Reforço idempotente

Se um sinal já promovido aparecer novamente, ele não cria outra linha no índice FTS nem reseta `promoted_at`. O AIOSON atualiza somente `last_reinforced` e incrementa `reinforcement_count`.

Para reforçar manualmente uma decisão:

```bash
aioson op:reinforce commit-autonomo-apos-aprovacao --json
```

O comando preserva título, corpo e trigger quotes byte a byte. Para desfazer uma decisão, use o slug exibido no `op:capture`:

```bash
aioson op:forget commit-autonomo-apos-aprovacao
```

## Inspecionar e administrar

```bash
aioson op:list
aioson op:list --proposals
aioson op:list --include-archived
aioson op:show <slug> --json
```

`MEMORY.md` é um índice pequeno; o corpo da decisão vive em `decisions/{slug}.md`. O arquivo `MEMORY-archive.md` contém decisões fora do tier ativo, e `history/` recebe itens esquecidos.

## Privacidade e limites

- a memória é por identidade e não é sincronizada pelo Git;
- `quotes` são limitadas e servem como trilha de auditoria;
- captura é best-effort: uma falha não deve interromper a sessão do agente;
- regras do projeto vencem decisões pessoais;
- o índice SQLite/FTS5 é local e regenerável a partir dos arquivos Markdown;
- para compartilhar uma decisão com a equipe, registre-a em uma regra ou documento versionado do projeto, não copie `~/.aioson/operators/`.

## Diagnóstico rápido

1. Rode `aioson op:identity show` e confirme a identidade esperada.
2. Verifique `AIOSON_OPERATOR_MEMORY=true` no mesmo processo do cliente de IA.
3. Rode `aioson op:list --proposals` para diferenciar sinal pendente de decisão promovida.
4. Use `aioson op:show <slug>` para conferir `signal_type`, `promoted_at` e `last_reinforced`.
5. Se o título não aparecer, confira se `.aioson/rules/` está vencendo a decisão ou se o item foi arquivado.
