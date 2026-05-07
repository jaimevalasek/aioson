# Automação de Squads — LLM-to-Script

> Como transformar processos de squad em scripts executáveis que rodam sem LLM.

---

## Conceito

Toda vez que uma squad executa uma tarefa, custa tokens de LLM. Mas muitos processos seguem padrões repetíveis — mesma entrada, mesma transformação, mesma estrutura de saída. Quando isso acontece, o trabalho pode virar um **script que roda sozinho**: local, em CI/CD, cron, serverless ou qualquer ambiente.

O fluxo:

```
Squad produz output com LLM
        ↓
Orquestrador analisa: "isso pode virar script?"
        ↓
Cria script plan em script-plans/
        ↓
Usuário revisa e aprova
        ↓
LLM gera o script em scripts/
        ↓
Script roda sem LLM — custo zero por execução
```

---

## Quando funciona bem

A automação faz sentido quando o processo é **determinístico** — mesma entrada sempre produz a mesma saída.

**Bons candidatos:**
- Formatação de dados (CSV → JSON, Markdown → HTML)
- Preenchimento de templates (relatórios semanais, newsletters)
- Extração de informações de documentos estruturados
- Validação contra regras fixas (checklists, conformidade)
- Transformações de texto com padrões claros (slugify, normalizar, limpar)
- Geração de relatórios a partir de dados tabulares
- Pipeline de preparação de conteúdo (metadata, tags, categorização por regra)

**Não automatize:**
- Trabalho criativo (escrever copy original, brainstorming)
- Tarefas que precisam de pesquisa web ou dados em tempo real
- Processos onde o julgamento da LLM é o valor principal (code review, análise estratégica)
- Tarefas únicas que nunca vão se repetir

---

## Como usar

### Opção 1: O orquestrador oferece

Depois de uma sessão produtiva, o orquestrador da squad automaticamente avalia se o processo pode ser automatizado. Se a viabilidade for média ou alta, ele oferece:

> "Esse processo parece automatizável. Quer que eu analise se pode virar um script standalone que roda sem LLM?"

Se você aceitar, ele cria o script plan. Se recusar, segue em frente.

### Opção 2: Você pede explicitamente

```
@squad automate youtube-creator
```

Isso analisa as sessões recentes da squad e propõe automações para os processos mais repetitivos.

---

## Fase 1: Script plan

O script plan é um documento de análise que avalia **o que** pode ser automatizado e **como**.

Fica em: `.aioson/squads/{slug}/script-plans/{plan-slug}.md`

### Exemplo real: formatador de roteiros

Imagine uma squad de YouTube onde o roteirista sempre recebe um briefing e produz um roteiro no mesmo formato: hook, desenvolvimento, CTA, descrição do vídeo.

O script plan seria:

```markdown
# Script Plan: format-youtube-script

**Status:** proposed
**Squad:** youtube-creator
**Session:** 2026-03-20-roteiro-ingles
**Language:** python
**Feasibility:** high

## What the LLM did
Recebeu um briefing com tema, público-alvo e estilo.
Produziu um roteiro com estrutura fixa: hook (3 opções),
desenvolvimento (3 blocos), CTA, descrição e tags.

## Automation feasibility analysis

### Can be automated
- Leitura do briefing a partir de template JSON
- Estruturação das seções (hook, blocos, CTA)
- Geração da descrição a partir de template com variáveis
- Formatação final em Markdown com frontmatter

### Cannot be automated
- Escrita criativa do conteúdo dos hooks
- Escolha da narrativa nos blocos de desenvolvimento
- Adaptação do tom ao público-alvo

### Feasibility verdict
Medium — a estrutura e formatação podem ser automatizadas,
mas o conteúdo criativo ainda precisa de LLM.
O script pode gerar o scaffold e pré-preencher seções fixas,
economizando ~40% do trabalho do agente.

## Script design

### Inputs
| Name | Type | Source | Example |
|------|------|--------|---------|
| briefing | JSON | arquivo local | {"tema":"inglês","publico":"25-40","estilo":"direto"} |
| template | Markdown | squad templates | roteiro-tmpl.md |

### Process
1. Ler briefing JSON
2. Carregar template de roteiro
3. Preencher variáveis fixas (tema, público, data)
4. Gerar estrutura das seções com placeholders
5. Adicionar frontmatter com metadata
6. Escrever arquivo Markdown de saída

### Outputs
| Name | Format | Location |
|------|--------|----------|
| roteiro-scaffold | Markdown | output/youtube-creator/ |

### Dependencies
- Nenhuma (stdlib Python)

### Limitations
- Não gera conteúdo criativo — apenas o scaffold
- Não substitui o agente para roteiros que fogem do template padrão

## Estimated effort
Small (< 100 lines)
```

