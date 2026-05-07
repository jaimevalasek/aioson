# Suporte Web3

> Como usar o AIOSON para projetos de blockchain e contratos inteligentes.

---

## Frameworks detectados automaticamente

O AIOSON detecta sua stack Web3 ao rodar `setup:context` ou `doctor`:

| Chain | Frameworks detectados | Sinais de detecção |
|---|---|---|
| Ethereum | Hardhat, Foundry, Truffle | `hardhat.config.*`, `foundry.toml`, `truffle-config.js` |
| Solana | Anchor, Solana Web3.js | `Anchor.toml`, `programs/*/src/lib.rs` |
| Cardano (Aiken) | Aiken | `aiken.toml`, arquivos `.ak` |
| Midnight Network | Compact | `compact.config.ts`, arquivos `.compact`, `@midnight-ntwrk/*` em package.json |

---

## Configurando um projeto dApp

### Setup interativo

```bash
npx @jaimevalasek/aioson setup:context
```

Responda `dapp` quando perguntado sobre o tipo de projeto.

### Setup com flags (recomendado para automação)

**Ethereum com Hardhat:**
```bash
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Meu DApp" \
  --project-type=dapp \
  --framework=Hardhat \
  --framework-installed=true \
  --classification=MEDIUM \
  --web3-enabled=true \
  --web3-networks=ethereum \
  --contract-framework=Hardhat \
  --wallet-provider=wagmi \
  --rpc-provider=Alchemy \
  --lang=pt-BR
```

**Solana com Anchor:**
```bash
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Meu Programa Solana" \
  --project-type=dapp \
  --framework=Anchor \
  --framework-installed=true \
  --classification=SMALL \
  --web3-enabled=true \
  --web3-networks=solana \
  --contract-framework=Anchor \
  --wallet-provider=Phantom \
  --lang=pt-BR
```

**Cardano com Aiken:**
```bash
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Meu Contrato Cardano" \
  --project-type=dapp \
  --framework=Cardano \
  --framework-installed=true \
  --classification=SMALL \
  --web3-enabled=true \
  --web3-networks=cardano \
  --contract-framework=Aiken \
  --lang=pt-BR
```

**Midnight Network com Compact:**
```bash
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Meu DApp Midnight" \
  --project-type=dapp \
  --framework=Midnight \
  --framework-installed=true \
  --classification=SMALL \
  --web3-enabled=true \
  --web3-networks=midnight \
  --contract-framework=Compact \
  --wallet-provider="Midnight Lace" \
  --rpc-provider=testnet \
  --lang=pt-BR
```

---

## Monorepo: contratos + frontend no mesmo repositório

Se você tem contratos inteligentes E um frontend no mesmo repositório (exemplo comum: Hardhat na raiz + Next.js em `/frontend`), o AIOSON detecta isso automaticamente como **monorepo** e exibe um aviso:

```
⚠ Monorepo detectado: framework Web3 (Hardhat) e framework de aplicação (Next.js)
  coexistem no mesmo diretório. Configure os caminhos de build separadamente.
```

**Estrutura recomendada para monorepo Ethereum:**
```
meu-dapp/
  contracts/         ← Solidity
  scripts/           ← deploy
  test/              ← testes de contrato
  frontend/          ← Next.js
    src/
      hooks/         ← wagmi hooks
      lib/
        contracts.ts ← ABIs e endereços deployados
  hardhat.config.js
  package.json
  .aioson/        ← contexto AIOSON
```

---

## Agentes em projetos Web3

### @analyst — o que mapear

Para dApps, o @analyst vai focar em:
- **Atores on-chain vs off-chain:** quem chama qual função do contrato?
- **Entidades do contrato:** structs, mappings, events
- **Regras de negócio críticas:** limites, access control, tokenomics
- **Riscos de segurança:** reentrancy, overflow, front-running, flash loans

