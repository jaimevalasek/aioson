# [Arquivado] Cenários de Uso

> **Esta doc foi substituída.**
> Os cenários foram reorganizados em receitas individuais com diálogos reais em [`../3-receitas/README.md`](../3-receitas/README.md).
> Conteúdo abaixo preservado para referência histórica.

---

# Cenários de Uso

> Exemplos completos e práticos de como usar o AIOSON em projetos reais.

---

## Cenário 1 — Landing page com formulário (MICRO)

**Projeto:** Landing page de captura de leads com formulário de e-mail.
**Stack:** HTML + Alpine.js + Tailwind + PHP simples para envio de e-mail.
**Classificação:** MICRO (1 tipo de usuário, 1 integração, sem regras complexas → 1 ponto)

### Passo 1: Instalar e configurar

```bash
mkdir landing-captura && cd landing-captura
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Landing Captura" \
  --project-type=site \
  --framework="None" \
  --framework-installed=false \
  --classification=MICRO \
  --lang=pt-BR
```

### Passo 2: Abrir Claude e ativar @setup

No arquivo CLAUDE.md, o contexto já foi lido. Digite:

```
/setup
```

**O agente confirma o contexto pré-configurado:**
```
Contexto carregado:
- Projeto: Landing Captura
- Tipo: site (MICRO)
- Framework: Nenhum detectado
- Idioma: pt-BR

Classificação MICRO confirmada (0 pts): 1 tipo de usuário, sem integrações, sem regras complexas.

Plano: @setup → @dev
Próximo passo: ative /dev e descreva o que o projeto precisa ter.
```

> **Nota:** As flags `--defaults` acima pré-preenchem o contexto sem perguntas interativas.
> Se preferir o fluxo guiado, basta rodar `npx @jaimevalasek/aioson setup:context` sem flags — o agente
> vai fazer as perguntas e identificar o projeto a partir da sua descrição.

### Passo 3: Ativar @dev diretamente

```
/dev

Preciso de uma landing page com:
- Hero section com headline e CTA
- Formulário de captura de e-mail (nome + e-mail)
- Envio por PHP para um arquivo de log (sem banco)
- Design limpo com Tailwind
```

**O @dev entrega:**
- `index.html` com estrutura completa
- `style.css` ou classes Tailwind inline
- `submit.php` para processar o formulário
- Validação básica no frontend e backend

### Por que MICRO?

Não precisa de @analyst (domínio simples), não precisa de @architect (estrutura trivial), não precisa de @qa (sem lógica crítica a testar). O @dev tem contexto suficiente para entregar direto.

> Se até num projeto MICRO o pedido vier muito vago, você ainda pode encaixar `@discovery-design-doc` antes do `@dev`. Isso é exceção útil, não fluxo padrão.

---

## Cenário 2 — API REST com autenticação (SMALL)

**Projeto:** API para gerenciar agendamentos de uma clínica médica.
**Stack:** Laravel 11 + PostgreSQL + Sanctum.
**Classificação:** SMALL (3 tipos de usuário=2pt, 2 integrações=1pt → 3 pontos)

### Passo 1: Instalar

```bash
# Laravel já está instalado e configurado
cd minha-clinica-api
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Clinica API" \
  --project-type=api \
  --framework=Laravel \
  --framework-installed=true \
  --classification=SMALL \
  --lang=pt-BR
```

### Passo 2: Verificar saúde

```bash
npx @jaimevalasek/aioson doctor
```

### Passo 3: @setup

```
/setup
```

**O agente confirma:**
```
Contexto carregado:
- Projeto: Clinica API (SMALL)
- Framework: Laravel 11 (instalado ✓)
- Classificação: SMALL

Plano: @setup → @product → @analyst → @architect → @dev → @qa

Próximo passo: /product
Objetivo: gerar o PRD base antes de mapear pacientes, médicos, agendamentos e regras de negócio.
```

### Passo 4: @product — PRD base

**Atalho com documento de kickoff (opcional):**

Se você já tiver uma ideia esboçada, crie um arquivo de entrada antes de ativar o `@product`:

```bash
# Crie plans/agendamentos.md com suas notas brutas:
# - quero que pacientes agendem consultas online
# - médico pode bloquear horários
# - notificação por email na confirmação
```

Ao ativar `/product`, o agente detecta `plans/agendamentos.md` e pergunta:
> "Encontrei `plans/agendamentos.md`. Quer que eu use como fonte para o PRD?"