### Status do script plan

| Status | Significado |
|--------|-------------|
| `proposed` | Análise feita, aguardando aprovação |
| `approved` | Usuário aprovou, pronto para gerar script |
| `implemented` | Script gerado e funcional |
| `rejected` | Usuário considerou inviável ou desnecessário |

---

## Fase 2: Geração do script

Quando você revisa o plan e diz "ok" / "pode gerar" / "implementa":

1. O status do plan muda para `approved`
2. A LLM gera o script em `.aioson/squads/{slug}/scripts/{script-slug}.py` (ou `.js`)
3. O status muda para `implemented`
4. O manifesto da squad é atualizado com a automação

### Requisitos do script gerado

Todo script deve ser **self-contained e executável**:

```bash
# Python
python .aioson/squads/youtube-creator/scripts/format-youtube-script.py --help
python .aioson/squads/youtube-creator/scripts/format-youtube-script.py --input=briefing.json --output=output/

# Node.js
node .aioson/squads/data-pipeline/scripts/csv-to-dashboard.js --input=report.csv --output=dashboard.json
```

**Obrigatório em todo script:**
- Header com nome, origem (plan), e usage
- Parse de argumentos CLI (`--input`, `--output`, `--help`, `--dry-run`)
- Leitura de input via arquivo ou stdin
- Escrita de output via arquivo ou stdout
- Tratamento de erros com mensagens claras
- Zero paths hardcoded — tudo via argumentos
- Se precisar de pacotes externos, listar no header com instrução de install

### Exemplo de script gerado

```python
#!/usr/bin/env python3
"""
format-youtube-script — generated from squad:youtube-creator
Plan: script-plans/format-youtube-script.md

Gera scaffold de roteiro de YouTube a partir de briefing JSON.

Usage:
  python format-youtube-script.py --input=briefing.json [--output=roteiro.md] [--template=tmpl.md]
  python format-youtube-script.py --help
  echo '{"tema":"..."}' | python format-youtube-script.py
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path


def load_input(input_path):
    if input_path == '-' or input_path is None:
        return json.load(sys.stdin)
    return json.loads(Path(input_path).read_text())


def generate_scaffold(briefing, template_path=None):
    tema = briefing.get('tema', 'Sem tema')
    publico = briefing.get('publico', 'Geral')
    estilo = briefing.get('estilo', 'neutro')
    today = date.today().isoformat()

    sections = [
        f'---',
        f'tema: {tema}',
        f'publico: {publico}',
        f'estilo: {estilo}',
        f'data: {today}',
        f'status: scaffold',
        f'---',
        f'',
        f'# Roteiro: {tema}',
        f'',
        f'## Hook (escolher 1 de 3)',
        f'1. [Hook opção A]',
        f'2. [Hook opção B]',
        f'3. [Hook opção C]',
        f'',
        f'## Desenvolvimento',
        f'',
        f'### Bloco 1',
        f'[Conteúdo do primeiro bloco]',
        f'',
        f'### Bloco 2',
        f'[Conteúdo do segundo bloco]',
        f'',
        f'### Bloco 3',
        f'[Conteúdo do terceiro bloco]',
        f'',
        f'## CTA',
        f'[Call to action]',
        f'',
        f'## Descrição do vídeo',
        f'[Descrição para o YouTube]',
        f'',
        f'## Tags',
        f'[Lista de tags]',
    ]
    return '\n'.join(sections)


def main():
    parser = argparse.ArgumentParser(description='Generate YouTube script scaffold from briefing')
    parser.add_argument('--input', '-i', help='Path to briefing JSON (or - for stdin)')
    parser.add_argument('--output', '-o', help='Output path (default: stdout)')
    parser.add_argument('--template', '-t', help='Optional template file')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be generated')
    args = parser.parse_args()

    briefing = load_input(args.input)
    result = generate_scaffold(briefing, args.template)

    if args.dry_run:
        print(f'[dry-run] Would generate {len(result)} chars')
        print(f'[dry-run] Tema: {briefing.get("tema")}')
        return

    if args.output:
        Path(args.output).write_text(result)
        print(f'Scaffold saved to {args.output}')
    else:
        print(result)


if __name__ == '__main__':
    main()
```