**Exemplo de saída para um protocolo DeFi:**
```markdown
## Atores
- Liquidity Provider: deposita tokens no pool
- Trader: faz swaps pagando fee
- Protocol Admin: pode pausar e atualizar parâmetros

## Entidades on-chain
| Entidade  | Tipo         | Notas                        |
|-----------|--------------|------------------------------|
| Pool      | struct       | tokenA, tokenB, reservas     |
| Position  | mapping      | LP → liquidez provida        |
| Swap      | event        | amountIn, amountOut, fee     |

## Riscos identificados
- Flash loan attack no cálculo de preço
- Reentrancy em withdraw de liquidez
- Front-running em transações de swap grandes
```

### @architect — estrutura para cada chain

**Ethereum (Hardhat):**
```
contracts/
  core/
    Protocol.sol
    interfaces/IProtocol.sol
  utils/
    Math.sol
  mocks/
    MockToken.sol  ← apenas para testes
scripts/
  deploy/
    01_deploy_protocol.js
test/
  Protocol.test.js
frontend/ (se monorepo)
```

**Solana (Anchor):**
```
programs/
  meu-programa/
    src/
      lib.rs
      instructions/
        initialize.rs
        deposit.rs
      state/
        pool.rs
      errors.rs
tests/
  meu-programa.ts
app/ (se monorepo)
```

**Cardano (Aiken):**
```
lib/
  validators/
    minting.ak
    spending.ak
  utils/
    math.ak
validators/
  main.ak
scripts/
  deploy.sh
```

**Midnight Network (Compact):**
```
midnight-dapp/
  contract/
    src/
      contract.compact    ← lógica on-chain em Compact
    managed/
      contract/           ← gerado por `compact compile`
        contract.cjs      ← bindings TypeScript geradas
        contract.d.ts
  src/
    witnesses.ts          ← estado privado off-chain (never on-chain)
    index.ts              ← DApp logic (TypeScript)
    providers.ts          ← Midnight providers (wallet, node)
  compact.config.ts       ← configuração do compilador Compact
  package.json
```

### @dev — convenções Web3

O @dev segue estas regras para contratos:

**Sempre:**
- `ReentrancyGuard` do OpenZeppelin em funções de pagamento
- Withdraw pattern (pull) em vez de push para pagamentos
- `require` com mensagens descritivas
- Events para todas as ações de estado relevante
- Testes em fork da mainnet para integrações DeFi

**Nunca:**
- Usar `transfer()` ou `send()` diretamente em funções públicas
- Armazenar dados sensíveis on-chain sem criptografia
- Fazer cálculos com divisão antes de multiplicação (perda de precisão)
- Confiar em `block.timestamp` para lógica crítica

### @qa — auditoria de contratos

O @qa em projetos Web3 vai além de testes funcionais:

```
/qa

Audite os contratos para:
- Reentrancy (todas as funções externas que modificam estado)
- Integer overflow/underflow (pré-0.8.0 ou operações unchecked)
- Access control (funções admin protegidas?)
- Oracle manipulation
- Eventos emitidos corretamente
Escreva testes Hardhat/Foundry com cenários de ataque.
```

---

## Smoke tests Web3

Valide sua configuração de dApp:

```bash
# Verificar configuração Ethereum
npx @jaimevalasek/aioson test:smoke --web3=ethereum

# Verificar configuração Solana
npx @jaimevalasek/aioson test:smoke --web3=solana

# Verificar configuração Cardano
npx @jaimevalasek/aioson test:smoke --web3=cardano

# Monorepo Web3 + frontend
npx @jaimevalasek/aioson test:smoke --profile=mixed
```

---

## Skills incluídas nos templates

Após instalar, você tem acesso a skills estáticas de referência:

| Skill | Conteúdo |
|---|---|
| `web3-ethereum-patterns` | Padrões Solidity, ERC standards, gas optimization |
| `web3-solana-patterns` | Padrões Rust/Anchor, PDAs, Cross-program invocations |
| `web3-cardano-patterns` | Aiken, UTxO model, datum/redeemer patterns |
| `web3-midnight-patterns` | Compact language, ledger/circuit/witness model, ZK proof patterns |
| `web3-security-checklist` | Checklist completo de auditoria de contratos |
| `node-typescript-patterns` | Padrões TypeScript para scripts e frontend Web3 |