Se sim, ele sintetiza o conteúdo e gera o PRD formal. Você pode deletar o arquivo original depois.

```
/product
```

**O @product registra no `prd.md`:**
- visão do produto
- usuários principais
- escopo inicial do MVP
- perguntas em aberto

### Passo 5: @analyst — Descoberta do domínio

```
/analyst
```

**O agente faz suas 6 perguntas:**

```
1. Quem são os tipos de usuário?
```
*Você responde:* Paciente, Médico, Recepcionista

```
2. Qual o fluxo principal que gera valor?
```
*Você responde:* Paciente agenda consulta → médico confirma → recepcionista valida presença

```
3. Existe processo manual hoje?
```
*Você responde:* Sim, tudo é feito por telefone e planilha Excel

```
4. Quais são as regras de negócio críticas?
```
*Você responde:*
- Médico só pode ter 1 consulta por horário
- Cancelamento até 24h antes sem penalidade
- Paciente não pode ter 2 consultas no mesmo dia com o mesmo médico

```
5. Integrações externas?
```
*Você responde:* Envio de e-mail de confirmação (SMTP) e SMS via Twilio

```
6. Dados sensíveis?
```
*Você responde:* Dados de saúde dos pacientes (LGPD)

**O @analyst entrega** `.aioson/context/discovery.md`:
```markdown
## Entidades principais

| Entidade     | Atributos principais                          | Restrições                  |
|--------------|-----------------------------------------------|------------------------------|
| User         | id, name, email, role, password               | role: patient/doctor/staff   |
| Doctor       | id, user_id, crm, specialty, schedule_config  | CRM único                    |
| Patient      | id, user_id, cpf, birth_date, health_notes    | CPF único, dados LGPD        |
| Appointment  | id, doctor_id, patient_id, date, status       | 1 por médico/horário         |
| TimeSlot     | id, doctor_id, starts_at, ends_at, available  | —                            |

## Regras de negócio
- RN01: 1 consulta por médico por horário (check no create)
- RN02: Cancelamento livre até 24h antes
- RN03: 1 consulta por paciente/médico por dia

## Integrações
- SMTP (Laravel Mail) — confirmação de agendamento
- Twilio SMS — lembrete 1h antes

## Riscos
- LGPD: health_notes precisa de criptografia ou controle de acesso
- Conflito de horários: critical path, requer lock otimista
```

### Onde `@discovery-design-doc` entraria neste cenário

Se antes do `@analyst` você ainda não souber bem:
- o recorte do MVP
- o que fica fora de escopo
- quais módulos atuais serão afetados
- ou se a API já está pronta para implementação

vale inserir:

```text
@setup -> @discovery-design-doc -> @analyst -> @architect -> @dev
```

Isso ajuda especialmente quando o projeto já existe e a clínica quer adicionar uma feature grande sem sair codando cedo demais.

### Passo 5: @architect — Estrutura do projeto

```
/architect
```

**O @architect lê o discovery e entrega** `.aioson/context/architecture.md`:

```
Classificação: SMALL → estrutura Laravel padrão, sem sub-pastas excessivas

app/
  Actions/
    CreateAppointmentAction.php
    CancelAppointmentAction.php
  Http/
    Controllers/
      AppointmentController.php
      DoctorController.php
    Requests/
      CreateAppointmentRequest.php
  Models/
    User.php, Doctor.php, Patient.php, Appointment.php
  Policies/
    AppointmentPolicy.php
  Events/
    AppointmentCreated.php
    AppointmentCancelled.php
  Listeners/
    SendConfirmationEmail.php
    SendSmsReminder.php

database/migrations/
resources/  (apenas para erros API)
routes/api.php
tests/Feature/AppointmentTest.php
```

**Decisões técnicas:**
- Auth: Sanctum (tokens de API)
- N+1: Eager loading em todos os índices (with('doctor.user', 'patient.user'))
- Timezone: UTC no banco, conversão na camada de apresentação

### Passo 6: @dev — Implementação com TDD Gate

```
/dev

Implemente a feature de agendamentos primeiro.
Comece pela migration, model, action e controller.
```

O `@dev` detecta o test runner (`pest.xml` encontrado → Pest PHP) e aplica o TDD Gate antes de implementar qualquer lógica de negócio:

