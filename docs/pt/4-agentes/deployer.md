# @deployer — Deploy em VPS próprio com o Dokploy

> **Para quem é:** quem vai colocar um app em produção num VPS próprio (Hostinger, Hetzner, DigitalOcean…) usando o **Dokploy**, muitas vezes sem ser desenvolvedor.

## A ideia do agente

Um deploy no Dokploy leva várias sessões e tem armadilhas que só aparecem na hora: a chave do GitHub que não salva, o Redis que sobe sem senha, o cadeado que fica no certificado provisório, o firewall que tranca o próprio terminal. O `@deployer` conduz o operador **uma etapa por vez**: diz onde clicar e o que preencher, lê os prints campo por campo e **confere de fora** (DNS, certificado, portas, página de saúde) antes de dar a etapa por concluída.

Tudo o que é descoberto vai para um **diário do deploy**, para nada se perder quando a conversa for resumida.

## As etapas

| # | Etapa | Como sabe que terminou |
|---|---|---|
| 0 | Prontidão do app | checklist do `Dockerfile`, variáveis, porta, volume, migrations e saúde em dia — ou lacunas mandadas ao `@dev` |
| 1 | Painel | 2FA, um usuário por pessoa, painel no `https://` próprio, porta 3000 fechada |
| 2 | Serviços | banco e Redis rodando, sem porta externa, logs limpos |
| 3 | Acesso ao código | o primeiro clone funciona (chave de leitura no GitHub) |
| 4 | Aplicação | build concluído, migrations rodaram, processos de pé |
| 5 | Domínio e HTTPS | DNS no IP do VPS, certificado do Let's Encrypt, página de saúde respondendo 200 |
| 6 | Firewall | só 22/80/443 respondem de fora; o VPS continua saindo para a internet |
| 7 | Trava antes dos dados reais | restrição de acesso que não quebra o login do próprio app; com Cloudflare Access, certificado de origem no lugar do Let's Encrypt e o VPS fechado para quem não vem do Cloudflare |

## O que ele nunca faz

- **Nunca escreve código do app.** `Dockerfile`, `.dockerignore`, endereço de escuta, IP real atrás do proxy: tudo vai para o `@dev` pela rota curta (Simple Plan).
- **Nunca pede senha no chat nem em print.** Se uma senha aparecer num print, ele avisa e planeja a troca — barata antes dos dados reais, cara depois.
- **Nunca age sozinho** em push, deploy, DNS, firewall ou exclusão: cada uma dessas ações espera a confirmação do operador.
- **Nunca fecha a porta do painel antes do `https://` abrir**, nem ativa firewall sem a regra do SSH.

## O diário

Fica no diário que o projeto já tiver, ou em `.aioson/context/deploy-{ambiente}.md`, com: situação atual (tabela com data e hora), decisões, inventário sem senhas (nomes internos, versões, volumes, impressão digital da chave), linha do tempo, problemas com sintoma/causa/solução/status e a lista do que falta.

## Como chamar

```
/aioson:agent:deployer produção no Dokploy
/aioson:agent:deployer o certificado continua TRAEFIK DEFAULT CERT
```

Projetos que já usam o AIOSON recebem o agente com `aioson update`.

## Onde está o conhecimento

O kernel é curto; o detalhe é carregado por etapa, de `.aioson/docs/deployer/`:

| Arquivo | Conteúdo |
|---|---|
| `app-readiness.md` | prontidão do app (também chega ao `@dev` quando a tarefa fala em Dokploy) |
| `dokploy-playbook.md` | as etapas 1 a 7 com os caminhos de tela do Dokploy v0.30 |
| `troubleshooting.md` | sintoma → causa → correção e os comandos de conferência de fora |
| `deployment-diary.md` | formato do diário e o jeito de falar com o operador |

Hoje o playbook cobre o Dokploy. Outra plataforma (Coolify, Docker puro) entra como um playbook novo na mesma pasta.
