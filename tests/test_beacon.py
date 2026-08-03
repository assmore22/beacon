"""Executable Beacon V2 authorization and settlement-invariant tests."""

import json
from pathlib import Path


CONTRACT = str(Path(__file__).resolve().parents[1] / "contracts" / "beacon_v2.py")


def _deploy_and_draft(deploy, vm, owner, counterparty):
    vm.warp("2026-07-16T12:00:00Z")
    vm.sender = owner
    contract = deploy(CONTRACT)
    peer = "0x" + counterparty.hex()
    record_id = contract.draft_claim(peer, "Incident threshold", "Official feed confirms the trigger", "https://example.com", "operations", "0")
    return contract, record_id


def _mock_review(vm):
    vm.mock_llm(
        r"Reply ONLY JSON with keys: outcome",
        json.dumps({
            "outcome": "met",
            "confidenceBps": 8400,
            "triggerBps": 8500,
            "acceptanceBps": 8500,
            "grantBps": 8500,
            "settlementBps": 8500,
            "deliveryBps": 8500,
            "summary": "The submitted public evidence satisfies the standard.",
            "rationale": "The source and stated condition agree.",
            "riskFlags": [],
        }),
    )


def _mock_ruling(vm, kind, ruling, revised):
    vm.mock_llm(
        rf"resolving .* {kind}",
        json.dumps({
            "ruling": ruling,
            "revisedOutcome": revised,
            "confidenceDeltaBps": -900 if revised == "not_met" else 700,
            "reason": "The filing supplies controlling public evidence.",
            "riskFlags": [],
        }),
    )


def test_admin_standard_and_review_permissions_execute(
    deploy, direct_vm, direct_alice, direct_bob, direct_charlie
):
    contract, record_id = _deploy_and_draft(
        deploy, direct_vm, direct_alice, direct_bob
    )
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("admin_only"):
        contract.set_claim_standard("attacker-controlled settlement standard")

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("record_operator_only"):
        contract.review_claim_with_genlayer(str(record_id))


def test_maturity_challenge_appeal_and_final_settlement_execute(
    deploy, direct_vm, direct_alice, direct_bob, direct_charlie
):
    contract, record_id = _deploy_and_draft(
        deploy, direct_vm, direct_alice, direct_bob
    )
    direct_vm.sender = direct_alice
    _mock_review(direct_vm)
    contract.review_claim_with_genlayer(str(record_id))

    with direct_vm.expect_revert("review_not_mature"):
        contract.settle(record_id)

    contract.open_challenge_window(str(record_id))
    direct_vm.sender = direct_charlie
    challenge_id = contract.submit_challenge(
        str(record_id),
        "The initial source was superseded.",
        "https://example.org/challenge",
    )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("open_review_filing"):
        contract.settle(record_id)

    _mock_ruling(direct_vm, "challenge", "accepted", "not_met")
    contract.resolve_challenge_with_genlayer(str(record_id), challenge_id)
    record = json.loads(contract.get_claim_record(str(record_id)))
    assert record["outcome"] == "not_met"

    direct_vm.sender = direct_charlie
    appeal_id = contract.submit_appeal(
        str(record_id),
        "A final official publication controls the decision.",
        "https://example.net/appeal",
    )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("open_review_filing"):
        contract.settle(record_id)

    _mock_ruling(direct_vm, "appeal", "granted", "met")
    contract.resolve_appeal_with_genlayer(str(record_id), appeal_id)
    direct_vm.warp("2026-07-16T13:00:01Z")
    contract.settle(record_id)

    record = json.loads(contract.get_claim_record(str(record_id)))
    assert record["outcome"] == "met"
    assert record["status"] == "RESOLVED"
    assert record["challengeIds"] == [challenge_id]
    assert record["appealIds"] == [appeal_id]


def test_browser_claim_review_maturity_finalize_sequence(
    deploy, direct_vm, direct_alice, direct_bob
):
    """Exercise the exact write sequence exposed by the market card."""
    direct_vm.warp("2026-07-16T12:00:00Z")
    direct_vm.sender = direct_alice
    contract = deploy(CONTRACT)
    claim_id = contract.open_claim(
        "The published incident threshold was exceeded.",
        "https://example.com/public-incident-feed",
    )

    opened = json.loads(contract.get_claim_record(str(claim_id)))
    assert opened["status"] == "OPEN"
    assert opened["outcome"] == "pending"

    _mock_review(direct_vm)
    outcome = contract.review_claim_with_genlayer(str(claim_id))
    reviewed = json.loads(contract.get_claim_record(str(claim_id)))
    assert outcome == "met"
    assert reviewed["status"] == "REVIEWED"
    assert reviewed["outcome"] == "met"
    assert int(reviewed["challengeDeadline"]) > 0

    with direct_vm.expect_revert("review_not_mature"):
        contract.settle(claim_id)

    direct_vm.warp("2026-07-16T13:00:01Z")
    contract.settle(claim_id)
    finalized = json.loads(contract.get_claim_record(str(claim_id)))
    assert finalized["status"] == "RESOLVED"
    assert finalized["outcomeSide"] == 1

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("no_winning_pool"):
        contract.claim_winnings(claim_id)


def test_browser_source_exposes_review_then_finalize_actions():
    source = (Path(__file__).resolve().parents[1] / "app.js").read_text(
        encoding="utf-8"
    )
    review_call = 'write(CONTRACT, "review_claim_with_genlayer"'
    finalize_call = 'write(CONTRACT, "settle"'
    assert "Review with GenLayer" in source
    assert "Challenge period" in source
    assert "Finalize market" in source
    assert review_call in source
    assert finalize_call in source
    assert source.index(review_call) < source.index(finalize_call)
