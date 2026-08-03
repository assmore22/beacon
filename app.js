import { makeReader, write, connectWallet, activeAccount, balanceOf, short, toGen, GEN, fmtErr }
  from "./shared/genlayer-lite.js";
import { mountReviewDesk } from "./shared/review-desk.js";

const CONTRACT = "0x770Db6D01D1fC69d045ecB208DA669b977c3ee5E";
const { read } = makeReader(CONTRACT);
const C_OPEN = 0, C_RESOLVED = 1, SIDE_NO = 0, SIDE_YES = 1;
const REVIEWABLE = new Set(["OPEN", "ACTIVE", "CLAIMED", "REVIEWING"]);
const MATURITY_PENDING = new Set(["REVIEWED", "CHALLENGE_WINDOW", "APPEALED"]);
const CLOSED = new Set(["RESOLVED", "ARCHIVED"]);
let account = null, claims = [], selected = null;
const $ = (id) => document.getElementById(id);

queueMicrotask(() => mountReviewDesk({
  contract: CONTRACT, read, write, ensureWallet, fmtErr,
  entity: "Market claim", countMethod: "get_claim_count", recordMethod: "get_claim_record",
  openWindowMethod: "open_challenge_window", submitChallengeMethod: "submit_challenge", resolveChallengeMethod: "resolve_challenge_with_genlayer",
  submitAppealMethod: "submit_appeal", resolveAppealMethod: "resolve_appeal_with_genlayer", archiveMethod: "archive_claim",
  variant: "terminal", kicker: "Adversarial market review", title: "Beacon challenge board",
  intro: "Compare the resolved claim with fresh public evidence and settle any objection before winnings and archival become the final market history.",
}));
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return u; } };

$("contractLink").textContent = "Contract " + short(CONTRACT) + " \u2197";

function toast(msg, kind = "", title = "beacon") {
  const el = document.createElement("div"); el.className = "toast " + kind;
  el.innerHTML = `<span class="tt">${title}</span>`; el.appendChild(document.createTextNode(msg));
  $("log").appendChild(el); setTimeout(() => el.remove(), kind === "err" ? 15000 : 5000);
}

async function refreshWallet() {
  account = await activeAccount();
  const slot = $("walletslot");
  if (account) { let bal = 0n; try { bal = await balanceOf(account); } catch (_) {} slot.innerHTML = `<span class="mono" style="font-size:12.5px;color:var(--txt2)">${short(account)} \u00b7 ${toGen(bal)} GEN</span>`; }
  else { slot.innerHTML = `<button class="btn ghost sm" id="connectBtn">Connect</button>`; $("connectBtn").onclick = doConnect; }
}
async function doConnect() { try { account = await connectWallet(); toast("Connected on studionet.", "ok"); await refreshWallet(); } catch (e) { toast(fmtErr(e), "err"); } }
async function ensureWallet() { if (!account) account = await connectWallet(); await refreshWallet(); }

const yesPct = (c) => { const y = Number(toGen(c.yes_pool)), n = Number(toGen(c.no_pool)), t = y + n; return t > 0 ? Math.round(y / t * 100) : 50; };

async function load() {
  try {
    const count = Number(await read("get_claim_count"));
    const out = await Promise.all(Array.from({ length: count }, async (_, i) => {
      const [market, canonical] = await Promise.all([
        read("get_claim", [i]),
        read("get_claim_record", [String(i)]).catch(() => null),
      ]);
      const workflowStatus = String(canonical?.status || (Number(market.status) === C_RESOLVED ? "RESOLVED" : "OPEN")).toUpperCase();
      return {
        id: i,
        ...market,
        workflowStatus,
        challengeDeadline: Number(canonical?.challengeDeadline || 0),
        appealDeadline: Number(canonical?.appealDeadline || 0),
        reviewOutcome: canonical?.outcome || "pending",
        confidenceBps: Number(canonical?.confidenceBps || 0),
      };
    }));
    claims = out; renderTicker(); renderList();
    $("mCount").textContent = count + (count === 1 ? " market" : " markets");
    $("stOpen").textContent = out.filter((c) => !CLOSED.has(c.workflowStatus)).length;
    $("stStaked").textContent = toGen(out.reduce((a, c) => a + BigInt(c.yes_pool) + BigInt(c.no_pool), 0n).toString());
    $("stResolved").textContent = out.filter((c) => CLOSED.has(c.workflowStatus)).length;
  } catch (e) { $("marketList").innerHTML = `<div class="m-empty">Could not reach the chain. ${fmtErr(e)}</div>`; }
}

function renderTicker() {
  const el = $("ticker"); if (!el) return;
  if (!claims.length) { el.innerHTML = `<span class="tk dim">no markets yet - open the first</span>`; return; }
  const items = claims.map((c) => { const st = c.workflowStatus, p = yesPct(c);
    const tag = CLOSED.has(st) ? (Number(c.outcome) === SIDE_YES ? `<span class="y">TRUE</span>` : `<span class="n">FALSE</span>`) : `${st} · ${p}% YES`;
    return `<span class="tk">${esc(c.statement.slice(0, 46))} <b>${tag}</b></span>`; }).join("");
  el.innerHTML = items + items;
}

function maturityFor(c) {
  return Math.max(Number(c.challengeDeadline || 0), Number(c.appealDeadline || 0));
}

function maturityLabel(deadline) {
  if (!deadline) return "Waiting for a review deadline";
  const remaining = deadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "Challenge period complete";
  const minutes = Math.ceil(remaining / 60);
  return `Challenge period: ${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
}

function renderList() {
  const el = $("marketList");
  if (!claims.length) { el.innerHTML = `<div class="m-empty">No markets yet. Click "New market".</div>`; return; }
  el.innerHTML = "";
  [...claims].reverse().forEach((c) => {
    const st = c.workflowStatus, out = Number(c.outcome), p = yesPct(c);
    const isClosed = CLOSED.has(st);
    const open = c.id === selected;
    const tag = isClosed
      ? `<span class="mkt-tag ${out === SIDE_YES ? "mt-yes" : "mt-no"}">${out === SIDE_YES ? "TRUE" : "FALSE"}</span>`
      : `<span class="mkt-tag mt-open">${esc(st.replaceAll("_", " "))}</span>`;
    let detail = "";
    if (open) {
      const verdict = isClosed ? `<div class="db-verdict ${out === SIDE_YES ? "vb-yes" : "vb-no"}">${c.rationale ? esc(c.rationale) : "The validator set has ruled."}</div>` : "";
      const deadline = maturityFor(c);
      const mature = deadline > 0 && Math.floor(Date.now() / 1000) >= deadline;
      let action = "";
      if (REVIEWABLE.has(st)) {
        action = `<div class="trade">
          <div class="trade-h">Market participation</div>
          ${st === "OPEN" ? `<div class="trade-in"><input id="stakeAmt" type="number" min="0" step="0.5" value="1" placeholder="GEN" /></div><div class="trade-btns"><button class="btn yes" id="yesBtn">Stake YES</button><button class="btn no" id="noBtn">Stake NO</button></div>` : ""}
          <div class="flow-step"><span><b>Next</b> Validators inspect the cited source and publish the provisional outcome.</span><button class="btn line" id="reviewBtn"><i class="ph-bold ph-magnifying-glass"></i> ${st === "REVIEWING" ? "Continue review" : "Review with GenLayer"}</button></div>
        </div>`;
      } else if (MATURITY_PENDING.has(st)) {
        action = `<div class="trade">
          <div class="trade-h">Settlement checkpoint</div>
          <div class="maturity-row"><span class="maturity-dot ${mature ? "ready" : ""}"></span><div><b>${maturityLabel(deadline)}</b><small>Challenges and appeals must be resolved before settlement.</small></div></div>
          <div class="finalize-actions"><a class="btn ghost" href="#review-desk"><i class="ph-bold ph-shield-warning"></i> Challenge desk</a><button class="btn primary" id="finalizeBtn" ${mature ? "" : "disabled"}><i class="ph-bold ph-seal-check"></i> Finalize market</button></div>
        </div>`;
      } else if (isClosed) {
        action = `<div class="trade"><div class="trade-h">Settlement</div><div class="flow-complete"><i class="ph-bold ph-check-circle"></i><span>Validator review and the challenge period are complete.</span></div><button class="btn primary block" id="claimBtn"><i class="ph-bold ph-hand-coins"></i> Claim winnings</button></div>`;
      }
      detail = `<div class="market-detail">
        <a class="db-src" href="${esc(c.source_url)}" target="_blank" rel="noopener"><i class="ph-bold ph-link-simple"></i> ${esc(hostOf(c.source_url))} \u2197</a>
        ${verdict}
        <div class="meter-bar"><div class="meter-y" style="width:${p}%"><span class="meter-pct">${p}%</span><span class="meter-lbl">YES</span></div><div class="meter-n"><span class="meter-pct">${100 - p}%</span><span class="meter-lbl">NO</span></div></div>
        <div class="meter-foot"><span>YES pool ${toGen(c.yes_pool)} GEN</span><span>NO pool ${toGen(c.no_pool)} GEN</span></div>
        ${action}</div>`;
    }
    const card = document.createElement("div"); card.className = "market" + (open ? " open" : "");
    card.innerHTML = `<div class="market-top"><span class="market-stmt">${esc(c.statement)}</span>${tag}</div>
      <div class="split"><div class="split-y" style="width:${p}%"></div></div>
      <div class="market-foot"><span>${p}% YES \u00b7 ${100 - p}% NO</span><span>${toGen((BigInt(c.yes_pool) + BigInt(c.no_pool)).toString())} GEN pool \u00b7 ${esc(hostOf(c.source_url))}</span></div>
      ${detail}`;
    card.querySelector(".market-top").onclick = () => { selected = open ? null : c.id; renderList(); };
    el.appendChild(card);
    if (open && st === "OPEN") { $("yesBtn").onclick = () => doStake(c.id, SIDE_YES); $("noBtn").onclick = () => doStake(c.id, SIDE_NO); }
    if (open && REVIEWABLE.has(st)) $("reviewBtn").onclick = () => doReview(c.id);
    if (open && MATURITY_PENDING.has(st) && $("finalizeBtn")) $("finalizeBtn").onclick = () => doFinalize(c.id);
    if (open && isClosed) $("claimBtn").onclick = () => doClaim(c.id);
  });
}

function openDrawer() { $("scrim").classList.add("on"); $("drawer").classList.add("on"); }
function closeDrawer() { $("scrim").classList.remove("on"); $("drawer").classList.remove("on"); }
function openNew() {
  $("drawerTitle").textContent = "New market";
  $("drawerBody").innerHTML = `
    <p>State a claim that can be checked against a public page, and cite the source.</p>
    <label>Claim</label><textarea id="nStmt" placeholder="The S&P 500 closed above 6000 on the cited date."></textarea>
    <label>Source URL</label><input id="nUrl" placeholder="https://..." />
    <button class="btn primary block" id="createBtn"><i class="ph-bold ph-lighthouse"></i> Open market</button>`;
  $("createBtn").onclick = doCreate; openDrawer();
}

async function doCreate() {
  const stmt = $("nStmt").value.trim(), url = $("nUrl").value.trim();
  if (!stmt) return toast("State the claim.", "err");
  if (!url) return toast("Cite a source URL.", "err");
  const btn = $("createBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> opening';
  try { await ensureWallet(); await write(CONTRACT, "open_claim", [stmt, url]); toast("Market opened.", "ok"); closeDrawer(); await load(); }
  catch (e) { toast(fmtErr(e), "err"); btn.disabled = false; btn.innerHTML = "Open market"; }
}
async function doStake(id, side) {
  const amount = parseFloat($("stakeAmt").value);
  if (!(amount > 0)) return toast("Stake must be above zero.", "err");
  const btn = side === SIDE_YES ? $("yesBtn") : $("noBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { await ensureWallet(); await write(CONTRACT, "stake", [id, side], GEN(amount)); toast("Stake placed.", "ok"); await load(); }
  catch (e) { toast(fmtErr(e), "err"); btn.disabled = false; btn.textContent = side === SIDE_YES ? "Stake YES" : "Stake NO"; }
}
async function doReview(id) {
  if (!confirm("Start validator review? GenLayer will read the cited source and publish a provisional outcome.")) return;
  const btn = $("reviewBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> validators reading';
  try {
    await ensureWallet();
    toast("Validators are checking the cited source.", "", "review");
    await write(CONTRACT, "review_claim_with_genlayer", [String(id)]);
    toast("Provisional outcome published. The challenge period is now open.", "ok", "review");
    await load();
  } catch (e) {
    toast(fmtErr(e), "err");
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-magnifying-glass"></i> Review with GenLayer'; }
  }
}
async function doFinalize(id) {
  if (!confirm("Finalize this market after its challenge period? Open filings will block settlement.")) return;
  const btn = $("finalizeBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> finalizing';
  try {
    await ensureWallet();
    await write(CONTRACT, "settle", [id]);
    toast("Market finalized onchain. Winning stakes can now be claimed.", "ok", "settlement");
    await load();
  } catch (e) {
    toast(fmtErr(e), "err");
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-seal-check"></i> Finalize market'; }
  }
}
async function doClaim(id) {
  const btn = $("claimBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> claiming';
  try { await ensureWallet(); await write(CONTRACT, "claim_winnings", [id]); toast("Winnings claimed.", "ok"); await load(); }
  catch (e) { toast(fmtErr(e), "err"); btn.disabled = false; btn.textContent = "Claim winnings"; }
}

$("navPostBtn").onclick = openNew;
$("closeDrawer").onclick = closeDrawer;
$("scrim").onclick = closeDrawer;
const _cb = $("connectBtn"); if (_cb) _cb.onclick = doConnect;
if (window.ethereum) window.ethereum.on?.("accountsChanged", refreshWallet);

refreshWallet();
load();
