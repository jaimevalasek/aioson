# @genome — Criar DNA cognitivo de domínios, funções e personas

> **Para quem é:** quem quer que seus agentes "pensem" de um jeito específico — como um expert de domínio, uma função de negócio, ou uma persona real.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que é um genome e para que ele serve
> - Quando usar o pipeline completo (Profiler) vs geração rápida

---

## Para que serve

Um agente padrão fala de forma genérica. Um agente com um genome fala com a voz e o raciocínio de um especialista específico.

O `@genome` cria o **DNA cognitivo** de um domínio, função ou persona em formato estruturado: traços de personalidade (DISC, Enneagram, Big Five, MBTI, HEXACO-H), estilo de comunicação, heurísticas de decisão, e instruções de advisor. Esse genome pode ser vinculado a executores de squad para que eles raciocinem e comuniquem como aquele perfil.

Tipos de genome:
- `domain` — ex: "segurança cibernética", "direito trabalhista"
- `function` — ex: "VP de Vendas", "Head de Produto"
- `persona` — ex: baseado em uma pessoa real pública (usa o pipeline Profiler)
- `hybrid` — combinação de dois ou mais dos anteriores

---

## Quando invocar

- Você quer que um executor de squad tenha um estilo de raciocínio específico
- Você quer criar um advisor personalizado para simular como um expert pensaria
- Você tem um genome de persona e quer aplicá-lo a um squad existente

---

## Quando NÃO invocar

- Você só quer criar um squad — o genome é opcional, não obrigatório
- Você quer um genome de persona sem investigação — use `--quick` para geração rápida com disclaimer de baixa fidelidade
- Você quer pesquisar uma pessoa real em profundidade — o `@genome` vai te redirecionar para `@profiler-researcher` automaticamente

---

## Diálogo típico

```
Você > @genome

@genome > Que tipo de genome você quer criar?
          [1] Domain (ex: segurança, direito)
          [2] Function (ex: CFO, Head de Marketing)
          [3] Persona (baseado em pessoa real — usa pipeline Profiler)
          [4] Hybrid
Você > 1

@genome > Domínio?
Você > segurança ofensiva (red team)

@genome > Gerando genome...
          Verificando aioson.com por genome existente... não encontrado.
          Gerando genome "red-team-security":
          - DISC: D-alto / C-alto (direto, sistemático)
          - Enneagram: 5w6 (observador, analítico)
          - Heurísticas: assume que qualquer superfície é vulnerável, prova antes de concluir
          - Estilo: técnico, sem eufemismos, cita ferramentas e CVEs

@genome > Genome salvo em .aioson/genomes/red-team-security.genome.json
          Quer vincular a um squad ou executor agora?
```

---

## Saídas em disco

```
.aioson/genomes/{slug}.genome.json   ← genome gerado
.aioson/genomes/{slug}-advisor.md    ← advisor em formato de prompt (quando solicitado)
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — idioma e contexto
- `.aioson/profiler-reports/{slug}/enriched-profile.md` — se for persona e o pipeline já rodou

---

## Comandos CLI relacionados

```bash
# Verificar saúde de um genome (campos obrigatórios, versão)
aioson genome:doctor <slug>

# Publicar genome no aioson.com
aioson system:publish --type=genome --slug=<slug>
```

---

## Handoff típico

- **Vem de:** `@squad` (para vincular a executores) ou pedido direto do usuário
- **Vai para:** `@profiler-researcher` quando persona é detectada e pipeline completo é necessário

---

## Detalhes recentes

- **Genome 4.0 (2026):** novos campos `anchor_prompt`, `relations`, `hexaco_h`, e `trait_interactions` — o genome passou a modelar como traços interagem entre si, não apenas listá-los isoladamente
- **Camada de método operacional (v1.29.0):** genomes de função e de persona-praticante agora carregam **o que a pessoa FAZ**, não só quem ela é. Cinco seções obrigatórias — `## Operating Procedure` (o método em passos executáveis, ex: RMBC), `## Output Structure`, `## Style Metrics`, `## Prohibitions`, `## Delivery Checklist` — extraídas das evidências pelo pipeline de persona. Um genome de praticante sem `## Operating Procedure` simula opiniões, não trabalho, e é tratado como defeito de geração. Ao vincular num squad, essas seções se propagam: proibições viram hard constraints do executor, o checklist vira checklist do squad, e o procedimento dirige o padrão de resposta.

---

## Próximo passo

- Para personas baseadas em pessoas reais: [profiler-researcher.md](./profiler-researcher.md)
- Para vincular genome a um squad: [squad.md](./squad.md)
- Glossário: [genome](../1-entender/glossario.md#genome)
