# Resultados das entregas e avaliação

> O aioson aprende com o seu próprio uso qual forma de trabalhar traz resultados melhores, sem gastar token: mede cada entrega quando ela fecha, guarda no projeto e devolve uma dica no momento em que a próxima feature começa.

## O ciclo

```
prática detectada ─┐
                   ├─► .aioson/outcomes/{slug}.json ─► REPORT.md ─► dica no @briefing/@refiner/@product
resultado medido ──┘                │
                                    └─ sua nota e seus comentários (tela de avaliação)
```

1. **No fechamento**, o `feature:close` (ou o `agent:done` do `@dev`, quando um Simple Plan fica `status: done`) grava `.aioson/outcomes/{slug}.json`. A gravação acontece logo depois dos gates, antes de qualquer arquivamento, e não usa modelo de IA.
2. **O `REPORT.md`** compara as entregas com e sem cada prática, dentro da mesma classificação (MICRO, SMALL, MEDIUM).
3. **A dica** aparece no `context:brief` do `@briefing`, do `@refiner` e do `@product` quando há evidência forte de uma prática que a feature atual ainda não usa. É uma linha só, e o agente oferece, nunca impõe.
4. **A tela de avaliação** abre no navegador no fim de uma entrega aceita.

## O que é medido

| Prática | Lida de |
|---|---|
| Telas ou referências em imagem na entrada | `plans/{slug}/`, `source_plans` do registro de briefings, `references/` do briefing, imagens citadas nos `.md` do briefing |
| Documentos e dados reais na entrada | Os mesmos lugares, pelo tipo de arquivo |
| Identidade visual extraída de referências | `identity.md` com `source: references` |
| Protótipo aprovado antes do código | Vínculo do protótipo no PRD e manifesto aprovado |
| Mais de uma direção visual explorada | `features/{slug}/design-seed.json` |
| PRD revisado pelo `@sheldon` | `sheldon_review: approved` ou o enriquecimento do sheldon |
| Plano em fases | `implementation-plan-{slug}.md` com duas fases ou mais |
| Build, boot e smoke provados | As verificações de runtime que o gate do fechamento acabou de rodar |
| Uso real no navegador | Evidência do `browser:run` |
| Caçada pós-entrega, decisões registradas, relatório de testes, regras do projeto | Os artefatos de cada um |
| Forma de execução | Simple plan, DEV único ou orquestrada |

| Resultado | Lido de |
|---|---|
| QA aprovado de primeira e voltas FAIL→PASS | A trilha de agentes do dossiê (o mesmo minerador do `harness:retro`) |
| Achados por severidade | Relatórios de QA, planos de correção e relatórios de verificação |
| Tokens | Só quando o host informa (execução orquestrada); nunca estimado |
| Duração | Do primeiro início registrado ao fechamento |
| Gates forçados | Bloqueios pulados com `--force` naquele fechamento |

Valor `null` quer dizer "não dá para medir nesta entrega" e não conta em nenhum lado da comparação.

## Quando uma prática é "melhor"

- É preciso ter pelo menos **3 entregas com e 3 sem** a prática, na mesma classificação.
- A medida principal é o **QA aprovado de primeira**. Quando ela não está registrada, vale a **nota da pessoa** (1 a 5).
- Evidência **forte** = 40 pontos de diferença no QA de primeira, ou 1 ponto de nota. Evidência **fraca** = 20 pontos, ou meio ponto.
- O texto sempre diz "associado a", nunca "causa".

## A tela de avaliação

- Tem nota de 1 a 5, "o que foi bom", "o que poderia ter sido melhor" e a prévia de como o comentário vai ficar guardado.
- Opções para não responder: **Agora não** (só esta entrega), **Pausar por 1 semana**, **Pausar por 1 mês** e **Não perguntar mais**.
- Para não incomodar:
  - abre no máximo uma vez a cada 20 horas;
  - só depois de uma entrega aceita;
  - nunca em teste, CI, máquina sem tela ou com `AIOSON_FEEDBACK=off`.
- `aioson outcome:feedback .` abre a tela quando você quiser. `--on` religa os convites.

## Privacidade

- Tudo fica no projeto, em `.aioson/outcomes/`. As preferências de convite ficam em `~/.aioson/outcomes.json`. **O aioson não envia nada para a internet.** A pasta é versionada junto com o resto de `.aioson/`, então vai para o seu repositório quando você faz commit. Se não quiser isso, coloque `.aioson/outcomes/` no `.gitignore`.
- O registro tem esquema fechado: só números, sim/não e categorias. Um registro com qualquer outro campo é recusado e nunca gravado.
- O único texto livre é o seu comentário, limpo antes de ser guardado: saem caminhos, nomes de arquivo, links, e-mails, IPs, números longos, segredos e o nome do projeto.
- A página roda só em `127.0.0.1`, com um token no endereço, e recusa pedidos de outros sites.
