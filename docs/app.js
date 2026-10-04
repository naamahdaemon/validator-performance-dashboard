const MINASCAN="https://minascan.io/mainnet/account/";
const PAGE_SIZES=[20,30,50,100,200,500];
let savedPageSize=20;
try { const value=Number(localStorage.getItem("validator-page-size")); if(PAGE_SIZES.includes(value))savedPageSize=value; } catch (_) {}
const state={all:[],filtered:[],page:1,pageSize:savedPageSize,sortKey:"stake_live_estimate",sortDir:"desc"};
const $=id=>document.getElementById(id);
let filtersOpen=false;
try{filtersOpen=localStorage.getItem("validator-filters-open")==="true";}catch(_){}
function updateFiltersPanel(){
 $("filtersPanel").classList.toggle("mobile-open",filtersOpen);
 $("filtersToggle").setAttribute("aria-expanded",String(filtersOpen));
}
$("filtersToggle").onclick=()=>{filtersOpen=!filtersOpen;updateFiltersPanel();try{localStorage.setItem("validator-filters-open",String(filtersOpen));}catch(_){}};
updateFiltersPanel();
const informationPanel=$("informationPanel");
try{informationPanel.open=localStorage.getItem("validator-information-open")==="true";}catch(_){}
informationPanel.addEventListener("toggle",()=>{
 try{localStorage.setItem("validator-information-open",String(informationPanel.open));}catch(_){}
});
$("copyrightYear").textContent=String(new Date().getFullYear());
const COLUMN_HEADERS=[...document.querySelectorAll("th[data-sort]")];
const COLUMN_KEYS=COLUMN_HEADERS.map(th=>th.dataset.sort);
const COLUMN_COUNT=COLUMN_KEYS.length;
const hiddenColumns=new Set();
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
f.hideAnonymous=$("hideAnonymous");
f.simulationStake=$("simulationStake");
const COMMISSION_STORAGE_KEY="validator-commissions-v1";
let commissionOverrides={},simulationSources={};
try{commissionOverrides=ValidatorSimulation.parseOverrides(localStorage.getItem(COMMISSION_STORAGE_KEY));}catch(_){}
function saveCommissions(){try{localStorage.setItem(COMMISSION_STORAGE_KEY,JSON.stringify(commissionOverrides));}catch(_){}}
function refreshSimulation(){
 if(Number(f.simulationStake.value)>ValidatorSimulation.MAX_SIMULATED_STAKE)f.simulationStake.value=String(ValidatorSimulation.MAX_SIMULATED_STAKE);
 const amount=f.simulationStake.value!==""&&f.simulationStake.validity.valid?Number(f.simulationStake.value):null;
 for(const row of state.all)Object.assign(row,ValidatorSimulation.calculate({...row,commission_pct:row.source_commission_pct},amount,simulationSources,commissionOverrides));
}
const VIEW_STORAGE_KEY="validator-view-v1";
let dataLoaded=false;
function saveView(){
 if(!dataLoaded)return;
 try {
  localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify({
   filters:Object.fromEntries(Object.entries(f).map(([key,el])=>[key,el.type==="checkbox"?el.checked:el.value])),
   sortKey:state.sortKey,sortDir:state.sortDir,page:state.page,
   hiddenColumns:[...hiddenColumns],
  }));
 } catch (_) {}
}
function restoreView(){
 try {
  const saved=JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY));
  if(!saved||typeof saved!=="object"||Array.isArray(saved))return;
  const sortKeys=[...document.querySelectorAll("th[data-sort]")].map(th=>th.dataset.sort);
  if(sortKeys.includes(saved.sortKey))state.sortKey=saved.sortKey;
  if(["asc","desc"].includes(saved.sortDir))state.sortDir=saved.sortDir;
  if(Number.isSafeInteger(saved.page)&&saved.page>0)state.page=saved.page;
  if(Array.isArray(saved.hiddenColumns)){
   for(const key of saved.hiddenColumns)if(COLUMN_KEYS.includes(key))hiddenColumns.add(key);
   if(hiddenColumns.size===COLUMN_COUNT)hiddenColumns.delete("validator_name");
  }
  for(const [key,el] of Object.entries(f)){
   const value=saved.filters?.[key];
   if(el.type==="checkbox"){el.checked=value===true;continue;}
   if(typeof value!=="string")continue;
   if(key==="epoch"){
    if(!/^-?\d+$/.test(value))continue;
    const option=document.createElement("option");option.value=value;option.textContent=value;el.append(option);
   }
   el.value=value;
  }
 } catch (_) {}
}
restoreView();
function updateColumnVisibility(){
 const count=COLUMN_COUNT-hiddenColumns.size;
 COLUMN_HEADERS.forEach((th,i)=>{
  const hidden=hiddenColumns.has(COLUMN_KEYS[i]);th.hidden=hidden;
  for(const row of [...$("rows").rows,...$("totals").rows]){
   if(row.cells.length===COLUMN_COUNT)row.cells[i].hidden=hidden;
   else if(row.cells.length===1)row.cells[0].colSpan=count;
  }
 });
 $("columnCount").textContent=`(${count}/${COLUMN_COUNT})`;
 for(const input of $("columnOptions").querySelectorAll("input")){
  input.checked=!hiddenColumns.has(input.value);
  input.disabled=count===1&&input.checked;
 }
}
for(const th of COLUMN_HEADERS){
 const label=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");
 input.type="checkbox";input.value=th.dataset.sort;input.checked=!hiddenColumns.has(input.value);
 text.textContent=th.textContent;
 input.addEventListener("change",()=>{
  if(input.checked)hiddenColumns.delete(input.value);
  else if(hiddenColumns.size<COLUMN_COUNT-1)hiddenColumns.add(input.value);
  if(dataLoaded)renderTotals();updateColumnVisibility();saveView();
 });
 label.append(input,text);$("columnOptions").append(label);
}
$("showAllColumns").onclick=()=>{hiddenColumns.clear();if(dataLoaded)renderTotals();updateColumnVisibility();saveView()};
document.addEventListener("click",event=>{if(!$("columnPicker").contains(event.target))$("columnPicker").open=false});
$("columnPicker").addEventListener("keydown",event=>{if(event.key==="Escape"){$("columnPicker").open=false;$("columnPicker").querySelector("summary").focus()}});
updateColumnVisibility();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const nullable=v=>(v===""||v==null)?null:num(v);
const fmt=(v,d=0)=>new Intl.NumberFormat(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}).format(num(v));
const parseDate=v=>{if(!v)return null;const d=new Date(String(v).replace(" ","T")+"Z");return isNaN(d)?null:d};
const boundary=(v,end=false)=>v?new Date(`${v}T${end?"23:59:59.999":"00:00:00"}Z`):null;

