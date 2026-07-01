# @orchestrator — Maestro de spec para projetos MEDIUM

> **Para quem é:** quem trabalha em projetos MEDIUM e precisa de uma autoridade única de spec que coordene a fase de descoberta e planejamento.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:**
> - Por que `@orchestrator` é o maestro do MEDIUM (não apenas coordenador de execução)
> - Como funciona o fan-out para sub-agentes e a consolidação do pacote de spec
> - Quando (e como) usar lanes paralelas pós-spec

---

## Para que serve

Em projetos MEDIUM, a especificação envolve múltiplas dimensões — domínio, arquitetura, UX, backlog — que precisam ser coordenadas e verificadas antes que o `@dev` comece. Tentar gerenciar cada agente de spec manualmente, em sequência, é lento e sujeito a drift entre artefatos.

`@orchestrator` assume o papel de **maestro de spec**: ele dispara `@analyst`, `@architect` e `@pm` (e `@ux-ui` quando a feature tem UI pesada) como **sub-agentes em fan-out**, depois **consolida, verifica e retrabaha** os artefatos deles num único pacote de spec validado — com Gates A/B/C aprovados — e só então passa o bastão para o `@dev`.

**Regra dura:** `@orchestrator` só ativa em projetos MEDIUM. Para MICRO e SMALL, o `@sheldon` cobre a spec sozinho.

> SMALL = `@sheldon` (vertical, solo). MEDIUM = `@orchestrator` (horizontal, fan-out). Mesma ideia — uma autoridade única de spec — formas diferentes.

---

## O papel duplo do `@orchestrator`

### 1. Maestro de spec (papel principal no MEDIUM)

Sequência padrão da lane MEDIUM:

```
@product → @orchestrator → @dev → @pentester → @qa
```

O `@orchestrator`:
1. Lê o PRD e confirma classificação MEDIUM.
2. (Opcional) Dispara `@sheldon` como pré-etapa para endurecer o PRD antes do fan-out.
3. Fan-out: dispara `@analyst` + `@architect` + `@pm` como sub-agentes (+ `@ux-ui` se UI-heavy).
4. Consolida os artefatos recebidos.
5. Verifica consistência entre eles (detecta drift, gaps, conflitos).
6. Retrabaha as inconsistências detectadas.
7. Produz o pacote de spec consolidado (Gates A/B/C + plano de implementação faseado + harness-contract).
8. Passa para `@dev`.

### 2. Coordenador de lanes paralelas (papel secundário, pós-spec)

Quando a implementação de uma feature MEDIUM tem frentes genuinamente independentes — backend, UI, migrations — o `@orchestrator` pode dividir o trabalho em **lanes** após o pacote de spec estar consolidado:

- Cada lane tem escopo próprio, arquivos permitidos e estado independente.
- `@dev` implementa uma lane por sessão.
- `aioson parallel:merge` faz o merge determinístico no final.

---

## Quando invocar

- Projetos MEDIUM, após `@product` (pacote de spec ainda não existe).
- Quando você quer que a fase de spec rode de forma coordenada, com verificação cruzada entre sub-agentes, sem gerenciar cada um manualmente.

---

## Quando NÃO invocar

- Projeto MICRO ou SMALL → `@sheldon` cobre sozinho; `@orchestrator` recusa e avisa.
- Feature com pacote de spec já consolidado e você só quer dividir a implementação em lanes → use `aioson parallel:init` diretamente.

---

## Diálogo típico

```
Você > @orchestrator

@orchestrator > Verificando classificação... MEDIUM. Confirmado.
                Lendo prd-mvp.md...
                
                Iniciando fan-out de spec:
                ├── @analyst   → mapeamento de domínio e entidades
                ├── @architect → estrutura técnica, libs, integração
                └── @pm        → backlog, user stories, plano de implementação
                
                (+ @ux-ui — feature tem UI pesada, adicionando ao fan-out)
                
                [sub-agentes executados]
                
                Consolidando artefatos...
                Verificando consistência:
                ✓ Entidades do @analyst alinhadas com as decisões do @architect
                ⚠ @pm criou US-07 (notificação SMS) sem AC verificável — retrabalhando
                ✓ @ux-ui spec alinhada com componentes declarados em architecture.md
                
                Gates A/B/C aprovados.
                Pacote de spec consolidado:
                  .aioson/context/requirements-mvp.md
                  .aioson/context/architecture.md
                  .aioson/context/design-doc-mvp.md
                  .aioson/context/implementation-plan-mvp.md
                  .aioson/context/parallel/harness-contract.json
                
                Próximo: @dev.
```

---

## `@sheldon` como pré-etapa (opcional)

Se o PRD tiver gaps ou decisões técnicas difíceis, rode `@sheldon` antes de `@orchestrator` para endurecer o PRD. Também é possível configurar `@orchestrator` para disparar `@sheldon` como um stream do fan-out.

```
@product → @sheldon (endurecimento de PRD) → @orchestrator → @dev → @pentester → @qa
```

---

## Autopilot: travessia automática para `@dev`

Sob autopilot (`auto_handoff: true`, esquema já semeado para a feature, ou token `--auto` recebido do `@product`), `@orchestrator` não para no handoff manual: uma vez com o pacote de spec com gates aprovados (Gates A/B/C, readiness pronta) + `dev-state.md` gravados, ele invoca `@dev` diretamente. O fan-out para `@analyst`/`@architect`/`@pm` acontece como sub-agentes internos — eles não viram estágios do workflow, exceto sob um detour opt-in full-chain. Um gate bloqueado ou readiness `blocked` continua sendo parada manual normal. Veja [Autopilot Handoff](../5-referencia/autopilot-handoff.md).

---

## Opção `--help`

Uma ativação com `--help` (`/orchestrator --help`) imprime um resumo rápido — o que faz, quando usar, opções, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

---

## Saídas em disco

| Arquivo/Diretório | Conteúdo |
|---|---|
| `.aioson/context/requirements-{slug}.md` | Domínio consolidado (de @analyst) |
| `.aioson/context/architecture.md` | Decisões técnicas (de @architect) |
| `.aioson/context/design-doc-{slug}.md` | Spec de UI/UX (de @ux-ui, quando UI-heavy) |
| `.aioson/context/implementation-plan-{slug}.md` | Plano faseado (de @pm) |
| `.aioson/context/parallel/harness-contract.json` | Contrato de sucesso (Gates A/B/C) |
| `.aioson/context/parallel/lane-*.md` | Lanes de execução (quando paralelização é usada) |

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — confirma `classification: MEDIUM`
- `.aioson/context/prd-{slug}.md` — entrada para o fan-out de spec
- `.aioson/context/parallel/` — ao retomar sessão com lanes já criadas

---

## Comandos CLI relacionados

```bash
# Ver progresso de cada lane
aioson parallel:status .

# Validar que uma lane está autorizada a escrever num arquivo
aioson parallel:guard . --lane=1 --paths=src/models/payment.js

# Merge final (quando todas as lanes estão prontas)
aioson parallel:merge . --apply

# Corrigir workspace quebrado
aioson parallel:doctor . --fix
```

---

## Handoff típico

- **Vem de:** `@product`
- **Vai para:** `@dev`

---

## Próximo passo

- [Ficha do @dev](./dev.md) — executa o plano produzido pelo orchestrator
- [Ficha do @sheldon](./sheldon.md) — autoridade de spec para SMALL; pré-etapa opcional no MEDIUM
- [Decisões iniciais: MEDIUM](../2-comecar/decisoes-iniciais.md#medium--maestro-lane)
