import { makeReader, write, connectWallet, activeAccount, balanceOf, short, toGen, GEN, fmtErr }
  from "./shared/genlayer-lite.js";
import { mountReviewDesk } from "./shared/review-desk.js";

const CONTRACT = "0x770Db6D01D1fC69d045ecB208DA669b977c3ee5E";
const { read } = makeReader(CONTRACT);
const C_OPEN = 0, C_RESOLVED = 1, SIDE_NO = 0, SIDE_YES = 1;
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
    const out = await Promise.all(Array.from({ length: count }, (_, i) => read("get_claim", [i]).then((record) => ({ id: i, ...record }))));
    claims = out; renderTicker(); renderList();
    $("mCount").textContent = count + (count === 1 ? " market" : " markets");
    $("stOpen").textContent = out.filter((c) => Number(c.status) === C_OPEN).length;
    $("stStaked").textContent = toGen(out.reduce((a, c) => a + BigInt(c.yes_pool) + BigInt(c.no_pool), 0n).toString());
    $("stResolved").textContent = out.filter((c) => Number(c.status) === C_RESOLVED).length;
  } catch (e) { $("marketList").innerHTML = `<div class="m-empty">Could not reach the chain. ${fmtErr(e)}</div>`; }
}

function renderTicker() {
  const el = $("ticker"); if (!el) return;
  if (!claims.length) { el.innerHTML = `<span class="tk dim">no markets yet - open the first</span>`; return; }
  const items = claims.map((c) => { const st = Number(c.status), p = yesPct(c);
    const tag = st === C_RESOLVED ? (Number(c.outcome) === SIDE_YES ? `<span class="y">TRUE</span>` : `<span class="n">FALSE</span>`) : `${p}% YES`;
    return `<span class="tk">${esc(c.statement.slice(0, 46))} <b>${tag}</b></span>`; }).join("");
  el.innerHTML = items + items;
}

function renderList() {
  const el = $("marketList");
  if (!claims.length) { el.innerHTML = `<div class="m-empty">No markets yet. Click "New market".</div>`; return; }
  el.innerHTML = "";
  [...claims].reverse().forEach((c) => {
    const st = Number(c.status), out = Number(c.outcome), p = yesPct(c);
    const open = c.id === selected;
    const tag = st === C_OPEN ? `<span class="mkt-tag mt-open">OPEN</span>`
      : `<span class="mkt-tag ${out === SIDE_YES ? "mt-yes" : "mt-no"}">${out === SIDE_YES ? "TRUE" : "FALSE"}</span>`;
    let detail = "";
    if (open) {
      const verdict = st === C_RESOLVED ? `<div class="db-verdict ${out === SIDE_YES ? "vb-yes" : "vb-no"}">${c.rationale ? esc(c.rationale) : "The validator set has ruled."}</div>` : "";
      const action = st === C_OPEN
        ? `<div class="trade"><div class="trade-h">Take a side</div><div class="trade-in"><input id="stakeAmt" type="number" min="0" step="0.5" value="1" placeholder="GEN" /></div><div class="trade-btns"><button class="btn yes" id="yesBtn">Stake YES</button><button class="btn no" id="noBtn">Stake NO</button></div><div class="resolve-row"><span class="hint">The source decides the truth.</span><button class="btn line sm" id="resolveBtn"><i class="ph-bold ph-scales"></i> Resolve</button></div></div>`
        : `<div class="trade"><div class="trade-h">Settlement</div><button class="btn primary block" id="claimBtn"><i class="ph-bold ph-hand-coins"></i> Claim winnings</button></div>`;
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
    if (open && st === C_OPEN) { $("yesBtn").onclick = () => doStake(c.id, SIDE_YES); $("noBtn").onclick = () => doStake(c.id, SIDE_NO); $("resolveBtn").onclick = () => doResolve(c.id); }
    else if (open) { $("claimBtn").onclick = () => doClaim(c.id); }
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
async function doResolve(id) {
  if (!confirm("Resolve now? Validators read the source and rule true or false. Calls a real LLM.")) return;
  const btn = $("resolveBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> reading';
  try { await ensureWallet(); toast("Validators reading the source\u2026", "", "resolve"); await write(CONTRACT, "resolve", [id]); toast("Market resolved.", "ok"); await load(); }
  catch (e) { toast(fmtErr(e), "err"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-scales"></i> Resolve'; } }
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
