"""Tests for BEACON (direct runner). AI resolve() validated live on studionet."""
from pathlib import Path

CONTRACT = str(Path(__file__).resolve().parents[1] / "contracts" / "beacon.py")
GEN = 10 ** 18
C_OPEN = 0; C_RESOLVED = 1
SIDE_NO = 0; SIDE_YES = 1


def _open(b, vm, who, stmt="BTC is above 1M USD", url="https://example.com"):
    vm.sender = who
    return b.open_claim(stmt, url)


def _stake(b, vm, who, cid, side, amt):
    vm.sender = who; vm.value = amt * GEN
    b.stake(cid, side); vm.value = 0


def test_open_claim(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    cid = _open(b, direct_vm, direct_alice)
    assert cid == 0
    assert b.get_claim(0)["status"] == C_OPEN


def test_open_requires_statement(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("a claim statement is required"):
        b.open_claim("", "https://x.com")


def test_stake_pools(deploy, direct_vm, direct_alice, direct_bob):
    b = deploy(CONTRACT)
    _open(b, direct_vm, direct_alice)
    _stake(b, direct_vm, direct_alice, 0, SIDE_YES, 3)
    _stake(b, direct_vm, direct_bob, 0, SIDE_NO, 2)
    c = b.get_claim(0)
    assert int(c["yes_pool"]) == 3 * GEN
    assert int(c["no_pool"]) == 2 * GEN
    assert b.get_stake_count() == 2


def test_stake_requires_value(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    _open(b, direct_vm, direct_alice)
    direct_vm.sender = direct_alice; direct_vm.value = 0
    with direct_vm.expect_revert("stake some GEN"):
        b.stake(0, SIDE_YES)


def test_stake_bad_side(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    _open(b, direct_vm, direct_alice)
    direct_vm.sender = direct_alice; direct_vm.value = GEN
    with direct_vm.expect_revert("side must be YES or NO"):
        b.stake(0, 5)
    direct_vm.value = 0


def test_claim_before_resolve(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    _open(b, direct_vm, direct_alice)
    _stake(b, direct_vm, direct_alice, 0, SIDE_YES, 1)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("not resolved yet"):
        b.claim_winnings(0)


def test_resolve_bad_id(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("no such claim"):
        b.resolve(0)


def test_multiple(deploy, direct_vm, direct_alice):
    b = deploy(CONTRACT)
    _open(b, direct_vm, direct_alice, stmt="Claim A")
    _open(b, direct_vm, direct_alice, stmt="Claim B")
    assert b.get_claim_count() == 2
    assert b.get_claim(1)["statement"] == "Claim B"