**1. Escreve o teste com falha (RED):**
```php
// tests/Feature/CreateAppointmentTest.php
it('throws exception on doctor schedule conflict', function () {
    $doctor = Doctor::factory()->create();
    $slot = now()->addDay()->setHour(10)->setMinute(0);

    Appointment::factory()->create([
        'doctor_id' => $doctor->id,
        'date'      => $slot,
        'status'    => 'confirmed',
    ]);

    expect(fn () => (new CreateAppointmentAction)->execute([
        'doctor_id'  => $doctor->id,
        'patient_id' => Patient::factory()->create()->id,
        'date'       => $slot,
    ]))->toThrow(AppointmentConflictException::class);
});
```

Roda o teste → **falha** (RED confirmado). Só então implementa:

**2. Implementa o suficiente para passar (GREEN):**
```php
// app/Actions/CreateAppointmentAction.php
class CreateAppointmentAction
{
    public function execute(array $data): Appointment
    {
        // RN01: verificar conflito de horário
        $conflict = Appointment::where('doctor_id', $data['doctor_id'])
            ->where('date', $data['date'])
            ->where('status', '!=', 'cancelled')
            ->exists();

        if ($conflict) {
            throw new AppointmentConflictException();
        }

        // RN03: verificar duplicata paciente/médico/dia
        $duplicate = Appointment::where([
            'patient_id' => $data['patient_id'],
            'doctor_id'  => $data['doctor_id'],
        ])->whereDate('date', $data['date'])->exists();

        if ($duplicate) {
            throw new DuplicateAppointmentException();
        }

        $appointment = Appointment::create($data);
        AppointmentCreated::dispatch($appointment);
        return $appointment;
    }
}
```

Roda o teste → **passa** (GREEN). Commit. Próximo passo.

### Passo 7: @qa — Testes

```
/qa

Revise a CreateAppointmentAction e escreva os testes para:
- criação com sucesso
- conflito de horário (RN01)
- duplicata paciente (RN03)
- cancelamento fora do prazo (RN02)
```

**O @qa entrega** `tests/Feature/AppointmentTest.php` com todos os casos.

> **Quando usar @tester em vez de @qa:** Se após o `@dev` a cobertura estiver em zero ou muito baixa, ative `/tester` em vez de `/qa`. O `@tester` começa por um inventário completo (`test-inventory.md`), mapeia os riscos, escolhe a estratégia e escreve testes em ordem de prioridade — Auth/Authorization > Business rules > Data integrity > UI. O `@qa` é um revisor pontual; o `@tester` é um engenheiro de testes que parte do zero.

---

## Cenário 3 — SaaS multi-tenant (MEDIUM)

**Projeto:** Plataforma SaaS de gestão de projetos para agências digitais.
**Stack:** Next.js 14 (App Router) + Prisma + PostgreSQL + Stripe.
**Usuários:** Admin da agência, Gerente de projeto, Cliente (visualização).
**Classificação:** MEDIUM (3 usuários=2pt, 3+ integrações=2pt, regras complexas=2pt → 6 pontos)

### Passo 1: Instalar

```bash
npx create-next-app@latest saas-agencia --typescript
cd saas-agencia
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Agency SaaS" \
  --project-type=web_app \
  --framework="Next.js" \
  --framework-installed=true \
  --classification=MEDIUM \
  --lang=pt-BR
```

### Passo 2: @setup

```
/setup
```

**O agente confirma o plano MEDIUM completo:**
```
Plano de execução:
1. /product   → PRD base vivo
2. /analyst   → discovery e modelagem de domínio
3. /architect → estrutura de pastas Next.js MEDIUM + decisões técnicas
4. /ux-ui     → UI/UX, sistema de design e componentes
5. /pm        → priorização e critérios de aceite no PRD vivo
6. /orchestrator → lanes de desenvolvimento paralelo
7. /dev       → implementação por lane
8. /qa        → revisão e testes

Próximo: /product
```

### Passo 3: @product

```
/product
```

**O @product gera o PRD base** com visão, problema, usuários, MVP inicial e direção visual.

### Passo 4: @analyst

O analista descobre:
- **Entidades:** Organization, Project, Task, User, Invoice, Subscription
- **Multi-tenancy:** Cada organização é isolada (Row-Level Security)
- **Integrações:** Stripe (billing), GitHub (integração de commits), Slack (notificações), S3 (uploads)
- **Regras:** Plano free = máx 3 projetos, Plano pro = ilimitado; cobrança proporcional por membro

### Passo 5: @architect

