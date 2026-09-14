---
slug: memory-system-tutorial
status: done
owner: dev
created_at: 2026-09-11
updated_at: 2026-09-11
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan — Tutorial do sistema de memória

## Scope
Documentar a memória do AIOSON 1.66.0 em tutorials/memories/index.html, para leigos, com data, assinatura GPT-6 Astra e o Design-DNA Tinta & Ouro fornecido pelo usuário.

## Context selected
- Contexto validado pelo CLI; context:brief executado para a documentação e atualizado para HTML/CSS/JS.
- must_load: simple-plan-lane, disk-first-artifacts, output-brevity, source-code-language-convention, visual-exploration-contract, agent-loading-contract e fundação do projeto.
- Feature ativa execution-roles-onboarding é independente: preservar workflow/pulse.
- Padrão: tutorials já usa index.html estático por assunto.
- Autoridade visual explicitamente solicitada: C:/dev/aioson-com/.aioson/explorations/aioson-ecosystem-identity/runs/variant-d/design-dna/.

## Implementation intelligence
- HTML sem dependências, CSS com tokens fornecidos, JS apenas para tema e exemplo interativo; conteúdo principal acessível sem JS.
- Fontes primárias: src/commands, operadores, contexto, learning-loop, runtime, templates e testes. Docs históricos são apoio, não prova isolada.
- Separar fatos implementados, condicionantes e exemplos fictícios; nenhuma preferência privada do operador no tutorial.

## Done criteria
- Guia navegável explica conceito, escopos, captura, recuperação, manutenção, privacidade, comandos e limites atuais, com fontes locais.
- Tema Tinta/Porcelana, navegação por teclado, impressão e ausência de overflow em celular.
- Data 11/09/2026, versão local 1.66.0, base HEAD a39dffe1 com alterações locais preexistentes, assinatura GPT-6 Astra.

## Useful options considered
- Include now: sumário, exemplo interativo, glossário, referências, link no catálogo, cópia local do DNA/tokens.
- Defer: busca global do portal, migração visual dos demais tutoriais, nova geração dos índices de memória.
- Escalate: none.

## Expected files
- support: tutorials/memories/index.html
- support: tutorials/memories/style.css
- support: tutorials/memories/script.js
- support: tutorials/memories/tokens.css
- support: tutorials/memories/DESIGN-DNA.md
- support: tutorials/index.html
- support: .aioson/context/simple-plans/memory-system-tutorial.md
- support: .aioson/context/dev-state.md (checkpoint pelo CLI)
- 0 arquivos de comportamento do framework; 8 caminhos no total.

## Verification
- Checagem local de referências, âncoras, metadados e sintaxe JS.
- Browser real em desktop/celular: navegação, temas, exemplo, impressão, erros e overflow.
- git diff --check nos caminhos alterados; rules:check proporcional.
- Não rodar suíte integral do framework por alteração documental.

## Session state
Next step: none — tutorial e ampliações concluídos e verificados.

## Follow-up — formulário, máscaras e validação
- Pedido: demonstrar como implementar um formulário usa memória para descobrir máscaras, validações e formatos de CPF/CNPJ/telefone/outros documentos.
- Clarificação: foco no ciclo da memória e na seleção por cabeçalhos para evitar contexto irrelevante. Formulário como exemplo; detalhes de validação em bloco expansível. Explicitar autoria da escrita, destinos de memória, recuperação futura e custo de contexto versus busca local.
- Evidência real: regra instalada e shipped form-fields-masks-and-validation; context:brief com tarefa de cadastro e caminho src/customers/CustomerForm.tsx a retornou em must_load por formulário/cadastro. Caminho de formulário é cenário de consulta, não componente criado.
- Separar descoberta da regra, leitura do contrato de domínio, reaproveitamento do código, normalização, máscara, validação sintática/semântica, regra de negócio e verificação externa; não apresentar o AIOSON como catálogo universal de algoritmos.
- Reusar estilos e capítulo 10, com links a regras existentes, exemplo fictício de documento roteável, registro dos requisitos por campo e esclarecimento de lacunas. Escopo de escrita: index.html, este plano e dev-state via CLI (3 caminhos já previstos).
- Verificação: CLI real já demonstrado; links/âncoras, tabelas e conteúdo novo em desktop/celular, modo sem JS e impressão. Nenhum formulário real, dado pessoal ou código de validação será criado.
- Entregue: capítulo 10 centrado em salvar → encontrar → ler → aplicar → atualizar; fala pronta, exemplo fictício de cabeçalho e corpo com referências, distinção entre escrita de documentos e registro de aprendizados, consulta real da regra de formulários e limites da seleção. Detalhes de campos preservados em bloco expansível.
- Validação da versão final: Edge/Playwright, 14 capítulos, 90 links/recursos válidos, IDs únicos e âncoras existentes; 1440/800/390/360 sem overflow. Seis etapas presentes; expansão de detalhes, tema Porcelana, conteúdo sem JavaScript e abertura/restauração de details na impressão aprovados. Zero erros do navegador; capturas Tinta desktop e Porcelana mobile inspecionadas. Exemplos não criaram arquivos de aplicação.