---

## Fase 3: Iteração

Se o script não funciona perfeitamente na primeira vez:

1. Reporte o problema: "O script não trata briefings sem campo 'estilo'"
2. A LLM corrige o script no mesmo arquivo
3. O plan ganha uma seção `## Iterations` documentando as mudanças

---

## Registro no manifesto

Quando um script é implementado, ele aparece no `squad.manifest.json`:

```json
{
  "automations": [
    {
      "slug": "format-youtube-script",
      "plan": "script-plans/format-youtube-script.md",
      "script": "scripts/format-youtube-script.py",
      "language": "python",
      "status": "implemented",
      "createdFrom": "2026-03-20-roteiro-ingles",
      "inputs": ["briefing JSON com tema, público e estilo"],
      "outputs": ["scaffold de roteiro em Markdown"]
    }
  ]
}
```

---

## Estrutura de pastas

```
.aioson/squads/{squad-slug}/
  script-plans/
    format-youtube-script.md        ← análise de viabilidade
    validate-seo-checklist.md       ← outro plan
  scripts/
    format-youtube-script.py        ← script aprovado e implementado
    validate-seo-checklist.js       ← outro script
```

---

## Exemplos de automação por tipo de squad

### Squad de conteúdo

| Processo | Viabilidade | Tipo de script |
|----------|-------------|----------------|
| Formatar roteiro a partir de briefing | Alta | Python — template filling |
| Gerar metadata de vídeo (tags, descrição) | Média | Python — regras + template |
| Converter roteiro Markdown → teleprompter HTML | Alta | Node.js — parser + template |
| Analisar retenção de vídeo | Baixa | Precisa de API do YouTube |

### Squad de dados/relatórios

| Processo | Viabilidade | Tipo de script |
|----------|-------------|----------------|
| CSV → JSON normalizado | Alta | Python — pandas ou csv stdlib |
| Gerar relatório semanal a partir de dados | Alta | Python — template + dados |
| Validar conformidade de dataset | Alta | Python — regras fixas |
| Dashboard estático a partir de métricas | Alta | Node.js — chart.js + template |

### Squad de desenvolvimento

| Processo | Viabilidade | Tipo de script |
|----------|-------------|----------------|
| Gerar migration a partir de spec | Média | Node.js — parser de spec |
| Scaffold de CRUD completo | Alta | Node.js — templates de código |
| Validar PR contra checklist | Alta | Python — regex + regras |
| Gerar changelog a partir de commits | Alta | Python — git log parser |

### Squad jurídico

| Processo | Viabilidade | Tipo de script |
|----------|-------------|----------------|
| Formatar contrato a partir de template | Alta | Python — docx/md template |
| Extrair cláusulas de documento | Média | Python — regex patterns |
| Gerar checklist de compliance | Alta | Python — regras fixas |
| Analisar risco de contrato | Baixa | Julgamento humano/LLM |

---

## Boas práticas

1. **Comece pelo plan.** Não peça script direto — o plan força a análise de viabilidade antes de investir esforço na implementação.

2. **Seja honesto com a viabilidade.** "Medium" é uma resposta válida. Um script que faz 60% do trabalho e deixa os 40% criativos para o LLM já economiza muito.

3. **Prefira Python ou Node.js com zero dependências.** Um script que precisa de `pip install` com 10 pacotes é mais difícil de rodar em qualquer ambiente.

4. **Use `--dry-run` em tudo.** O script deve poder mostrar o que faria sem fazer de fato.

5. **Não force automação em trabalho criativo.** Se o valor da squad é a criatividade dos agentes, automação não é o caminho — e tudo bem.

6. **Itere.** O primeiro script raramente é perfeito. A vantagem é que a LLM que gerou o script também pode corrigi-lo.

---

## Relação com workers

A squad já tem o conceito de `worker` (tipo de executor determinístico em `workers/`). A diferença:

| | Worker | Automation script |
|---|---|---|
| **Criado quando** | Na montagem da squad | Depois de uma sessão produtiva |
| **Origem** | Planejado previamente | Extraído de um processo real |
| **Localização** | `workers/` | `scripts/` |
| **Tem plan** | Não | Sim (em `script-plans/`) |
| **Evolução** | Editado manualmente | Iterado com ajuda da LLM |

Workers são definidos na criação da squad para tarefas que **já se sabe** serem determinísticas. Scripts de automação nascem da observação de que um processo executado por agentes LLM **pode** ser replicado sem LLM.
