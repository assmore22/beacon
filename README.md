# Beacon V2

A GenLayer adversarial truth market.

The repo combines a public frontend with an intelligent contract that tracks stakes, evidence, review state and final outcomes.

## Beacon Brief

Beacon V2 (# v0.2.16), 45907 bytes, 27 write + 22 view.

The important files are:

- `contracts/beacon_v2.py` - GenLayer contract source
- `deployment.json` - Studionet address, deploy transaction and smoke transaction hashes
- `index.html` and `app.js` - static frontend
- `README.md` - this operator and reviewer guide

## Contract Receipt

- Network: studionet (61999)
- Contract: [0x770Db6D01D1fC69d045ecB208DA669b977c3ee5E](https://explorer-studio.genlayer.com/contracts/0x770Db6D01D1fC69d045ecB208DA669b977c3ee5E)
- Deploy tx: [0x8714ccf0...012319](https://explorer-studio.genlayer.com/tx/0x8714ccf0813d0eab0091a91c7d61a193ebfc9c6e2f2a4d436b721387a4012319)
- Deployed at: 2026-06-23T23:51:13.565Z
- Smoke writes recorded: 21

## Market Mechanics

Typical flow: `open_claim` -> `submit` -> `review` -> `resolve` -> `open_challenge_window` -> `submit_appeal` -> `set_claim_standard` -> `archive_claim`

Useful reads: `get_claim_count`, `get_claim`, `get_item_count`, `get_item`, `get_stake_count`, `get_stake`, `get_claim_record`, `get_recent_claims`

- Primary source: `contracts/beacon_v2.py` (45,907 bytes)
- Public write/action methods: 28
- Read methods: 22
- GenLayer features: live web rendering, LLM adjudication, validator-comparative consensus, indexed storage, append-only collections

## Smoke Trail

- set_claim_standard: [0xcd41bc9a...3491e5](https://explorer-studio.genlayer.com/tx/0xcd41bc9a2eff7f3449796bef5a954d1a175b546cc45bb0cd5b4bd7d91b3491e5)
- open_claim: [0xacee5f3c...d33cf1](https://explorer-studio.genlayer.com/tx/0xacee5f3c1979658d080f6f3887a306dac1d6100ab0a718de3c0d982a24d33cf1)
- add_obligation: [0x01c745e3...a852c8](https://explorer-studio.genlayer.com/tx/0x01c745e3fb3a8dddabccc9fd7e3d3c7e48e9e5b10372e833a00c575127a852c8)
- add_evidence_docs: [0xf824b50e...d6607a](https://explorer-studio.genlayer.com/tx/0xf824b50e381d1908a06eb0258d76f53dbd5589d5201bf53877c7b9366cd6607a)
- add_evidence_web: [0x9b03bbe3...bd2ca3](https://explorer-studio.genlayer.com/tx/0x9b03bbe38d0f610ac1aeceb7431601d7b14363dd01eae5fa67e522cae0bd2ca3)
- stake_yes: [0x4a48854b...ab1347](https://explorer-studio.genlayer.com/tx/0x4a48854bf672198fb9e65fd080ea402f2a935cc1c26500360696ca42feab1347)
- stake_no: [0xfa27131b...9f48a5](https://explorer-studio.genlayer.com/tx/0xfa27131b3bd30654f30c683d2e9af645bd7fa3058fb6e69e513285eace9f48a5)
- open_review: [0xf8a50c3c...57f232](https://explorer-studio.genlayer.com/tx/0xf8a50c3c9f9b0d64e4df260bfd9703e56631346d25d49b95d62aa6053457f232)

## Operator Preview

```powershell
cd <private-workspace-root>
npm run preview:start
npm run preview:project -- 18-beacon
```

Open http://localhost:8080/18-beacon/.

## Release Command

```powershell
cd <private-workspace-root>
npm run publish:project -- -Project 18-beacon -Repo https://github.com/aspro45/<repo-name>.git
```

## Public Repo Safety

- This repository should contain no decrypted wallet material.
- The Studionet deployer private key stays in the local encrypted vault.
- Vercel deployment should use the project folder only.

- QA notes: Upgraded from a compact prediction-market MVP into Beacon V2. Smoke: set_claim_standard / open_claim / add_obligation / two add_evidence calls / YES+NO stakes / open_review / review_claim_with_genlayer / open_challenge_window / submit_challenge / resolve_ch...