function populateEpochs(keepSelected=false){
 const selected=f.epoch.value,era=f.era.value;
 const vals=[...new Set(state.all.filter(v=>!era||v.last_block_era===era).map(v=>v.last_block_epoch).filter(v=>v!=null).map(Number))].sort((a,b)=>b-a);
 // Preserve a saved epoch even if a newer snapshot has no matching validators.
 if(keepSelected&&selected!==""&&!vals.includes(Number(selected)))vals.push(Number(selected));
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

function apply({resetPage=true}={}){
 refreshSimulation();
 const q=f.search.value.trim().toLowerCase(),after=boundary(f.dateAfter.value),before=boundary(f.dateBefore.value,true);
 const smin=nullable(f.stakeMin.value),smax=nullable(f.stakeMax.value),dmin=nullable(f.delegatorsMin.value),dmax=nullable(f.delegatorsMax.value),bmin=nullable(f.blocksSinceMin.value),bmax=nullable(f.blocksSinceMax.value);
 state.filtered=state.all.filter(v=>{
  if(f.hideAnonymous.checked&&!String(v.validator_name??"").trim())return false;
  if(q&&!`${v.validator_name??""} ${v.wallet_address??""}`.toLowerCase().includes(q))return false;
  if(f.era.value&&v.last_block_era!==f.era.value)return false;
  if(f.epoch.value!==""&&num(v.last_block_epoch)!==num(f.epoch.value))return false;
  const d=parseDate(v.last_block_date);if(after&&(!d||d<after))return false;if(before&&(!d||d>before))return false;
  const s=num(v.stake_live_estimate);if(smin!=null&&s<smin)return false;if(smax!=null&&s>smax)return false;
  const dg=num(v.delegator_count);if(dmin!=null&&dg<dmin)return false;if(dmax!=null&&dg>dmax)return false;
  const bs=num(v.blocks_since_last_produced);if(bmin!=null&&bs<bmin)return false;if(bmax!=null&&bs>bmax)return false;
  return true;
 });
 sortRows();if(resetPage)state.page=1;render();
}
function cell(t,c=""){const x=document.createElement("td");x.textContent=t;if(c)x.className=c;return x}
function bar(v,max,d=0){if(v==null)return cell("—","num");const x=cell("", "bar-cell num"),b=document.createElement("div"),s=document.createElement("span");b.className="bar";b.style.width=`${max?Math.min(100,num(v)/max*100):0}%`;s.className="value";s.textContent=fmt(v,d);x.append(b,s);return x}
function percentCell(v){return cell(v==null?"—":`${fmt(v,2)}%`,"num")}
function blockDelta(v){const x=cell(v==null?"—":`${v>0?"+":""}${fmt(v)}`,"num");if(v>0)x.classList.add("delta-up");if(v<0)x.classList.add("delta-down");return x}
function delta(pct,mina){const x=cell(pct==null?"—":`${num(pct)>=0?"+":""}${fmt(pct,2)}%`,"num");if(pct!=null)x.classList.add(num(pct)>=0?"delta-up":"delta-down");x.title=mina==null?"Awaiting ledger export":`${fmt(mina,2)} MINA`;return x}
function commissionCell(v){
 const c=cell("","num"),input=document.createElement("input");
 input.type="number";input.min="0";input.max="100";input.step="0.01";input.placeholder="Unknown";
 input.className="commission-input"+(v.commission_local?" local-override":"");
 input.value=v.commission_pct==null?"":v.commission_pct.toFixed(2);
 input.setAttribute("aria-label",`Commission (%) for ${v.validator_name||v.wallet_address}`);
 input.title=`${v.commission_local?"Local override. ":""}Source: ${v.commission_source_pct==null?"unknown":fmt(v.commission_source_pct,2)+"%"}. Clear to restore source.`;
 input.addEventListener("change",()=>{
  if(!input.validity.valid){input.reportValidity();return;}
  if(input.value==="")delete commissionOverrides[v.wallet_address];
  else commissionOverrides[v.wallet_address]=Number(input.value);
  saveCommissions();apply({resetPage:false});
 });
 c.append(input);return c;
}
function simulationCell(v,key,max){
 const current=key.startsWith("simulation_current_");
 const c=bar(v[key],max,2);
 if(v[key]!=null){
  c.classList.add("simulation-result");
  if(key.endsWith("_net"))c.classList.add("simulation-net");
  if(!current&&v.simulation_approximate)c.querySelector(".value").prepend("≈ ");
 }
 c.title=`Epoch ${v.previous_epoch_label||"unknown"}; ${v.simulation_approximate?"approximation using current stake":"historical stake"}: ${v.simulation_stake==null?"unknown":fmt(v.simulation_stake,2)} MINA. Source/current or local commission, not historical. Excludes transaction fees and additional blocks.`;
 if(current)c.title=`Epoch ${v.network_epoch_label||"unknown"} so far, in MINA. Confirmed + provisional archive-selected branch blocks; may be reorganized. Uses Stake N + added stake, excludes transaction fees and additional blocks.`;
 return c;
}
function renderTotals(){
 const t=ValidatorTotals.calculate(state.filtered),tr=document.createElement("tr");
 for(const key of COLUMN_KEYS){
  let c;
  if(key==="validator_name"){
   c=cell("Total ");const count=document.createElement("span");
   count.className="numeric-text";count.textContent=`(${fmt(state.filtered.length)})`;c.append(count);
  }
  else if(key==="wallet_address")c=cell(hiddenColumns.has("validator_name")?"Total":"—");
  else if(key==="stake_next_delta_pct")c=delta(t[key],t.stake_next_delta);
  else if(key==="stake_live_delta_pct")c=delta(t[key],t.stake_live_delta);
  else if(key==="stake_current_live_delta_pct")c=delta(t[key],t.stake_current_live_delta);
  else if(key.startsWith("simulation_")||key==="commission_pct"){c=cell("—","num");c.title="Alternative placements of the same stake; not additive";}
  else if(key==="stake_current_pct"||key==="stake_active_pct")c=percentCell(t[key]);
  else if(key==="blocks_epoch_delta")c=blockDelta(t[key]);
  else if(Object.hasOwn(t,key))c=cell(t[key]==null?"—":fmt(t[key],key.startsWith("stake_")||key.startsWith("expected_")?2:0),"num");
  else c=cell("—");
  c.title=c.title||"Total for all matching validators, across all pages";
  tr.append(c);
 }
 $("totals").replaceChildren(tr);
}

function render(){
 $("filteredCount").textContent=fmt(state.filtered.length);
 const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));state.page=Math.min(Math.max(1,state.page),pages);
 const rows=$("rows");rows.replaceChildren();
 if(!state.filtered.length){const tr=document.createElement("tr"),c=cell("No validators match the current filters.","empty-state");c.colSpan=COLUMN_COUNT;tr.append(c);rows.append(tr)}
 else{
  const slice=state.filtered.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
  const simulationMax=Object.fromEntries(["simulation_gross","simulation_net","simulation_current_gross","simulation_current_net"].map(key=>[key,Math.max(0,...state.filtered.map(v=>num(v[key])))]));
  const maxN=Math.max(...state.filtered.map(v=>num(v.stake_current_epoch)),0),maxN1=Math.max(...state.filtered.map(v=>num(v.stake_next_epoch)),0),maxLive=Math.max(...state.filtered.map(v=>num(v.stake_live_estimate)),0),maxD=Math.max(...state.filtered.map(v=>num(v.delegator_count)),0),maxB=Math.max(...state.filtered.map(v=>num(v.canonical_blocks_all_epochs)),0);
  for(const v of slice){
   const tr=document.createElement("tr"),vc=cell(v.validator_name||"—","validator");vc.title=v.validator_name||"";tr.append(vc);
   const wc=document.createElement("td"),a=document.createElement("a");a.className="wallet";a.href=MINASCAN+encodeURIComponent(v.wallet_address||"");a.target="_blank";a.rel="noopener noreferrer";a.textContent=v.wallet_address||"—";a.title=v.wallet_address||"";wc.append(a);tr.append(wc);
   tr.append(bar(v.stake_current_epoch,maxN,2),percentCell(v.stake_current_pct),percentCell(v.stake_active_pct),bar(v.stake_next_epoch,maxN1,2),bar(v.stake_live_estimate,maxLive,2));
   tr.append(delta(v.stake_next_delta_pct,v.stake_next_delta),delta(v.stake_live_delta_pct,v.stake_live_delta));
   tr.append(delta(v.stake_current_live_delta_pct,v.stake_current_live_delta),commissionCell(v),simulationCell(v,"simulation_gross",simulationMax.simulation_gross),simulationCell(v,"simulation_net",simulationMax.simulation_net));
   tr.append(simulationCell(v,"simulation_current_gross",simulationMax.simulation_current_gross),simulationCell(v,"simulation_current_net",simulationMax.simulation_current_net));
   tr.append(bar(v.delegator_count,maxD),bar(v.canonical_blocks_all_epochs,maxB));
   tr.append(cell(v.blocks_previous_epoch==null?"—":fmt(v.blocks_previous_epoch),"num"),cell(v.blocks_current_epoch==null?"—":fmt(v.blocks_current_epoch),"num"));
   tr.append(cell(v.blocks_current_epoch_inclusive==null?"—":fmt(v.blocks_current_epoch_inclusive),"num"));
   for(const key of ["expected_blocks_epoch","expected_coinbase_epoch"])tr.append(cell(v[key]==null?"—":fmt(v[key],2),"num"));
   tr.append(blockDelta(v.blocks_epoch_delta));
   const stale=cell(fmt(v.blocks_since_last_produced),"num"),gap=num(v.blocks_since_last_produced);if(gap>=10000)stale.classList.add("stale-high");else if(gap>=1000)stale.classList.add("stale-mid");tr.append(stale);
   tr.append(cell(v.last_block_date||"—","numeric-text"));
   const ec=document.createElement("td"),badge=document.createElement("span");badge.className=`badge ${v.last_block_era||""}`;badge.textContent=v.last_block_era||"—";ec.append(badge);tr.append(ec,cell(v.last_block_epoch??"—","num"));rows.append(tr);
  }
 }
 $("pageLabel").textContent=`Page ${state.page} / ${pages}`;$("firstPage").disabled=$("prevPage").disabled=state.page<=1;$("nextPage").disabled=$("lastPage").disabled=state.page>=pages;
 document.querySelectorAll("th[data-sort]").forEach(th=>{th.removeAttribute("data-dir");if(th.dataset.sort===state.sortKey)th.dataset.dir=state.sortDir});
 renderTotals();updateColumnVisibility();
 saveView();
}
Object.values(f).forEach(el=>{["input","change"].forEach(ev=>el.addEventListener(ev,()=>{if(el===f.era)populateEpochs();apply()}))});
$("resetFilters").onclick=()=>{Object.values(f).forEach(el=>{if(el.type==="checkbox")el.checked=false;else el.value=""});commissionOverrides={};saveCommissions();populateEpochs();apply()};
document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sortKey===k)state.sortDir=state.sortDir==="asc"?"desc":"asc";else{state.sortKey=k;state.sortDir=["validator_name","wallet_address","last_block_era"].includes(k)?"asc":"desc"}sortRows();state.page=1;render()});
$("firstPage").onclick=()=>{state.page=1;render()};$("prevPage").onclick=()=>{state.page--;render()};$("nextPage").onclick=()=>{state.page++;render()};$("lastPage").onclick=()=>{state.page=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));render()};

