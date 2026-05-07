# Web3 Support

AIOSON includes lightweight Web3 support for small and medium teams using JavaScript/TypeScript workflows.

## Supported framework detection
- Ethereum: `Hardhat`, `Foundry`, `Truffle`
- Solana: `Anchor`, `Solana Web3`
- Cardano: `Cardano` (Aiken and Cardano SDK dependency signals)

## Context contract for dApps
`project_type` accepts `dapp`, and setup can include:
- `web3_enabled`
- `web3_networks`
- `contract_framework`
- `wallet_provider`
- `indexer`
- `rpc_provider`

## Setup examples
```bash
# Interactive
aioson setup:context

# Defaults with explicit Web3 options
aioson setup:context . \
  --defaults \
  --project-type=dapp \
  --framework=Hardhat \
  --web3-enabled=true \
  --web3-networks=ethereum \
  --contract-framework=Hardhat \
  --wallet-provider=wagmi \
  --indexer="The Graph" \
  --rpc-provider=Alchemy
```

## Web3 smoke checks
```bash
aioson test:smoke --web3=ethereum
aioson test:smoke --web3=solana
aioson test:smoke --web3=cardano
```

## Skills bundled in templates
- Static:
  - `web3-ethereum-patterns.md`
  - `web3-solana-patterns.md`
  - `web3-cardano-patterns.md`
  - `web3-security-checklist.md`
  - `node-typescript-patterns.md`
- Dynamic:
  - `ethereum-docs.md`
  - `solana-docs.md`
  - `cardano-docs.md`