Para MEDIUM com Next.js App Router:

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx              ← verifica tenant
      projects/page.tsx
      projects/[id]/page.tsx
    api/
      webhooks/stripe/route.ts
  components/
    ui/                       ← Button, Input, Modal (design system)
    features/
      projects/ProjectCard.tsx
      tasks/TaskBoard.tsx
  lib/
    db/prisma.ts
    auth/session.ts
    billing/stripe.ts
  actions/                    ← Server Actions
    project.actions.ts
    task.actions.ts
  types/
```

### Passo 6: UI/UX (`@ux-ui`)

```
/ux-ui

Precisamos de:
- Dashboard principal com lista de projetos
- Board Kanban para tarefas
- Sidebar com navegação entre projetos
- Página de configurações de billing
```

**O agente UI/UX (`@ux-ui`) entrega** `.aioson/context/ui-spec.md`:
- Tokens: primary=#6366F1, gray scale, radius-md=8px
- Componentes: ProjectCard, TaskCard, KanbanBoard, Sidebar, BillingModal
- Estados: loading skeleton, empty state, error state para cada componente
- Acessibilidade: foco visível, ARIA labels em boards interativos

### Passo 7: @pm

```
/pm
```

**O @pm enriquece** `.aioson/context/prd.md` preservando visão, usuários e identidade visual. O foco passa a ser priorização, fases e critérios de aceite compactos:

```markdown
## Escopo do MVP
### Must-have 🔴
- Criar e gerenciar projetos
- Operar board Kanban com atribuição
- Convidar membros por e-mail

## Plano de entrega
### Fase 1 — Núcleo
1. Projetos e permissões
2. Board Kanban
3. Convites e limites do plano

### Fase 2 — Monetização
1. Billing e Stripe
2. Regras de bloqueio por plano

## Criterios de aceite
| AC | Descricao |
|---|---|
| AC-01 | Admin cria projeto com nome, descricao e deadline |
| AC-02 | Board possui colunas To Do / In Progress / Done |
| AC-03 | Convite por e-mail expira em 48h |
| AC-04 | Conta free respeita limite de projetos |
```

### Passo 8: @orchestrator

```
/orchestrator
```

Ou via CLI:
```bash
npx @jaimevalasek/aioson parallel:init --workers=3
npx @jaimevalasek/aioson parallel:assign --source=prd --workers=3
```

**O orquestrador cria 3 lanes:**

```
Lane 1 (@dev instância A):
  - Auth + Multi-tenancy (Organization, User, middleware)
  - US-03: Sistema de convites

Lane 2 (@dev instância B):
  - US-01: CRUD de projetos
  - US-02: Board Kanban + drag-and-drop

Lane 3 (@dev instância C):
  - US-04: Integração Stripe
  - Webhook handler
  - Página de billing
```

**Cada @dev instance** lê seu lane file:
```
Lane 1: /dev Implemente o escopo do agent-1.status.md
Lane 2: /dev Implemente o escopo do agent-2.status.md
Lane 3: /dev Implemente o escopo do agent-3.status.md
```

**Monitorar progresso:**
```bash
npx @jaimevalasek/aioson parallel:status
```

### Passo 8: @qa

```
/qa

Revise as implementações das 3 lanes e escreva testes para:
- Isolamento de tenant (crítico)
- Fluxo de billing e webhook Stripe
- Permissões por role (admin vs gerente vs cliente)
```

---

## Cenário 4 — dApp Ethereum (MEDIUM)

**Projeto:** Marketplace de NFTs com contrato de royalties.
**Stack:** Hardhat + Solidity + Next.js + wagmi + RainbowKit.
**Classificação:** MEDIUM (múltiplos usuários, Web3 + frontend, regras de contrato complexas)

### Passo 1: Instalar

```bash
mkdir nft-marketplace && cd nft-marketplace
npx create-next-app@latest frontend --typescript
npx hardhat init  # no mesmo diretório raiz
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="NFT Marketplace" \
  --project-type=dapp \
  --framework=Hardhat \
  --framework-installed=true \
  --classification=MEDIUM \
  --web3-enabled=true \
  --web3-networks=ethereum \
  --contract-framework=Hardhat \
  --wallet-provider=wagmi \
  --lang=pt-BR
```

> **Nota:** Se Hardhat e Next.js coexistem no mesmo diretório, o AIOSON detecta automaticamente como **monorepo** e exibe um aviso de configuração.

### Passo 2: @analyst

O analista identifica:
- **Buyer:** compra NFTs via marketplace
- **Creator:** lista NFTs com royalty configurado
- **Marketplace:** cobra fee sobre cada venda

**Entidades on-chain:**
| Entidade | Tipo | Notas |
|---|---|---|
| NFT | ERC-721 | tokenURI no IPFS |
| Listing | struct | price, seller, royaltyBps |
| Sale | event | buyer, seller, price, royalty |

**Regras críticas:**
- RN01: Royalty máximo de 10% (1000 bps)
- RN02: Reentrancy guard em todas as funções de pagamento
- RN03: Withdraw pattern para pagamentos (nunca push)

### Passo 3: @architect

**Estrutura monorepo:**
```
contracts/
  Marketplace.sol
  NFT.sol
  interfaces/IMarketplace.sol
scripts/
  deploy.js
test/
  Marketplace.test.js
frontend/
  src/
    app/
      marketplace/page.tsx
      create/page.tsx
    components/
      NFTCard.tsx
      ListingModal.tsx
    hooks/
      useMarketplace.ts  ← wagmi hooks
    lib/
      contracts.ts       ← ABIs e endereços
```

### Passo 4: @dev (contratos)

```
/dev

Implemente o contrato Marketplace.sol com:
- ERC-721 listing
- Royalties on-chain
- Reentrancy guard (OpenZeppelin)
- Withdraw pattern para pagamentos
```

**O @dev escreve:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract Marketplace is ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price;
        uint256 royaltyBps;  // base points: 1000 = 10%
        address royaltyRecipient;
    }

    mapping(address => mapping(uint256 => Listing)) public listings;
    mapping(address => uint256) public pendingWithdrawals;  // pull pattern

    uint256 public constant MAX_ROYALTY_BPS = 1000;

    function buyNFT(address nftContract, uint256 tokenId)
        external payable nonReentrant
    {
        Listing memory listing = listings[nftContract][tokenId];
        require(msg.value >= listing.price, "Insufficient payment");

        uint256 royalty = (listing.price * listing.royaltyBps) / 10000;
        uint256 sellerAmount = listing.price - royalty;

        // Acumular (não enviar direto — evita reentrancy)
        pendingWithdrawals[listing.royaltyRecipient] += royalty;
        pendingWithdrawals[listing.seller] += sellerAmount;

        delete listings[nftContract][tokenId];
        IERC721(nftContract).safeTransferFrom(listing.seller, msg.sender, tokenId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }
}
```

### Passo 5: @qa (auditoria de contrato)

```
/qa

Audite o Marketplace.sol para:
- Vulnerabilidades de reentrancy
- Integer overflow/underflow
- Access control
- Edge cases no withdraw pattern
Escreva testes Hardhat cobrindo todos os cenários críticos.
```

---

## Cenário 5 — API Node.js com Fastify (SMALL)

**Projeto:** API de gerenciamento de pedidos para restaurante.
**Stack:** Node.js + Fastify + PostgreSQL + Prisma + JWT.
**Classificação:** SMALL (2 tipos de usuário=1pt, 2 integrações=1pt, algumas regras=1pt → 3 pontos)

### Passo 1: Instalar

```bash
mkdir restaurante-api && cd restaurante-api
npm init -y
npm install fastify @prisma/client
npm install -D prisma
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Restaurante API" \
  --project-type=api \
  --framework="Node" \
  --framework-installed=true \
  --classification=SMALL \
  --lang=pt-BR
```

### Passo 2: @setup

```
/setup
```

**O agente confirma:**
```
Framework detectado: Node.js (package.json ✓)
Projeto: Restaurante API (SMALL)

Plano: @setup → @product → @analyst → @architect → @dev → @qa
Próximo: /product
```

### Passo 3: @product

```
/product
```

**O @product gera o PRD base** com visão, usuários, escopo do MVP e fora do escopo.

### Passo 4: @analyst

```
/analyst
```

*Você responde às perguntas:*

- **Usuários:** Garçom (cria pedidos), Cozinha (atualiza status)
- **Fluxo principal:** Garçom abre mesa → adiciona itens → cozinha vê e prepara → garçom fecha conta
- **Regras críticas:**
  - Pedido não pode ser fechado com itens pendentes
  - Item cancelado não volta ao estoque (soft delete no pedido)
  - Mesa só pode ter 1 pedido aberto por vez
- **Integrações:** WhatsApp (aviso ao garçom quando prato fica pronto), impressora fiscal

**O @analyst entrega** `.aioson/context/discovery.md`:

```markdown
## Entidades principais

| Entidade    | Atributos                               | Restrições                      |
|-------------|------------------------------------------|----------------------------------|
| Table       | id, number, status (free/occupied)       | 1 pedido aberto por vez         |
| Order       | id, table_id, status, opened_at          | closed só se itens = ready      |
| OrderItem   | id, order_id, menu_item_id, qty, status  | status: pending/ready/cancelled |
| MenuItem    | id, name, price, category, available     | —                               |
| User        | id, name, role (waiter/kitchen)          | JWT auth por role               |

## Regras de negócio
- RN01: Mesa não pode ter 2 pedidos abertos simultaneamente
- RN02: Pedido só fecha se todos os itens estiverem ready ou cancelled
- RN03: Garçom só vê suas próprias mesas; cozinha vê tudo

## Integrações
- WhatsApp API (Evolution API) — notificação quando item fica pronto
- Impressora fiscal — payload no fechamento do pedido
```

### Passo 4: @architect

```
/architect
```

**O @architect entrega** `.aioson/context/architecture.md`:

```
Classificação: SMALL → estrutura Fastify por domínio

src/
  plugins/
    prisma.js        ← decorador global do cliente Prisma
    auth.js          ← fastify-jwt plugin
  routes/
    orders/
      index.js       ← GET /orders, POST /orders
      [id].js        ← GET, PATCH, DELETE /orders/:id
    items/
      index.js
    tables/
      index.js
  services/
    order.service.js        ← regras de negócio (RN01, RN02)
    notification.service.js ← WhatsApp integration
  schemas/
    order.schema.js  ← Fastify JSON Schema para validação
  app.js

prisma/
  schema.prisma
  migrations/

test/
  orders.test.js
```

**Decisões técnicas:**
- Auth: `fastify-jwt` com roles no payload (`{ id, role }`)
- Validação: Fastify JSON Schema (não Zod — evitar overhead)
- ORM: Prisma (type-safe, migrations automáticas)

### Passo 5: @dev

```
/dev

Implemente a rota POST /orders e o OrderService.
Inclua a validação RN01 (mesa com pedido aberto).
```

**O @dev implementa:**

```javascript
// src/services/order.service.js
class OrderService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async create({ tableId, waiterId }) {
    // RN01: verificar mesa livre
    const open = await this.prisma.order.findFirst({
      where: { tableId, status: { in: ['open', 'in_progress'] } },
    });
    if (open) {
      throw new Error('Table already has an open order');
    }

    return this.prisma.order.create({
      data: { tableId, waiterId, status: 'open' },
    });
  }

  async close(orderId) {
    // RN02: verificar itens pendentes
    const pending = await this.prisma.orderItem.count({
      where: { orderId, status: 'pending' },
    });
    if (pending > 0) {
      throw new Error('Cannot close order with pending items');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'closed', closedAt: new Date() },
    });
  }
}

module.exports = { OrderService };
```

```javascript
// src/routes/orders/index.js
module.exports = async function orderRoutes(fastify) {
  const service = new OrderService(fastify.prisma);

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.requireRole('waiter')],
    schema: {
      body: { type: 'object', required: ['tableId'], properties: {
        tableId: { type: 'integer' }
      }},
    },
  }, async (request, reply) => {
    const order = await service.create({
      tableId: request.body.tableId,
      waiterId: request.user.id,
    });
    return reply.code(201).send(order);
  });
};
```

### Passo 6: @qa

```
/qa

Escreva testes para o OrderService:
- criação com sucesso
- RN01: mesa com pedido aberto (deve lançar erro)
- RN02: fechamento com itens pendentes (deve lançar erro)
- fechamento com sucesso
```

---

## Cenário 6 — Aplicação Rails + Hotwire (SMALL)

**Projeto:** Plataforma colaborativa de gerenciamento de tarefas.
**Stack:** Rails 7 + PostgreSQL + Hotwire (Turbo + Stimulus) + Tailwind CSS.
**Classificação:** SMALL (2 tipos de usuário=1pt, 1 integração=1pt, algumas regras=1pt → 3 pontos)

### Passo 1: Instalar

```bash
rails new task-app --database=postgresql --css=tailwind
cd task-app
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Task App" \
  --project-type=web_app \
  --framework="Rails" \
  --framework-installed=true \
  --classification=SMALL \
  --lang=pt-BR
```

### Passo 2: @setup

```
/setup
```