Para usar uma skill, referencie no seu AI IDE:
```
/dev Usando a skill web3-security-checklist, audite nosso contrato.
```

---

## Cenários completos por chain

### Ethereum — DeFi Vault (MEDIUM)

**Projeto:** Protocolo de vault: usuário deposita ETH, recebe yield de estratégias DeFi.
**Stack:** Foundry (contratos) + Next.js + wagmi + RainbowKit (frontend).

#### @analyst identifica:

```markdown
## Atores
- Depositor: deposita ETH, recebe shares proporcional ao vault
- Harvester (bot): chama harvest() periodicamente para colher yield
- Protocol Admin: define estratégias e parâmetros de risco

## Entidades on-chain
| Entidade    | Tipo    | Notas                                      |
|-------------|---------|---------------------------------------------|
| Vault       | contrato| ERC-4626 (padrão de vault tokenizado)      |
| Strategy    | contrato| interface IStrategy, lógica de yield        |
| VaultShare  | ERC-20  | token de participação (share)               |

## Regras críticas
- RN01: Cálculo de shares usa preço por share no momento do depósito
- RN02: Withdraw tem timelock de 24h (anti-flash loan)
- RN03: harvest() apenas por HARVESTER_ROLE (access control)
- RN04: Slippage máximo configurável pelo admin
```

#### @architect estrutura:

```
contracts/
  src/
    Vault.sol              ← ERC-4626
    BaseStrategy.sol       ← interface abstrata
    strategies/
      AaveStrategy.sol     ← yield via Aave
    interfaces/
      IStrategy.sol
    utils/
      Math.sol             ← precisão 1e18
  test/
    Vault.t.sol            ← Foundry tests (fork mainnet)
  script/
    Deploy.s.sol
  foundry.toml

frontend/
  src/
    app/
      vault/page.tsx       ← UI de depósito/saque
    components/
      DepositModal.tsx
      VaultStats.tsx       ← TVL, APY, shares
    hooks/
      useVault.ts          ← wagmi hooks ERC-4626
    lib/
      vault.ts             ← ABI + endereço deployado
```

#### @dev implementa (trecho do Vault.sol):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "openzeppelin/contracts/access/AccessControl.sol";

contract Vault is ERC4626, AccessControl {
    bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");

    uint256 public constant WITHDRAW_TIMELOCK = 24 hours;
    mapping(address => uint256) public withdrawRequests;

    constructor(IERC20 asset) ERC4626(asset) ERC20("Vault Share", "vETH") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function requestWithdraw(uint256 shares) external {
        withdrawRequests[msg.sender] = block.timestamp;
        _transfer(msg.sender, address(this), shares);  // bloqueia shares
    }

    function withdraw(uint256 shares) external {
        require(block.timestamp >= withdrawRequests[msg.sender] + WITHDRAW_TIMELOCK, "Timelock ativo");
        delete withdrawRequests[msg.sender];
        // ERC-4626 redeem...
    }

    function harvest() external onlyRole(HARVESTER_ROLE) {
        // colhe yield das estratégias
    }
}
```

#### @qa audita (Foundry):

```solidity
// test/Vault.t.sol
function test_RevertWhen_WithdrawBeforeTimelock() public {
    vault.deposit(1 ether, alice);
    vm.prank(alice);
    vault.requestWithdraw(vault.balanceOf(alice));

    // Tenta sacar imediatamente — deve reverter
    vm.prank(alice);
    vm.expectRevert("Timelock ativo");
    vault.withdraw(vault.balanceOf(address(vault)));
}

