---
slug: sdd-system-tutorial
status: done
owner: dev
created_at: 2026-09-11
updated_at: 2026-09-11
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan — Tutorial SDD para leigos

## Scope
Substituir o tutorial SDD por um guia atual do AIOSON 1.66.0, no estilo de memories, explicando a jornada da ideia à evidência de QA com exemplos sintéticos.

## Context selected
- project.context.md validado pelo CLI; context:brief para a documentação.
- Regras obrigatórias: visual-exploration-contract, disk-first-artifacts, output-brevity e source-code-language-convention; fundação, memory-index, dev-state e pulse lidos.
- execution-roles-onboarding é feature alheia: preservar pulse/workflow; não chamar workflow:next.
- Padrão: tutorials/memories, HTML/CSS/JS estático, Tinta/Porcelana e tokens do DNA solicitado pelo usuário.
- Fontes: kernels Briefing/Refiner/Product/Sheldon/Planner/Dev/QA, skill SDD e referência Planner como documentação do sistema; workflow-profile, workflow-next, execution-plan/run, gate-check, implementation-plan e feature-trace como evidência de implementação.
- Guias antigos usam cadeia documental aposentada e números de economia sem evidência. Reescrever o índice; integrar automação ao guia e conservar a URL antiga como ponte para o capítulo atual.

## Implementation intelligence
- Reutilizar tokens.css e style.css de memories por referência, sem modificá-los; CSS SDD apenas para diagrama e exemplo interativo.
- JavaScript nativo para tema, navegação, etapas do exemplo e impressão; texto completo acessível sem JavaScript.
- Sem dependências, APIs, imagens geradas, novo estado do workflow ou aplicação fictícia real. Exemplos rotulados como síntese didática.
- Mesma identidade já autorizada. Nenhuma nova decisão de produto ou arquitetura.

## Useful options considered
- Include now: jornada com Sheldon, documentos gerados, plano vertical exemplificado, implementação única/dividida, diferença de Autopilot, QA por CAP/AC e uso real, memória, glossário, falas, metadados/fontes, atualização das referências SDD do catálogo.
- Defer: migração visual do portal inteiro, execução de uma feature demonstrativa e auditoria de outros tutoriais.
- Escalate: none.

## Expected files
- behavior: tutorials/sdd/index.html
- behavior: tutorials/sdd/script.js
- support: tutorials/sdd/style.css
- support: tutorials/sdd/automation.html (substituição autorizada; URL preservada)
- support: tutorials/index.html (cards e resumo SDD)
- support: .aioson/context/simple-plans/sdd-system-tutorial.md
- support: .aioson/context/dev-state.md (via CLI)
- Total: 2 behavior files / 7 paths / 2 tutorial areas; nenhuma mudança no comportamento do framework.

## Done criteria and verification
- Conteúdo em português acessível a leigos, com um exemplo coerente da preparação à implementação e QA, sem confundir artefato com prova de funcionamento.
- Versão 1.66.0, data 11/09/2026, assinatura GPT-6 Astra; HEAD a39dffe1 com mudanças locais, sem alegar release npm.
- CLI e instruções atuais sustentam as afirmações; referências locais verificadas; separar fluxo padrão, opções configuradas e limites.
- Browser Edge/Playwright em desktop e celular: navegação, etapas, tema/persistência, links, IDs, impressão, ausência de overflow e leitura sem JS. Sintaxe JS e diff check proporcionais.
- Verificação visual advisory com runtime e no-persist. Não executar suíte integral do framework por mudança documental, nem transformar a revisão local em QA independente de feature.

## Session state
Next step: none — guia reescrito e validado.

## Delivery and verification
- 15 capítulos: conceito, fluxo, Briefing, Refiner, Product, Sheldon, Planner, Dev, modos de implementação, QA, exemplo interativo, gates/mudanças, CLI/memória, glossário e fontes.
- Exemplo sintético coerente com duas capacidades, seis critérios e duas etapas verticais; trecho de plano com caminhos/checagens e reprodução de falha de QA, sem criar aplicação ou fingir uma execução.
- Layout e tokens de memories consumidos por referência; nenhuma alteração nos arquivos compartilhados. Tema Tinta/Porcelana, leitura sem JavaScript, impressão e navegação por teclado preservados.
- Conteúdo antigo de SDD substituído; automation.html conserva a URL por redirecionamento e link de fallback. Cards e resumo SDD do catálogo atualizados, removendo cadeia antiga obrigatória e promessas de economia sem medição.
- Sete kernels citados conferidos contra o template: todos iguais às cópias instaladas. Dezenove comandos com namespace presentes no tutorial conferidos contra src/cli.js; nenhum ausente.
- Edge/Playwright: 15 capítulos, 93 links/recursos válidos, IDs e âncoras consistentes; sete etapas por clique/teclado, tema persistente, exemplo do plano expansível e modo sem JS aprovados; zero erros do navegador.
- Larguras 1440/1024/800/390/360 sem overflow da página. Catálogo 1440/390 sem overflow e oito posições no resumo do fluxo.
- Impressão: todas as etapas e details disponíveis; estado anterior restaurado mesmo com eventos duplicados. PDF real de 305112 bytes no diretório temporário. Capturas desktop, exemplo e mobile inspecionadas, também somente em temp.
- verify:artifact visual com runtime/advisory/no-persist: pass, issues [], contraste e clipping zero; overflow da página zero. Avisos avaliados: análise estática só enxerga a extensão CSS dentro de sdd (tipografia, tokens e foco vêm de memories); sem estados assíncronos a implementar no exemplo estático; tabelas têm rolagem contida, links inline são referências documentais e a identidade aprovada explica a composição. Não criar outro design para satisfazer heurísticas de marketing.
- Revisão local de conteúdo e comportamento, sem apresentá-la como QA independente de uma feature. Sintaxe JS e git diff --check aprovados. Não repetir a checagem global de regras: a tentativa no tutorial anterior havia ignorado o recorte e retornado achados alheios; convenções dos caminhos novos conferidas localmente.
- Pulse/workflow de execution-roles-onboarding preservados. Nenhuma execução de feature, publicação, commit ou envio remoto.