## Follow-up — cabeçalhos e tokens
- Escopo: explicar a relação entre memória e carregamento seletivo, traduzir os campos do frontmatter e acrescentar fala pronta sobre custo de contexto.
- Evidência: collectCandidates lê arquivos localmente e extrai metadados, searchText também usa corpo; brief classifica obrigatórios/recomendados/recall e extrai restrições. Não prometer somente leitura física de cabeçalhos, zero tokens ou seleção perfeita.
- Reusar HTML/CSS do capítulo 7; alterar apenas index.html, este plano e checkpoint CLI, dentro dos caminhos originais.
- Verificar âncoras e fontes, cabeçalhos de tabela, leitura no desktop/celular e impressão dos novos trechos; sem nova suíte de testes do framework.
- Entregue: fala pronta, analogia da biblioteca, campos do frontmatter explicados, fluxo pedido/CLI/seleção/leitura, custos de disco versus contexto, limites de relevância e economia, glossário e FAQ. Nenhuma mudança no runtime ou no design.
- Validação da ampliação: 14 capítulos, 81 links/recursos válidos, âncoras/IDs consistentes, 1440/800/390/360 sem overflow, explicações expansíveis, tema Porcelana, conteúdo disponível para impressão e sem JavaScript; zero erros do navegador. Capturas dos novos trechos inspecionadas. git diff --check aprovado.

## Delivery and verification
- 14 capítulos em português, incluindo fala de 15/40 segundos e a distinção entre memória registrada, encontrável e utilizada; Markdown não implica leitura automática.
- Materiais prévios em tutorials/living-memory e tutorials/brains consultados. Não existe tutoriais/ na raiz. Divergências históricas conferidas no código e explicadas na edição.
- Tokens e Design-DNA copiados da origem explicitamente indicada; SHA-256 de tokens.css: 384861D3410ACB27A4176318646D48AFEFF31154F18A83DE1977D2B7B9565E0C. Tipografia usa fallbacks de sistema permitidos pelo DNA para funcionar offline.
- Browser real (Edge headless/Playwright): 14 capítulos, 76 links/recursos locais válidos, IDs únicos, larguras 1440/1024/800/390/360 sem overflow horizontal. Temas e persistência, alternância entre modelos, âncoras, details, redução de movimento e leitura sem JavaScript aprovados.
- Impressão real em PDF verificada em arquivo temporário; abertura/restauração de details corrigida para eventos de impressão repetidos. Capturas desktop, mobile e Porcelana inspecionadas; artefatos de teste ficam no temp, não no repositório.
- verify:artifact com diretório + URL de arquivo, runtime e --no-persist: verdict pass, issues [], contraste/overflow/clipping = 0 nas amostras desktop e mobile. Avisos heurísticos de marketing (densidade, mídia, seed), tokens originais com nomes de fontes, tabelas com rolagem e links inline foram avaliados conforme o caráter documental e a identidade fornecida; não constituem novo escopo visual.
- node --check do JavaScript e git diff --check dos caminhos alterados: aprovados.
- A tentativa de rules:check por --paths retornou achados preexistentes de fora dos caminhos solicitados. Não é uma aprovação automática do tutorial. Identificadores novos revisados manualmente, sem alterar os arquivos alheios apontados.
- Os 40 comandos presentes nos exemplos foram conferidos contra o registro atual em src/cli.js; todos existem.
- Workflow e pulse da feature execution-roles-onboarding preservados.