function test_HarvestOnlyByRole() public {
    vm.prank(bob);  // bob não tem HARVESTER_ROLE
    vm.expectRevert();
    vault.harvest();
}
```

---

### Solana — Programa de Staking (SMALL)

**Projeto:** Programa Solana para staking de token SPL com recompensas.
**Stack:** Anchor (programa) + TypeScript (cliente) + Phantom Wallet.

#### Setup:

```bash
anchor init staking-program --template=typescript
cd staking-program
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Staking Program" \
  --project-type=dapp \
  --framework=Anchor \
  --framework-installed=true \
  --classification=SMALL \
  --web3-enabled=true \
  --web3-networks=solana \
  --contract-framework=Anchor \
  --wallet-provider=Phantom \
  --rpc-provider=Helius \
  --lang=pt-BR
```

#### @analyst identifica:

```markdown
## Atores
- Staker: deposita tokens SPL, recebe rewards proporcionais ao tempo
- Protocol Admin: inicializa pool e define taxa de reward

## Entidades on-chain (Accounts PDA)
| Account     | Seeds                    | Dados                                    |
|-------------|--------------------------|-------------------------------------------|
| StakePool   | ["pool", admin]          | mint, reward_rate, total_staked           |
| StakeEntry  | ["entry", pool, staker]  | amount, staked_at, rewards_earned         |

## Regras
- RN01: Rewards calculados por bloco (slot) desde staked_at
- RN02: Unstake devolve tokens + rewards acumulados atomicamente
- RN03: Reward_rate só alterável pelo admin
```

#### @architect estrutura:

```
programs/
  staking-program/
    src/
      lib.rs             ← entry point Anchor
      instructions/
        initialize.rs    ← cria StakePool
        stake.rs         ← deposita tokens no vault PDA
        unstake.rs       ← retira tokens + rewards
      state/
        pool.rs          ← struct StakePool
        entry.rs         ← struct StakeEntry
      errors.rs
tests/
  staking-program.ts     ← testes Anchor/Mocha
app/
  src/
    staking.ts           ← cliente TypeScript
    wallet.ts            ← Phantom integration
Anchor.toml
```

#### @dev implementa:

```rust
// programs/staking-program/src/instructions/stake.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    let entry = &mut ctx.accounts.stake_entry;
    let pool = &mut ctx.accounts.stake_pool;

    // Transfere tokens do staker para o vault PDA
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.staker_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.staker.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    entry.amount = entry.amount.checked_add(amount).unwrap();
    entry.staked_at = Clock::get()?.slot;
    pool.total_staked = pool.total_staked.checked_add(amount).unwrap();

    Ok(())
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

    #[account(
        init_if_needed, payer = staker,
        space = 8 + StakeEntry::SIZE,
        seeds = [b"entry", stake_pool.key().as_ref(), staker.key().as_ref()],
        bump
    )]
    pub stake_entry: Account<'info, StakeEntry>,

    #[account(mut, seeds = [b"pool", stake_pool.admin.as_ref()], bump)]
    pub stake_pool: Account<'info, StakePool>,

    // vault PDA que guarda os tokens
    #[account(mut, seeds = [b"vault", stake_pool.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub staker_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

```typescript
// tests/staking-program.ts
it("stakes tokens and records entry", async () => {
  const amount = new BN(1_000_000); // 1 token (6 decimais)

  await program.methods
    .stake(amount)
    .accounts({
      staker: staker.publicKey,
      stakePool: poolPda,
      stakeEntry: entryPda,
      vault: vaultPda,
      stakerTokenAccount: stakerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([staker])
    .rpc();

  const entry = await program.account.stakeEntry.fetch(entryPda);
  assert.equal(entry.amount.toNumber(), 1_000_000);
});
```

---

### Midnight Network — Privacy DApp com Compact (SMALL)

> **O que é Midnight?** Rede blockchain do ecossistema Cardano (IOG/Charles Hoskinson), focada em privacidade por padrão via zero-knowledge proofs. Usa a linguagem **Compact** — TypeScript-like com tipos estáticos e geração automática de ZK circuits. O token nativo é o **NIGHT**. Mainnet prevista para 2026.

#### Por que Midnight é diferente?

