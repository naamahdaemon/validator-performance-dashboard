const MINASCAN="https://minascan.io/mainnet/account/";
const PAGE_SIZES=[20,50,100,200,500];
let savedPageSize=20;
try { const value=Number(localStorage.getItem("validator-page-size")); if(PAGE_SIZES.includes(value))savedPageSize=value; } catch (_) {}
const state={all:[],filtered:[],page:1,pageSize:savedPageSize,sortKey:"stake_live_estimate",sortDir:"desc"};
const $=id=>document.getElementById(id);
const COLUMN_COUNT = document.querySelectorAll("th[data-sort]").length;
function updateThemeSwitch() {
 const light = document.documentElement.dataset.theme === "light";
 $("themeToggle").setAttribute("aria-checked", String(light));
 $("themeToggle").textContent = light ? "☀ Light mode" : "☾ Dark mode";
}
$("themeToggle").onclick = () => {
 const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
 document.documentElement.dataset.theme = theme;
 try { localStorage.setItem("validator-theme", theme); } catch (_) {}
 updateThemeSwitch();
};
updateThemeSwitch();
$("pageSize").value=String(state.pageSize);
$("pageSize").addEventListener("change",()=>{
 const value=Number($("pageSize").value);
 if(!PAGE_SIZES.includes(value))return;
 state.pageSize=value;state.page=1;
 try {localStorage.setItem("validator-page-size",String(value));} catch (_) {}
 render();
});
const f={search:$("search"),era:$("era"),epoch:$("epoch"),dateAfter:$("dateAfter"),dateBefore:$("dateBefore"),stakeMin:$("stakeMin"),stakeMax:$("stakeMax"),delegatorsMin:$("delegatorsMin"),delegatorsMax:$("delegatorsMax"),blocksSinceMin:$("blocksSinceMin"),blocksSinceMax:$("blocksSinceMax")};
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const nullable=v=>(v===""||v==null)?null:num(v);
const fmt=(v,d=0)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:d}).format(num(v));
const parseDate=v=>{if(!v)return null;const d=new Date(String(v).replace(" ","T")+"Z");return isNaN(d)?null:d};
const boundary=(v,end=false)=>v?new Date(`${v}T${end?"23:59:59.999":"00:00:00"}Z`):null;

function populateEpochs(){
 const selected=f.epoch.value,era=f.era.value;
 const vals=[...new Set(state.all.filter(v=>!era||v.last_block_era===era).map(v=>v.last_block_epoch).filter(v=>v!=null).map(Number))].sort((a,b)=>b-a);
 f.epoch.innerHTML='<option value="">All</option>'+vals.map(v=>`<option value="${v}">${v}</option>`).join("");
 if([...f.epoch.options].some(o=>o.value===selected))f.epoch.value=selected;
}

function sortRows(){
 const factor=state.sortDir==="asc"?1:-1,k=state.sortKey;
 state.filtered.sort((a,b)=>{
  if(a[k]==null&&b[k]==null)return 0;
  if(a[k]==null)return 1;
  if(b[k]==null)return -1;
  if(k==="last_block_date")return factor*((parseDate(a[k])?.getTime()||0)-(parseDate(b[k])?.getTime()||0));
  if(typeof a[k]==="number"||typeof b[k]==="number")return factor*(num(a[k])-num(b[k]));
  return factor*String(a[k]??"").localeCompare(String(b[k]??""),undefined,{numeric:true,sensitivity:"base"});
 });
}

