# Beacon

Claim markets where both sides have to leave a public trail.

Beacon is a claim desk for disputed public statements. It combines stakes, evidence and GenLayer review so a YES or NO outcome is tied to sources rather than a private moderator.

## Review Links

| Surface | Link |
| --- | --- |
| Live app | https://beacon-claim-market.vercel.app |
| GitHub | https://github.com/assmore22/beacon |
| Contract | https://explorer-studio.genlayer.com/address/0x770Db6D01D1fC69d045ecB208DA669b977c3ee5E |

## Chain Record

- Network: GenLayer Studionet
- Chain ID: 61999
- Contract: `0x770Db6D01D1fC69d045ecB208DA669b977c3ee5E`
- Deploy transaction: [0x8714ccf0...012319](https://explorer-studio.genlayer.com/tx/0x8714ccf0813d0eab0091a91c7d61a193ebfc9c6e2f2a4d436b721387a4012319)
- Deployed: `2026-06-23T23:51:13.565Z`
- Source: `contracts/beacon_v2.py` (45,907 bytes)

## Protocol Path

1. Define a claim standard.
2. Open a claim with obligations.
3. Let both sides stake and attach evidence while the market is `OPEN`.
4. Use **Review with GenLayer** in the expanded market card. The browser calls `review_claim_with_genlayer` and the canonical record moves to `REVIEWED` with a provisional outcome and challenge deadline.
5. Use the challenge desk for evidence-backed challenges and appeals. Open filings block settlement.
6. After the recorded deadline matures, use **Finalize market**. The browser calls `settle`, which moves the record to `RESOLVED` only when the window is mature and no filing remains open.
7. Winning stakers can then call `claim_winnings`.

The frontend reads both `get_claim` market data and `get_claim_record` lifecycle data, so its buttons are derived from the canonical onchain status instead of a client-side estimate. Contract state is public; write actions still require a connected wallet on GenLayer Studionet.

## Focused Verification

`tests/test_beacon.py` executes the same order exposed by the browser:

```text
open_claim -> review_claim_with_genlayer -> maturity guard -> settle -> RESOLVED
```

The suite also covers review permissions, a challenge that revises the outcome, an appeal that revises it again, blocking settlement while filings remain open, and static verification that the browser source exposes review before finalization.

```bash
python -m pytest -q
# 4 passed
```

## Finalized Smoke

| Action | Transaction |
| --- | --- |
| `set_claim_standard` | [0xcd41bc9a...3491e5](https://explorer-studio.genlayer.com/tx/0xcd41bc9a2eff7f3449796bef5a954d1a175b546cc45bb0cd5b4bd7d91b3491e5) |
| `open_claim` | [0xacee5f3c...d33cf1](https://explorer-studio.genlayer.com/tx/0xacee5f3c1979658d080f6f3887a306dac1d6100ab0a718de3c0d982a24d33cf1) |
| `add_obligation` | [0x01c745e3...a852c8](https://explorer-studio.genlayer.com/tx/0x01c745e3fb3a8dddabccc9fd7e3d3c7e48e9e5b10372e833a00c575127a852c8) |
| `add_evidence_docs` | [0xf824b50e...d6607a](https://explorer-studio.genlayer.com/tx/0xf824b50e381d1908a06eb0258d76f53dbd5589d5201bf53877c7b9366cd6607a) |
| `add_evidence_web` | [0x9b03bbe3...bd2ca3](https://explorer-studio.genlayer.com/tx/0x9b03bbe38d0f610ac1aeceb7431601d7b14363dd01eae5fa67e522cae0bd2ca3) |
| `stake_yes` | [0x4a48854b...ab1347](https://explorer-studio.genlayer.com/tx/0x4a48854bf672198fb9e65fd080ea402f2a935cc1c26500360696ca42feab1347) |

## Local Run

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Release Hygiene

The public package is static and has no install step. Vercel receives only frontend, contract source and public deployment metadata.

Keep wallet private keys, vault exports, `.env` files, Vercel project state and dashboard data out of Git. This repository is for public source, UI, tests and deployment receipts only.