| Característica | Ethereum/Solana | Midnight |
|---|---|---|
| Dados on-chain | Públicos por padrão | Privados por padrão (ZK proofs) |
| Linguagem de contrato | Solidity / Rust | **Compact** (TypeScript-like) |
| Prova de conhecimento | Manual (via ZK libs) | **Automática** pelo compilador |
| Estado privado | Off-chain manual | `witness` (nativo na linguagem) |

#### Conceitos fundamentais do Compact:

- **`ledger`** — estado público on-chain (como `storage` no Solidity)
- **`circuit`** — função que gera ZK proof (como `function` pública)
- **`witness`** — estado privado off-chain (nunca vai para blockchain)
- **`disclose()`** — torna um valor privado verificável on-chain via ZK
- **`Opaque<'string'>`** — tipo para dados privados opacos

#### Setup:

```bash
mkdir midnight-board && cd midnight-board
npm install @midnight-ntwrk/compact-runtime \
            @midnight-ntwrk/midnight-js-contracts \
            @midnight-ntwrk/midnight-js-node-provider
npx @jaimevalasek/aioson install
npx @jaimevalasek/aioson setup:context . --defaults \
  --project-name="Midnight Board" \
  --project-type=dapp \
  --framework=Midnight \
  --framework-installed=true \
  --classification=SMALL \
  --web3-enabled=true \
  --web3-networks=midnight \
  --contract-framework=Compact \
  --wallet-provider="Midnight Lace" \
  --rpc-provider=testnet \
  --lang=pt-BR
```

#### @analyst identifica:

```markdown
## Projeto: Bulletin Board Privado
Quadro de avisos onde apenas o dono provado pode remover sua própria mensagem,
sem revelar quem é o dono publicamente.

## Atores
- Poster: publica mensagem provando ownership via ZK (identidade oculta)
- Viewer: vê se o quadro está ocupado e a mensagem (se pública)
- Owner: remove mensagem provando ser o dono sem revelar identidade

## Estado on-chain (ledger — público)
| Campo    | Tipo              | Descrição                         |
|----------|-------------------|-------------------------------------|
| state    | enum VACANT/OCCUPIED | se o quadro está disponível     |
| message  | Maybe<Opaque>     | mensagem atual (opaca on-chain)   |
| owner    | Bytes<32>         | chave pública derivada de secret  |
| sequence | Counter           | evita replay attacks              |

## Estado off-chain (witness — privado)
- secretKey: Bytes<32> — apenas o dono conhece, nunca vai on-chain

## Regras
- RN01: Apenas o dono provado pode remover a mensagem (ZK ownership proof)
- RN02: Quadro só aceita nova mensagem quando VACANT
- RN03: Identidade do poster nunca é exposta on-chain
```

#### @architect estrutura:

```
midnight-board/
  contract/
    src/
      bboard.compact       ← lógica ZK on-chain
    managed/
      bboard/              ← gerado por `compact compile`
        bboard.cjs
        bboard.d.ts
  src/
    witnesses.ts           ← estado privado (secretKey)
    index.ts               ← DApp logic
    providers.ts           ← Midnight wallet + node providers
  compact.config.ts
  package.json
```

#### @dev implementa:

**Contrato Compact (`contract/src/bboard.compact`):**