function apply(){
 const q=f.search.value.trim().toLowerCase(),after=boundary(f.dateAfter.value),before=boundary(f.dateBefore.value,true);
 const smin=nullable(f.stakeMin.value),smax=nullable(f.stakeMax.value),dmin=nullable(f.delegatorsMin.value),dmax=nullable(f.delegatorsMax.value),bmin=nullable(f.blocksSinceMin.value),bmax=nullable(f.blocksSinceMax.value);
 state.filtered=state.all.filter(v=>{
  if(q&&!`${v.validator_name??""} ${v.wallet_address??""}`.toLowerCase().includes(q))return false;
  if(f.era.value&&v.last_block_era!==f.era.value)return false;
  if(f.epoch.value!==""&&num(v.last_block_epoch)!==num(f.epoch.value))return false;
  const d=parseDate(v.last_block_date);if(after&&(!d||d<after))return false;if(before&&(!d||d>before))return false;
  const s=num(v.stake_live_estimate);if(smin!=null&&s<smin)return false;if(smax!=null&&s>smax)return false;
  const dg=num(v.delegator_count);if(dmin!=null&&dg<dmin)return false;if(dmax!=null&&dg>dmax)return false;
  const bs=num(v.blocks_since_last_produced);if(bmin!=null&&bs<bmin)return false;if(bmax!=null&&bs>bmax)return false;
  return true;
 });
 sortRows();state.page=1;render();
}
function cell(t,c=""){const x=document.createElement("td");x.textContent=t;if(c)x.className=c;return x}
function bar(v,max,d=0){if(v==null)return cell("—","num");const x=cell("", "bar-cell num"),b=document.createElement("div"),s=document.createElement("span");b.className="bar";b.style.width=`${max?Math.min(100,num(v)/max*100):0}%`;s.className="value";s.textContent=fmt(v,d);x.append(b,s);return x}
function percentCell(v){return cell(v==null?"—":`${fmt(v,2)}%`,"num")}
function blockDelta(v){const x=cell(v==null?"—":`${v>0?"+":""}${fmt(v)}`,"num");if(v>0)x.classList.add("delta-up");if(v<0)x.classList.add("delta-down");return x}
function delta(pct,mina){const x=cell(pct==null?"—":`${num(pct)>=0?"+":""}${fmt(pct,2)}%`,"num");if(pct!=null)x.classList.add(num(pct)>=0?"delta-up":"delta-down");x.title=mina==null?"Awaiting ledger export":`${fmt(mina,2)} MINA`;return x}

