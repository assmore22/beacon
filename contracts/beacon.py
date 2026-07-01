# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
BEACON - Adversarial Truth Markets
==================================
Anyone opens a market on whether a public claim is TRUE, backed by a source URL.
People stake GEN on YES or NO. To resolve, the contract reads the source and a
validator set agrees (Equivalence Principle) whether the claim is true. The
winning side splits the losing side's pool in proportion to their stake, on top
of getting their own stake back. Truth becomes a market anyone can price.

Claim status:  OPEN(0) -> RESOLVED(1)
Outcome:       NO(0) | YES(1)
Side:          NO(0) | YES(1)
"""

from genlayer import *
from dataclasses import dataclass
import json
import typing


C_OPEN = 0
C_RESOLVED = 1
SIDE_NO = 0
SIDE_YES = 1


@allow_storage
@dataclass
class Claim:
    opener: Address
    statement: str
    source_url: str
    yes_pool: u256
    no_pool: u256
    status: u8
    outcome: u8
    rationale: str


@allow_storage
@dataclass
class Stake:
    claim_id: u256
    staker: Address
    side: u8
    amount: u256
    claimed: u8


class Beacon(gl.Contract):
    claims: DynArray[Claim]
    stakes: DynArray[Stake]

    def __init__(self) -> None:
        pass

    @gl.public.write
    def open_claim(self, statement: str, source_url: str) -> int:
        if len(statement.strip()) == 0:
            raise gl.vm.UserError("a claim statement is required")
        if len(source_url.strip()) == 0:
            raise gl.vm.UserError("a source URL is required")
        c = self.claims.append_new_get()
        c.opener = gl.message.sender_address
        c.statement = statement
        c.source_url = source_url
        c.yes_pool = u256(0)
        c.no_pool = u256(0)
        c.status = u8(C_OPEN)
        c.outcome = u8(SIDE_NO)
        c.rationale = ""
        return len(self.claims) - 1

    @gl.public.write.payable
    def stake(self, claim_id: int, side: int) -> None:
        c = self._get(claim_id)
        if c.status != C_OPEN:
            raise gl.vm.UserError("market is resolved")
        amount = gl.message.value
        if amount == u256(0):
            raise gl.vm.UserError("stake some GEN")
        if side != SIDE_YES and side != SIDE_NO:
            raise gl.vm.UserError("side must be YES or NO")
        s = self.stakes.append_new_get()
        s.claim_id = u256(claim_id)
        s.staker = gl.message.sender_address
        s.side = u8(side)
        s.amount = amount
        s.claimed = u8(0)
        if side == SIDE_YES:
            c.yes_pool = c.yes_pool + amount
        else:
            c.no_pool = c.no_pool + amount

    @gl.public.write
    def resolve(self, claim_id: int) -> None:
        """Read the source; validators agree whether the claim is true."""
        c = self._get(claim_id)
        if c.status != C_OPEN:
            raise gl.vm.UserError("market already resolved")

        statement = c.statement
        url = c.source_url

        def leader_fn() -> str:
            page = ""
            try:
                page = gl.nondet.web.get(url).body.decode("utf-8")[:6000]
            except Exception:
                page = "(source page unreachable)"
            prompt = (
                f"Claim to resolve: {statement}\n\n"
                f"Source page content:\n{page}\n\n"
                "Judge strictly on what the source shows. Is the claim TRUE? Reply "
                "with ONLY JSON: {\"true\": true} if the claim is true, "
                "{\"true\": false} if it is false, plus a short \"reason\"."
            )
            return gl.nondet.exec_prompt(prompt)

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            return self._decision_of(leader_res.calldata)[0] == self._decision_of(leader_fn())[0]

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        is_true, reason = self._decision_of(result)
        c.rationale = reason[:300]
        c.outcome = u8(SIDE_YES if is_true else SIDE_NO)
        c.status = u8(C_RESOLVED)

    @gl.public.write
    def claim_winnings(self, claim_id: int) -> None:
        c = self._get(claim_id)
        if c.status != C_RESOLVED:
            raise gl.vm.UserError("market is not resolved yet")
        win_pool = int(c.yes_pool) if int(c.outcome) == SIDE_YES else int(c.no_pool)
        lose_pool = int(c.no_pool) if int(c.outcome) == SIDE_YES else int(c.yes_pool)
        if win_pool == 0:
            raise gl.vm.UserError("no winning stakes to pay")
        sender = gl.message.sender_address
        owed = 0
        for i in range(len(self.stakes)):
            s = self.stakes[i]
            if int(s.claim_id) == claim_id and s.staker == sender and int(s.side) == int(c.outcome) and int(s.claimed) == 0:
                amt = int(s.amount)
                owed += amt + (amt * lose_pool) // win_pool
                s.claimed = u8(1)
        if owed <= 0:
            raise gl.vm.UserError("nothing to claim for you")
        self._pay(sender, u256(owed))

    # ------------------------------------------------------------------ views
    @gl.public.view
    def get_claim_count(self) -> int:
        return len(self.claims)

    @gl.public.view
    def get_claim(self, claim_id: int) -> dict:
        c = self._get(claim_id)
        return {
            "opener": c.opener.as_hex,
            "statement": c.statement,
            "source_url": c.source_url,
            "yes_pool": str(c.yes_pool),
            "no_pool": str(c.no_pool),
            "status": int(c.status),
            "outcome": int(c.outcome),
            "rationale": c.rationale,
        }

    @gl.public.view
    def get_stake_count(self) -> int:
        return len(self.stakes)

    @gl.public.view
    def get_stake(self, stake_id: int) -> dict:
        if stake_id < 0 or stake_id >= len(self.stakes):
            raise gl.vm.UserError("no such stake")
        s = self.stakes[stake_id]
        return {
            "claim_id": int(s.claim_id),
            "staker": s.staker.as_hex,
            "side": int(s.side),
            "amount": str(s.amount),
            "claimed": int(s.claimed),
        }

    # -------------------------------------------------------------- internals
    def _get(self, claim_id: int) -> Claim:
        if claim_id < 0 or claim_id >= len(self.claims):
            raise gl.vm.UserError("no such claim")
        return self.claims[claim_id]

    def _decision_of(self, result: typing.Any) -> tuple:
        data = result
        if isinstance(data, str):
            data = self._extract_json(data)
        if not isinstance(data, dict):
            return (False, "")
        raw = data.get("true", None)
        reason = str(data.get("reason", ""))
        if isinstance(raw, bool):
            return (raw, reason)
        if isinstance(raw, str):
            return (raw.strip().lower() == "true", reason)
        return (False, reason)

    def _extract_json(self, text: str) -> typing.Any:
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except (ValueError, TypeError):
                return None
        return None

    def _pay(self, recipient: Address, amount: u256) -> None:
        if amount == u256(0):
            return
        _Payee(recipient).emit_transfer(value=amount)


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass
