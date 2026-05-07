# Receita: Publicar no aioson.com

> **Para quem é:** desenvolvedor que criou um squad, skill ou genome e quer compartilhar com outros projetos ou com a comunidade.
> **Tempo de execução:** 15–30 min.
> **O que você vai ter no fim:** seu pacote publicado no aioson.com, disponível para instalação com um único comando — público ou privado (com lista de emails autorizados).

---

## Cenário

Você criou um squad customizado para o domínio jurídico — com agentes `@regulator`, `@attorney` e `@auditor` — e quer usá-lo em outros projetos seus, ou disponibilizá-lo para clientes. Ou criou uma design skill personalizada e quer compartilhar com o time sem enviar arquivos manualmente.

O fluxo é: empacote o que você criou (`system:package`), publique (`system:publish`), e qualquer projeto autorizado instala com `system:install`.

---

## O que pode ser publicado

| Tipo | O que é | Onde fica |
|---|---|---|
| **Squad** | Grupo de agentes customizados | `.aioson/squads/<slug>/` |
| **Skill** | Pacote plugável (design, processo, domínio) | `.aioson/skills/<tipo>/<slug>/` |
| **Genome** | DNA cognitivo de persona | `.aioson/genomes/<slug>/` |

---

## Pré-requisitos

- AIOSON instalado no projeto
- Conta no aioson.com (crie em aioson.com/signup)
- O que você quer publicar já criado localmente

---

## Passo 1 — Autenticar na CLI

```bash
npx @jaimevalasek/aioson auth:login
```

```
? Email: voce@exemplo.com
? Abrindo browser para autenticação...
Autenticado com sucesso. Token salvo em ~/.aioson/auth.json.
```

---

## Passo 2 — Verificar o que será empacotado

Antes de empacotar, confirme que o pacote está válido:

```bash
npx @jaimevalasek/aioson system:list
```

```
Pacotes locais disponíveis para publicação:
  squads/
    legal-compliance   ← 3 agentes: regulator, attorney, auditor
  skills/
    aurora-command-ui  ← design skill
    aioson-spec-driven ← process skill
  genomes/
    persona-vc-advisor ← genome 4.0
```

---

## Passo 3 — Empacotar

```bash
npx @jaimevalasek/aioson system:package --slug=legal-compliance --type=squad
```

```
Empacotando squad: legal-compliance
  Incluindo: agentes, config, README, manifest
  Excluindo: dados sensíveis, tokens, runtime

Pacote criado: .aioson/squads/legal-compliance/.aioson-pkg/package.json
Versão: 1.0.0
Checksum: sha256:a3f2b1...

Pronto para publicar.
```

> **O que o `system:package` exclui automaticamente:** arquivos com padrão de secrets (`*.env`, `*token*`, `*credentials*`), runtime SQLite, logs. Se quiser revisar: `--dry-run` mostra o que seria incluído sem criar o pacote.

---

## Passo 4A — Publicar como público

```bash
npx @jaimevalasek/aioson system:publish --slug=legal-compliance --type=squad
```

```
? Título: Squad Jurídico — Compliance Brasil
? Descrição curta: Agentes especializados em conformidade com legislação brasileira.
? Visibilidade: público

Publicando...
Publicado com sucesso.

Slug público: legal-compliance
Instalação: npx @jaimevalasek/aioson system:install --slug=legal-compliance
URL: aioson.com/squads/legal-compliance
```

---

## Passo 4B — Publicar como privado (com convites)

Para apps ou squads pagos, ou para distribuição controlada para clientes:

```bash
npx @jaimevalasek/aioson system:publish \
  --slug=legal-compliance \
  --type=squad \
  --private \
  --invite=cliente1@empresa.com,cliente2@firma.com.br
```

```
? Título: Squad Jurídico — Compliance Brasil (Privado)
? Visibilidade: privado
? Emails autorizados: cliente1@empresa.com, cliente2@firma.com.br

Publicando...
Publicado com sucesso.

Acesso restrito a 2 emails.
Para adicionar mais: system:publish --slug=legal-compliance --invite=novoemail@...
```

Os emails autorizados recebem o slug e podem instalar. Outros recebem erro de acesso negado.

---

## Passo 5 — Instalar em outro projeto

Em qualquer outro projeto com AIOSON instalado:

```bash
npx @jaimevalasek/aioson system:install --slug=legal-compliance
```

```
Buscando squad: legal-compliance...
Verificando permissão...  ✓ (seu email está na lista)
Instalando em .aioson/squads/legal-compliance/
Checksum verificado: sha256:a3f2b1... ✓

Squad instalado. Para usar:
  @squad — ative o squad legal-compliance
  ou: @regulator, @attorney, @auditor diretamente
```

---

## Publicar uma design skill

O fluxo é idêntico, mudando o `--type`:

```bash
npx @jaimevalasek/aioson system:package --slug=minha-design-skill --type=skill
npx @jaimevalasek/aioson system:publish --slug=minha-design-skill --type=skill
```

Para instalar em outro projeto:
```bash
npx @jaimevalasek/aioson system:install --slug=minha-design-skill --type=skill
```

---

## O que ficou em disco (rastreio)

```
.aioson/squads/legal-compliance/
└── .aioson-pkg/
    ├── package.json        ← versão, slug, tipo, checksum
    ├── manifest.json       ← agentes incluídos, dependências
    └── [arquivos do squad]
```

O `package.json` do pacote é diferente do seu `package.json` de Node.js. É o manifesto interno do AIOSON para versionamento e integridade.

---

## Variações

| Situação | Ajuste |
|---|---|
| Quero versionar (v1.1, v2.0) | Edite `version` no `package.json` do pacote antes de `system:publish`. |
| Quero atualizar um pacote publicado | `system:publish` com o mesmo slug atualiza. Projetos que instalaram precisam rodar `system:install --force`. |
| Quero unpublish | Acesse aioson.com → seu perfil → gerenciar pacotes. Não há CLI para unpublish ainda. |
| Quero inspecionar antes de instalar | `system:install --slug=X --inspect` mostra o manifesto sem instalar. |
| Time usando o mesmo pacote em vários projetos | `system:install` em cada projeto. O pacote é independente do workspace. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `auth:login` não abre o browser | Copie a URL que aparece no terminal e abra manualmente. |
| `system:publish` rejeita por secrets detectados | Rode `system:package --dry-run` para ver o que foi detectado. Remova o arquivo ou adicione ao `.aiosonignore`. |
| Outro projeto não consegue instalar (privado) | Confirme que o email do usuário está na lista de convites. Adicione com `--invite=novo@email.com`. |
| Versão instalada está desatualizada | `system:install --slug=X --force` reinstala a versão mais recente. |

---

## Próximo passo

- Quer criar um squad antes de publicar? Veja [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md) (seção Squads).
- Quer saber o que é um Genome antes de publicar um? Veja o [Glossário](../1-entender/glossario.md).
- Criou uma landing page para o seu produto e quer publicar ela também? → [Landing page](./landing-page.md)