function render(){
 $("filteredCount").textContent=fmt(state.filtered.length);
 const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));state.page=Math.min(Math.max(1,state.page),pages);
 const rows=$("rows");rows.replaceChildren();
 if(!state.filtered.length){const tr=document.createElement("tr"),c=cell("No validators match the current filters.","empty-state");c.colSpan=COLUMN_COUNT;tr.append(c);rows.append(tr)}
 else{
  const slice=state.filtered.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
  const maxN=Math.max(...state.filtered.map(v=>num(v.stake_current_epoch)),0),maxN1=Math.max(...state.filtered.map(v=>num(v.stake_next_epoch)),0),maxLive=Math.max(...state.filtered.map(v=>num(v.stake_live_estimate)),0),maxD=Math.max(...state.filtered.map(v=>num(v.delegator_count)),0),maxB=Math.max(...state.filtered.map(v=>num(v.canonical_blocks_all_epochs)),0);
  for(const v of slice){
   const tr=document.createElement("tr"),vc=cell(v.validator_name||"—","validator");vc.title=v.validator_name||"";tr.append(vc);
   const wc=document.createElement("td"),a=document.createElement("a");a.className="wallet";a.href=MINASCAN+encodeURIComponent(v.wallet_address||"");a.target="_blank";a.rel="noopener noreferrer";a.textContent=v.wallet_address||"—";a.title=v.wallet_address||"";wc.append(a);tr.append(wc);
   tr.append(bar(v.stake_current_epoch,maxN,2),percentCell(v.stake_current_pct),percentCell(v.stake_active_pct),bar(v.stake_next_epoch,maxN1,2),bar(v.stake_live_estimate,maxLive,2));
   tr.append(delta(v.stake_next_delta_pct,v.stake_next_delta),delta(v.stake_live_delta_pct,v.stake_live_delta));
   tr.append(bar(v.delegator_count,maxD),bar(v.canonical_blocks_all_epochs,maxB));
   tr.append(cell(v.blocks_previous_epoch==null?"—":fmt(v.blocks_previous_epoch),"num"),cell(v.blocks_current_epoch==null?"—":fmt(v.blocks_current_epoch),"num"),blockDelta(v.blocks_epoch_delta));
   const stale=cell(fmt(v.blocks_since_last_produced),"num"),gap=num(v.blocks_since_last_produced);if(gap>=10000)stale.classList.add("stale-high");else if(gap>=1000)stale.classList.add("stale-mid");tr.append(stale);
   tr.append(cell(v.last_block_date||"—"));
   const ec=document.createElement("td"),badge=document.createElement("span");badge.className=`badge ${v.last_block_era||""}`;badge.textContent=v.last_block_era||"—";ec.append(badge);tr.append(ec,cell(v.last_block_epoch??"—","num"));rows.append(tr);
  }
 }
 $("pageLabel").textContent=`Page ${state.page} / ${pages}`;$("firstPage").disabled=$("prevPage").disabled=state.page<=1;$("nextPage").disabled=$("lastPage").disabled=state.page>=pages;
 document.querySelectorAll("th[data-sort]").forEach(th=>{th.removeAttribute("data-dir");if(th.dataset.sort===state.sortKey)th.dataset.dir=state.sortDir});
}
Object.values(f).forEach(el=>{["input","change"].forEach(ev=>el.addEventListener(ev,()=>{if(el===f.era)populateEpochs();apply()}))});
$("resetFilters").onclick=()=>{Object.values(f).forEach(el=>el.value="");populateEpochs();apply()};
document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sortKey===k)state.sortDir=state.sortDir==="asc"?"desc":"asc";else{state.sortKey=k;state.sortDir=["validator_name","wallet_address","last_block_era"].includes(k)?"asc":"desc"}sortRows();state.page=1;render()});
$("firstPage").onclick=()=>{state.page=1;render()};$("prevPage").onclick=()=>{state.page--;render()};$("nextPage").onclick=()=>{state.page++;render()};$("lastPage").onclick=()=>{state.page=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));render()};

fetch(`./data/validators.json?t=${Date.now()}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(p=>{
 state.all=Array.isArray(p.validators)?p.validators.map(v=>({...v,stake_live_estimate:v.stake_live_estimate??v.current_stake})):[];$("validatorCount").textContent=fmt(p.validator_count??state.all.length);$("archiveHeight").textContent=p.archive_height==null?"—":fmt(p.archive_height);
 // Older snapshots counted every status. Do not label those metrics as canonical.
 if(p.ledger_meta?.block_count_basis!=="canonical"){
  state.all=state.all.map(v=>({...v,blocks_previous_epoch:null,blocks_current_epoch:null,blocks_epoch_delta:null,stake_active_pct:null}));
  $("epochSummary").textContent="Canonical epoch counts and active stake await the next export.";
 }
 const epochRow=state.all.find(v=>v.network_epoch_label&&v.previous_epoch_label);
 if(epochRow && p.ledger_meta?.block_count_basis==="canonical"){
  $("previousBlocksHeader").textContent=`Blocks ${epochRow.previous_epoch_label}`;
  $("currentBlocksHeader").textContent=`Blocks ${epochRow.network_epoch_label} (partial)`;
  $("epochSummary").textContent=`Previous: ${epochRow.previous_epoch_label} · Current: ${epochRow.network_epoch_label} (in progress)`;
 }
 $("generatedAt").textContent=p.generated_at?new Date(p.generated_at).toLocaleString():"No snapshot yet";populateEpochs();apply();
}).catch(e=>{console.error(e);$("generatedAt").textContent="Load error";$("rows").innerHTML=`<tr><td colspan="${COLUMN_COUNT}" class="empty-state">Unable to load data.</td></tr>`});