**O agente confirma:**
```
Framework detectado: Rails (config/application.rb ✓)
Versão: Rails 7.x

Plano: @setup → @product → @analyst → @architect → @dev → @qa
Próximo: /product
```

### Passo 3: @product

```
/product
```

**O @product gera o PRD base** com visão, usuários, escopo do MVP e fora do escopo.

### Passo 4: @analyst

*Você responde às perguntas:*

- **Usuários:** Admin (cria projetos e convida membros), Membro (cria e move tarefas)
- **Fluxo:** Admin cria projeto → convida membros → membros criam e movem tarefas entre colunas (To Do / In Progress / Done)
- **Regras:**
  - Tarefa só pode ser atribuída a membros do mesmo projeto
  - Admin pode arquivar projeto (tarefas ficam read-only)
  - Membros recebem e-mail ao serem atribuídos a uma tarefa
- **Integrações:** ActionMailer (e-mails de notificação)

**O @analyst entrega** `.aioson/context/discovery.md`:

```markdown
## Entidades
| Entidade    | Atributos                                    | Restrições                         |
|-------------|----------------------------------------------|-------------------------------------|
| User        | id, name, email, password_digest             | Devise ou has_secure_password       |
| Project     | id, name, archived, owner_id                 | owner deve ser admin                |
| Membership  | id, project_id, user_id, role                | role: admin/member                  |
| Task        | id, project_id, assignee_id, title, status   | assignee deve ser membro do projeto |
| Column      | status enum: todo/in_progress/done           | —                                   |

## Regras
- RN01: Atribuição restrita a membros do projeto (validação no model)
- RN02: Projeto arquivado → tarefas readonly
- RN03: E-mail via ActionMailer ao atribuir tarefa
```

### Passo 4: @architect

**O @architect entrega:**

```
Classificação: SMALL → estrutura Rails padrão com concerns

app/
  models/
    user.rb, project.rb, membership.rb, task.rb
    concerns/
      archivable.rb      ← módulo para lógica de arquivamento
  controllers/
    projects_controller.rb
    tasks_controller.rb
    memberships_controller.rb
  views/
    projects/
      index.html.erb
      show.html.erb      ← board Kanban
    tasks/
      _task.html.erb     ← Turbo Frame por tarefa
      _form.html.erb
    layouts/
      application.html.erb
  mailers/
    task_mailer.rb
  javascript/
    controllers/
      kanban_controller.js  ← Stimulus: drag-and-drop colunas

config/routes.rb
db/schema.rb
test/models/, test/controllers/
```

**Decisões técnicas:**
- Realtime: Turbo Streams via ActionCable (move de tarefa sem refresh)
- Auth: `has_secure_password` + `before_action :require_login`
- Drag-and-drop: Stimulus + Sortable.js (sem React)

### Passo 5: @dev

```
/dev

Implemente a move de tarefa via Turbo Stream.
Quando o usuário arrasta uma tarefa para outra coluna,
o status deve ser atualizado sem reload de página.
```

**O @dev implementa:**

```ruby
# app/controllers/tasks_controller.rb
def update
  @task = current_user.accessible_tasks.find(params[:id])

  if @task.update(task_params)
    respond_to do |format|
      format.turbo_stream do
        render turbo_stream: [
          turbo_stream.remove("task_#{@task.id}"),
          turbo_stream.append("column_#{@task.status}", partial: "tasks/task", locals: { task: @task })
        ]
      end
      format.html { redirect_to project_path(@task.project) }
    end
  end
end
```

```javascript
// app/javascript/controllers/kanban_controller.js
import { Controller } from "@hotwired/stimulus"
import Sortable from "sortablejs"

export default class extends Controller {
  static targets = ["column"]

  connect() {
    this.columnTargets.forEach(column => {
      new Sortable(column, {
        group: "tasks",
        animation: 150,
        onEnd: (event) => this.#moved(event),
      })
    })
  }

  #moved(event) {
    const taskId = event.item.dataset.taskId
    const newStatus = event.to.dataset.status
    fetch(`/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this.#csrfToken() },
      body: JSON.stringify({ task: { status: newStatus } }),
    })
  }

  #csrfToken() {
    return document.querySelector('meta[name="csrf-token"]').content
  }
}
```

### Passo 6: @qa

```
/qa

