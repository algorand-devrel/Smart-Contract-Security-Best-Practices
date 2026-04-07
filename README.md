# Algorand Smart Contract Security Best Practices

A practical security reference for Algorand developers using **Algorand TypeScript** and **Algorand Python**. Covers common vulnerabilities with concrete code examples showing both the vulnerable pattern and the secure fix.

## Guide

See [guide.md](./guide.md) for the full guide covering:

1. Smart Contracts vs Logic Signatures
2. Access Control
3. Fee Management
4. Transaction & Input Validation
5. ASA Configuration Security
6. Rekeying & Account Draining
7. Group Transaction Security
8. State Management & Storage Security
9. Arithmetic Safety
10. Updatability & Deletability
11. Randomness, Secrets & Oracles
12. Key Management & Deployment
13. Security Tooling & Audit
14. Off-Chain & Operational Security

## Code Examples

Runnable smart contract examples with tests live in [`smart-contract-examples/`](./smart-contract-examples/projects/smart-contract-examples/smart_contracts/).

### Prerequisites

- [AlgoKit](https://dev.algorand.co/algokit/) installed
- Node.js >= 22
- AlgoKit LocalNet running (`algokit localnet start`)

### Build & Test

```bash
cd smart-contract-examples/projects/smart-contract-examples
npm install
npm run build
npm test
```