```compact
pragma language_version 0.20;
import CompactStandardLibrary;

// Estado on-chain — visível na blockchain (mas message é opaca)
export enum State { VACANT, OCCUPIED }
export ledger state: State;
export ledger message: Maybe<Opaque<'string'>>;
export ledger sequence: Counter;
export ledger owner: Bytes<32>;

constructor() {
  state = State.VACANT;
  message = none<Opaque<'string'>>();
  sequence.increment(1);
}

// Witness: estado PRIVADO — nunca vai para a blockchain
witness localSecretKey(): Bytes<32>;

// Circuit: gera ZK proof de que o chamador conhece o secretKey
// sem revelar o secretKey
export circuit post(newMessage: Opaque<'string'>): [] {
  assert state == State.VACANT "Board already occupied";

  // disclose() torna o valor verificável via ZK sem expor o input
  owner = disclose(publicKey(localSecretKey(), sequence as Field as Bytes<32>));
  message = disclose(some<Opaque<'string'>>(newMessage));
  state = State.OCCUPIED;
}

export circuit takeDown(): Opaque<'string'> {
  assert state == State.OCCUPIED "Board is empty";
  // Prova ZK: mesmo secretKey → mesmo publicKey → é o dono
  assert owner == publicKey(localSecretKey(), sequence as Field as Bytes<32>)
    "Not the owner";

  const msg = fromSome<Opaque<'string'>>(message, "unreachable");
  state = State.VACANT;
  message = none<Opaque<'string'>>();
  sequence.increment(1);
  return msg;
}
```

**Estado privado off-chain (`src/witnesses.ts`):**

```typescript
import { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contract/managed/bboard/bboard.cjs';

// Tipo do estado privado — nunca serializado on-chain
export type BBoardPrivateState = {
  readonly secretKey: Uint8Array;
};

// witnesses: funções que provêem dados privados aos circuits ZK
export const witnesses = {
  localSecretKey: (
    { privateState }: WitnessContext<Ledger, BBoardPrivateState>
  ): [BBoardPrivateState, Uint8Array] => {
    // Retorna [privateState (inalterado), valor para o circuit]
    return [privateState, privateState.secretKey];
  },
};
```

**DApp logic (`src/index.ts`):**

```typescript
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { witnesses, BBoardPrivateState } from './witnesses';

async function deployBoard(providers: MidnightProviders) {
  const privateState: BBoardPrivateState = {
    secretKey: crypto.getRandomValues(new Uint8Array(32)),
  };

  const contract = await deployContract(providers, {
    contract: BBoardContract,
    privateStateKey: 'bboard',
    initialPrivateState: privateState,
  });

  console.log('Board deployed:', contract.deployTxData.public.contractAddress);
  return contract;
}

async function postMessage(contract: BBoardAPI, message: string) {
  const tx = await contract.callTx.post(message);
  await tx.wait();  // aguarda confirmação on-chain
  console.log('Message posted. Board occupied.');
}

async function takeDown(contract: BBoardAPI) {
  const tx = await contract.callTx.takeDown();
  const result = await tx.wait();
  console.log('Message removed:', result);
}
```

#### @qa audita:

```
/qa

Revise o bboard.compact para:
- Replay attack: sequence.increment() executado corretamente no takeDown?
- Ownership spoof: é possível adivinhar o publicKey sem o secretKey?
- State inconsistency: e se takeDown falhar após mudar state para VACANT?
- Teste de integração: post → takeDown → post (ciclo completo no testnet)
```

**Checklist específica Midnight:**
- `witness` nunca contém dados que deveriam estar on-chain
- `disclose()` usado corretamente (nunca disclose o secretKey diretamente)
- `assert` com mensagens descritivas em todos os guards
- Circuits são funções puras (sem side effects fora de ledger)
- Testar com 2 identidades diferentes: dono real e impostor

#### Diferenças de desenvolvimento vs Ethereum/Solana:

| Aspecto | Ethereum (Solidity) | Midnight (Compact) |
|---|---|---|
| Deploy | `npx hardhat run scripts/deploy.js` | `compact compile` → deploy via SDK |
| Teste | Hardhat/Foundry (blockchain local) | Midnight devnet (testnet) |
| Debug | `console.log` em testes | Logs off-chain + state inspection |
| Custo de gas | por operação EVM | por complexidade do ZK circuit |
| Auditoria | Reentrancy, overflow... | Witness leakage, replay attacks... |

---

## Veja também

- [Cenários completos: exemplo de dApp Ethereum](./cenarios.md#cenário-4--dapp-ethereum-medium)
- [Início rápido](../2-comecar/primeiro-projeto.md)
- [Guia de agentes](./agentes.md)