Escreva testes para:
- RN01: atribuição de tarefa a não-membro (deve falhar)
- RN02: projeto arquivado — atualização de tarefa deve ser bloqueada
- Turbo Stream: resposta correta ao mover tarefa
```

---

## Cenário 7 — API Python com FastAPI (MICRO)

**Projeto:** API de controle de estoque pessoal.
**Stack:** Python + FastAPI + SQLite + SQLAlchemy + Pydantic.
**Classificação:** MICRO (1 tipo de usuário=0pt, 0 integrações=0pt, sem regras complexas=0pt → 0 pontos)

> **Django:** Para projetos Python SMALL ou MEDIUM (múltiplos usuários, banco relacional maior, admin panel), prefira Django + DRF. O FastAPI brilha em APIs simples, serviços assíncronos e microsserviços.

### Passo 1: Instalar

```bash
mkdir estoque-api && cd estoque-api
pip install fastapi uvicorn sqlalchemy pydantic
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Estoque API" \
  --project-type=api \
  --framework="FastAPI" \
  --framework-installed=true \
  --classification=MICRO \
  --lang=pt-BR
```

### Passo 2: @setup (detectando FastAPI)

```
/setup
```

**O agente confirma:**
```
Framework detectado: FastAPI (dependência em requirements.txt ✓)
Classificação: MICRO

Nota: FastAPI não está na lista padrão de detecção automática.
      O framework foi registrado a partir da sua descrição.

Plano simplificado (MICRO): @setup → @dev
Próximo passo: ative /dev e descreva o que precisa.
```

> O @setup registra `framework: "FastAPI"` no context.md e segue normalmente.
> Não existe stack "errada" — qualquer framework que você descrever é aceito.

### Passo 3: @dev direto

```
/dev

Crie uma API FastAPI para controle de estoque com:
- CRUD de produtos (nome, quantidade, preço, categoria)
- Endpoint de busca por categoria
- SQLAlchemy com SQLite
- Validação via Pydantic
```

**O @dev implementa:**

```python
# main.py
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from . import models, schemas, crud
from .database import SessionLocal, engine

models.Base.metadata.create_all(bind=engine)
app = FastAPI(title="Estoque API")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/products/", response_model=schemas.Product, status_code=201)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    return crud.create_product(db, product)

@app.get("/products/", response_model=list[schemas.Product])
def list_products(category: str | None = None, db: Session = Depends(get_db)):
    return crud.get_products(db, category=category)

@app.put("/products/{product_id}", response_model=schemas.Product)
def update_product(product_id: int, product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_product = crud.update_product(db, product_id, product)
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    return db_product
```

```python
# schemas.py
from pydantic import BaseModel, Field

class ProductBase(BaseModel):
    name: str
    quantity: int = Field(ge=0)
    price: float = Field(ge=0)
    category: str

class ProductCreate(ProductBase):
    pass

class Product(ProductBase):
    id: int
    class Config:
        from_attributes = True
```

**Por que MICRO?**
Domínio único (Produto), sem autenticação, sem integrações externas. O @dev tem contexto suficiente para implementar sem @analyst ou @architect.

---

## Dicas gerais

### Quando recomeçar um agente

Se você forneceu informações incompletas, pode simplesmente reativar:
```
/analyst

Preciso adicionar uma informação: o sistema também vai ter integração com Mercado Pago
```

O agente vai incorporar a nova informação antes de gerar a entrega final.

### Quando pular um agente

- Em projetos **MICRO**, pule @analyst, @architect e @qa — vá direto ao @dev.
- Se o projeto não tem interface visual, pode pular @ux-ui mesmo em projetos SMALL.
- Se o projeto MEDIUM tem módulos pouco interdependentes, pode pular @orchestrator e usar @dev sequencialmente.

### Mudança de contexto

Se durante o desenvolvimento o projeto crescer e mudar de SMALL para MEDIUM:
```bash
npx @jaimevalasek/aioson setup:context . --defaults --classification=MEDIUM
```

Então ative @pm e @orchestrator antes de continuar com @dev.

### Verificar estado atual

```bash
npx @jaimevalasek/aioson doctor          # valida saúde dos arquivos
npx @jaimevalasek/aioson context:validate # valida o project.context.md
npx @jaimevalasek/aioson parallel:status  # progresso das lanes (MEDIUM)
```

---

## Veja também

- [Início rápido](./inicio-rapido.md)
- [Guia de agentes](./agentes.md)
- [Suporte Web3](./web3.md) — cenários completos Ethereum, Solana e Midnight Network
- [Orquestração paralela](../en/parallel.md)
