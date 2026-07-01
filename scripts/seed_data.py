"""Seed BEACON with real on-chain data on studionet."""
from pathlib import Path

from gltest_cli.config.general import get_general_config
from gltest_cli.config.user import load_user_config
from gltest import get_contract_factory, get_default_account

ROOT = Path(__file__).resolve().parents[1]
ADDR = "0x3e30789CaF5c6d461E8E4102F42c7667D1de5A1F"
GEN = 10 ** 18
URL = "https://example.com"

cfg = load_user_config(str(ROOT / "gltest.config.yaml"))
get_general_config().user_config = cfg
c = get_contract_factory(contract_file_path=str(ROOT / "contracts" / "beacon.py")).build_contract(
    ADDR, account=get_default_account())

CLAIMS = [
    "The example.com page states the domain is for use in illustrative examples in documents.",
    "The example.com page displays a live, real-time Bitcoin price chart.",
]


def main():
    if c.get_claim_count().call() == 0:
        for stmt in CLAIMS:
            c.open_claim(args=[stmt, URL]).transact()
            print("opened:", stmt[:46])
        # stake both sides on each (single account demo)
        c.stake(args=[0, 1]).transact(value=3 * GEN); c.stake(args=[0, 0]).transact(value=2 * GEN)
        c.stake(args=[1, 1]).transact(value=1 * GEN); c.stake(args=[1, 0]).transact(value=2 * GEN)
        print("staked both sides")
    for cid in (0, 1):
        cl = c.get_claim(args=[cid]).call()
        if int(cl["status"]) == 0:
            print("resolving", cid, "(AI)...")
            try:
                c.resolve(args=[cid]).transact()
            except Exception as e:
                print("resolve", cid, "->", e)
    for cid in (0, 1):
        cl = c.get_claim(args=[cid]).call()
        st = ["OPEN", "RESOLVED"][int(cl["status"])]
        out = ["NO", "YES"][int(cl["outcome"])]
        print(cid, st, "outcome=", out, "yes=", cl["yes_pool"], "no=", cl["no_pool"], "|", (cl["rationale"] or "")[:50])


if __name__ == "__main__":
    main()