Promise.all([
 fetch(`./data/validators.json?t=${Date.now()}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
 fetch('./data/simulation-sources.json',{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).catch(e=>{console.error(e);$("simulationNote").append(" Historical stakes could not be loaded.");return {};})
]).then(([p,sources])=>{
 simulationSources=sources;
 state.all=Array.isArray(p.validators)?p.validators.map(v=>({...v,stake_live_estimate:v.stake_live_estimate??v.current_stake,...ValidatorEstimates.calculate(v.stake_current_epoch,p.ledger_meta?.total_stake_current_epoch)})):[];$("validatorCount").textContent=fmt(p.validator_count??state.all.length);$("archiveHeight").textContent=p.archive_height==null?"—":fmt(p.archive_height);
 // Older snapshots counted every status. Do not label those metrics as canonical.
 for(const row of state.all)row.source_commission_pct=row.commission_pct;
 if(p.ledger_meta?.block_count_basis!=="canonical"){
  state.all=state.all.map(v=>({...v,blocks_previous_epoch:null,blocks_current_epoch:null,blocks_epoch_delta:null,stake_active_pct:null,is_active_validator:null}));
  $("epochSummary").textContent="Canonical epoch counts and active stake await the next export.";
 }
 const epochRow=state.all.find(v=>v.network_epoch_label&&v.previous_epoch_label);
 if(epochRow){
  $("networkEpoch").textContent=epochRow.network_epoch_label;
  const slot=epochRow.network_slot_in_epoch,slots=epochRow.network_slots_per_epoch;
  const confirmed=epochRow.network_confirmed_blocks,provisional=epochRow.network_provisional_blocks;
  if(Number.isInteger(slot)&&slot>=0&&Number.isInteger(slots)&&slot<slots){
   $("networkSlot").textContent=`${fmt(slot)} / ${fmt(slots-1)}`;
   if(Number.isInteger(confirmed)&&confirmed>=0&&Number.isInteger(provisional)&&provisional>=0){
    $("networkBlocks").textContent=fmt(confirmed+provisional);
    $("networkBlocks").title=`${fmt(confirmed)} confirmed + ${fmt(provisional)} provisional (archive-selected branch)`;
    $("networkFill").textContent=`${fmt(100*(confirmed+provisional)/(slot+1),2)}%`;
   }
  }
 }
 if(epochRow && p.ledger_meta?.block_count_basis==="canonical"){
  $("previousBlocksHeader").textContent=`Blocks ${epochRow.previous_epoch_label}`;
  $("currentBlocksHeader").textContent=`Blocks ${epochRow.network_epoch_label} (partial)`;
  $("inclusiveBlocksHeader").textContent=`Blocks ${epochRow.network_epoch_label} + frontier`;
  $("epochSummary").textContent=`Previous: ${epochRow.previous_epoch_label} · Current: ${epochRow.network_epoch_label} (in progress)`;
 }
 $("generatedAt").textContent=p.generated_at?new Date(p.generated_at).toLocaleString():"No snapshot yet";dataLoaded=true;populateEpochs(true);apply({resetPage:false});
}).catch(e=>{console.error(e);$("generatedAt").textContent="Load error";$("totals").replaceChildren();$("rows").innerHTML=`<tr><td colspan="${COLUMN_COUNT-hiddenColumns.size}" class="empty-state">Unable to load data.</td></tr>`});
