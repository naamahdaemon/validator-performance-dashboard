const MINASCAN="https://minascan.io/mainnet/account/";
const PAGE_SIZES=[20,30,50,100,200,500];
let savedPageSize=20;
try { const value=Number(localStorage.getItem("validator-page-size")); if(PAGE_SIZES.includes(value))savedPageSize=value; } catch (_) {}
const state={all:[],filtered:[],page:1,pageSize:savedPageSize,sortKey:"stake_live_estimate",sortDir:"desc"};
const $=id=>document.getElementById(id);
const SIMULATION_CAUTION="Simulation based on observed blocks, not a forecast. Exceptional production can inflate results, especially for small validators. A high simulated reward does not imply a better future return.";
document.querySelectorAll('th[data-sort^="simulation_"]').forEach(th=>{th.title=SIMULATION_CAUTION+" "+th.title;th.setAttribute("aria-describedby","simulationCaution");});
const favorites=new Set();
try{
 const saved=JSON.parse(localStorage.getItem("validator-favorites-v1"));
 if(Array.isArray(saved))for(const wallet of saved)if(typeof wallet==="string"&&wallet)favorites.add(wallet);
}catch(_){}
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

const lastUpdateButton=document.createElement("button");
lastUpdateButton.type="button";
lastUpdateButton.id="lastUpdate";
lastUpdateButton.textContent="Last update";
lastUpdateButton.title="Replay the highlight for the most recent detected data changes";
lastUpdateButton.disabled=true;
const pageSizeLabel=$("pageSize").closest("label");
if(pageSizeLabel)pageSizeLabel.after(lastUpdateButton);
else $("pageSize").after(lastUpdateButton);
const f={search:$("search"),era:$("era"),epoch:$("epoch"),dateAfter:$("dateAfter"),dateBefore:$("dateBefore"),stakeMin:$("stakeMin"),stakeMax:$("stakeMax"),delegatorsMin:$("delegatorsMin"),delegatorsMax:$("delegatorsMax"),blocksSinceMin:$("blocksSinceMin"),blocksSinceMax:$("blocksSinceMax")};
f.hideAnonymous=$("hideAnonymous");
f.favoritesOnly=$("favoritesOnly");
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
   if(row.cells.length===COLUMN_COUNT+1)row.cells[i+1].hidden=hidden;
   else if(row.cells.length===1)row.cells[0].colSpan=count+1;
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
  if(f.favoritesOnly.checked&&!favorites.has(v.wallet_address))return false;
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
function favoriteCell(v){
 const c=cell("","favorite-cell"),button=document.createElement("button");
 const selected=favorites.has(v.wallet_address);
 button.type="button";button.className="favorite-toggle";button.textContent=selected?"★":"☆";
 button.setAttribute("aria-pressed",String(selected));
 button.setAttribute("aria-label",`Favorite: ${v.validator_name||v.wallet_address}`);
 button.title=selected?"Remove from favorites":"Add to favorites";
 button.disabled=!v.wallet_address;
 button.addEventListener("click",()=>{
  if(favorites.has(v.wallet_address))favorites.delete(v.wallet_address);else favorites.add(v.wallet_address);
  try{localStorage.setItem("validator-favorites-v1",JSON.stringify([...favorites]));}catch(_){}
  if(f.favoritesOnly.checked)apply({resetPage:false});
  else c.replaceWith(favoriteCell(v));
 });
 c.append(button);return c;
}
function bar(v,max,d=0){if(v==null)return cell("—","num");const x=cell("", "bar-cell num"),b=document.createElement("div"),s=document.createElement("span");b.className="bar";b.style.width=`${max?Math.min(100,num(v)/max*100):0}%`;s.className="value";s.textContent=fmt(v,d);x.append(b,s);return x}
function percentCell(v){return cell(v==null?"—":`${fmt(v,2)}%`,"num")}
function productionCell(v,current,includeFrontier=false){
 const blocks=current?(includeFrontier?v.blocks_current_epoch_inclusive:v.blocks_current_epoch):v.blocks_previous_epoch;
 const c=cell(blocks==null?"—":fmt(blocks),"num");
 let expected=v.expected_blocks_epoch;
 const era=current?v.network_epoch_label:v.previous_epoch_label;
 if(blocks==null||!Number.isFinite(expected)||expected<=0||!String(era||"").startsWith("mesa:"))return c;
 if(current){
  const slot=v.network_slot_in_epoch,slots=v.network_slots_per_epoch;
  if(!Number.isFinite(slot)||!Number.isFinite(slots)||slots<=0||slot<0||slot>=slots)return c;
  expected*=(slot+1)/slots;
 }
 const direction=blocks>=expected*3?"high":blocks<=expected/3?"low":"normal";
 const indicator=document.createElement("span");
 indicator.className=`production-indicator production-${direction}`;
 const arrow=document.createElementNS("http://www.w3.org/2000/svg","svg");
 arrow.setAttribute("viewBox","0 0 16 16");
 arrow.setAttribute("aria-hidden","true");
 arrow.setAttribute("focusable","false");
 const path=document.createElementNS("http://www.w3.org/2000/svg","path");
 path.setAttribute("d",{high:"M8 14V2M3 7L8 2L13 7",low:"M8 2V14M3 9L8 14L13 9",normal:"M2 8H14M9 3L14 8L9 13"}[direction]);
 arrow.append(path);indicator.append(arrow);
 indicator.setAttribute("role","img");
 indicator.setAttribute("aria-label",{high:"At least three times expected",low:"At most one third of expected",normal:"Within comparison thresholds"}[direction]);
 c.classList.add("production-cell");
 c.prepend(indicator);
 const basis=current
  ?`Prorated through the latest archived slot; ${includeFrontier?"confirmed plus provisional archive-selected branch blocks, subject to reorganizations":"confirmed blocks only, frontier excluded"}.`
  :"Approximation using current Stake N and current total ledger stake, not historical N−1 stake.";
 c.title=`Expected: ${fmt(expected,2)} blocks. ↑ ≥ 3×; ↓ ≤ ⅓; → between thresholds. ${basis} Heuristic thresholds, not a statistical significance test.`;
 return c;
}
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
 c.title=SIMULATION_CAUTION+" "+c.title;
 c.setAttribute("aria-describedby","simulationCaution");
 return c;
}
function renderTotals(){
 const t=ValidatorTotals.calculate(state.filtered),tr=document.createElement("tr");
 tr.append(cell("","favorite-cell"));
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
 $("simulationCaution").hidden=!(Number(f.simulationStake.value)>0);
 $("filteredCount").textContent=fmt(state.filtered.length);
 const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));state.page=Math.min(Math.max(1,state.page),pages);
 const rows=$("rows");rows.replaceChildren();
 if(!state.filtered.length){const tr=document.createElement("tr"),c=cell("No validators match the current filters.","empty-state");c.colSpan=COLUMN_COUNT+1;tr.append(c);rows.append(tr)}
 else{
  const slice=state.filtered.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
  const simulationMax=Object.fromEntries(["simulation_gross","simulation_net","simulation_current_gross","simulation_current_net"].map(key=>[key,Math.max(0,...state.filtered.map(v=>num(v[key])))]));
  const maxN=Math.max(...state.filtered.map(v=>num(v.stake_current_epoch)),0),maxN1=Math.max(...state.filtered.map(v=>num(v.stake_next_epoch)),0),maxLive=Math.max(...state.filtered.map(v=>num(v.stake_live_estimate)),0),maxD=Math.max(...state.filtered.map(v=>num(v.delegator_count)),0),maxB=Math.max(...state.filtered.map(v=>num(v.canonical_blocks_all_epochs)),0);
  for(const v of slice){
   const tr=document.createElement("tr"),vc=cell(v.validator_name||"—","validator");tr.dataset.wallet=v.wallet_address;vc.title=v.validator_name||"";tr.append(favoriteCell(v),vc);
   const wc=document.createElement("td"),a=document.createElement("a");a.className="wallet";a.href=MINASCAN+encodeURIComponent(v.wallet_address||"");a.target="_blank";a.rel="noopener noreferrer";a.textContent=v.wallet_address||"—";a.title=v.wallet_address||"";wc.append(a);tr.append(wc);
   tr.append(bar(v.stake_current_epoch,maxN,2),percentCell(v.stake_current_pct),percentCell(v.stake_active_pct),bar(v.stake_next_epoch,maxN1,2),bar(v.stake_live_estimate,maxLive,2));
   tr.append(delta(v.stake_next_delta_pct,v.stake_next_delta),delta(v.stake_live_delta_pct,v.stake_live_delta));
   tr.append(delta(v.stake_current_live_delta_pct,v.stake_current_live_delta),commissionCell(v),simulationCell(v,"simulation_gross",simulationMax.simulation_gross),simulationCell(v,"simulation_net",simulationMax.simulation_net));
   tr.append(simulationCell(v,"simulation_current_gross",simulationMax.simulation_current_gross),simulationCell(v,"simulation_current_net",simulationMax.simulation_current_net));
   tr.append(bar(v.delegator_count,maxD),bar(v.canonical_blocks_all_epochs,maxB));
   tr.append(productionCell(v,false),productionCell(v,true));
   tr.append(productionCell(v,true,true));
   for(const key of ["expected_blocks_epoch","expected_coinbase_epoch"])tr.append(cell(v[key]==null?"—":fmt(v[key],2),"num"));
   tr.append(blockDelta(v.blocks_epoch_delta));
   const stale=cell(fmt(v.blocks_since_last_produced),"num"),gap=num(v.blocks_since_last_produced);if(gap>=10000)stale.classList.add("stale-high");else if(gap>=1000)stale.classList.add("stale-mid");tr.append(stale);
   tr.append(cell(v.last_block_date||"—","numeric-text"));
   const ec=document.createElement("td"),badge=document.createElement("span");badge.className=`badge ${v.last_block_era||""}`;badge.textContent=v.last_block_era||"—";ec.append(badge);tr.append(ec,cell(v.last_block_epoch??"—","num"));rows.append(tr);
  }
 }
 $("pageLabel").textContent=`Page ${state.page} / ${pages}`;$("firstPage").disabled=$("prevPage").disabled=state.page<=1;$("nextPage").disabled=$("lastPage").disabled=state.page>=pages;
 document.querySelectorAll("th[data-sort]").forEach(th=>{th.removeAttribute("data-dir");if(th.dataset.sort===state.sortKey)th.dataset.dir=state.sortDir});
 
renderTotals();
updateColumnVisibility();
applyActiveHighlights();
saveView();
}
Object.values(f).forEach(el=>{["input","change"].forEach(ev=>el.addEventListener(ev,()=>{if(el===f.era)populateEpochs();apply()}))});
$("resetFilters").onclick=()=>{Object.values(f).forEach(el=>{if(el.type==="checkbox")el.checked=false;else el.value=""});commissionOverrides={};saveCommissions();populateEpochs();apply()};
document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sortKey===k)state.sortDir=state.sortDir==="asc"?"desc":"asc";else{state.sortKey=k;state.sortDir=["validator_name","wallet_address","last_block_era"].includes(k)?"asc":"desc"}sortRows();state.page=1;render()});
$("firstPage").onclick=()=>{state.page=1;render()};$("prevPage").onclick=()=>{state.page--;render()};$("nextPage").onclick=()=>{state.page++;render()};$("lastPage").onclick=()=>{state.page=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));render()};

function installSnapshot(p){
 for(const id of ["networkEpoch","networkSlot","networkBlocks","networkFill"]){$(id).textContent="—";$(id).removeAttribute("title");}
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
}

const HIGHLIGHT_DURATION = 180000; // 180 seconds
const highlightedCells = new Map();
const lastUpdateCells = new Map();

function displayedValue(cell){
 const input=cell.querySelector("input");
 return String(input?.value??cell.textContent??"").trim();
}

function displayedCells(){
 const result=new Map();
 for(const row of [...$("rows").rows,...$("totals").rows]){
  if(row.cells.length!==COLUMN_COUNT+1)continue;
  [...row.cells].forEach((c,i)=>result.set(`${row.dataset.wallet||"totals"}:${i}`,{
   cell:c,
   display:displayedValue(c),
   value:JSON.stringify([
    c.textContent,
    c.querySelector("input")?.value,
    c.querySelector(".production-indicator")?.getAttribute("aria-label")
   ])
  }));
 }
 return result;
}

function scheduleHighlightRemoval(key,cell,expiresAt){
 const remaining=Math.max(0,expiresAt-Date.now());
 setTimeout(()=>{
  const info=highlightedCells.get(key);
  if(info&&info.expiresAt<=Date.now()){
   highlightedCells.delete(key);
   cell.classList.remove("data-updated");
  }
 },remaining);
}

function applyActiveHighlights({restart=false}={}){
 const now=Date.now();

 for(const [key,{cell}] of displayedCells()){
  const info=highlightedCells.get(key);
  if(!info)continue;

  if(info.expiresAt<=now){
   highlightedCells.delete(key);
   continue;
  }

  if(restart&&cell.classList.contains("data-updated")){
   cell.classList.remove("data-updated");
   void cell.offsetWidth;
  }
  cell.classList.add("data-updated");
  scheduleHighlightRemoval(key,cell,info.expiresAt);
 }
}

function rememberLastUpdate(key,previous,current){
 lastUpdateCells.set(key,{previous,current});
 lastUpdateButton.disabled=false;
 lastUpdateButton.title=`Replay highlight for the last update (${lastUpdateCells.size} changed cell${lastUpdateCells.size===1?"":"s"})`;
}

function highlightUpdates(before){
 const bounds=document.querySelector(".table-wrap").getBoundingClientRect();
 const now=Date.now();
 const changedThisUpdate=[];

 for(const [key,{cell,value,display}] of displayedCells()){
  if(!before.has(key)||before.get(key).value===value||cell.hidden)continue;

  const rect=cell.getBoundingClientRect();

  if(
   rect.width&&
   rect.height&&
   rect.bottom>0&&
   rect.top<innerHeight&&
   rect.right>Math.max(0,bounds.left)&&
   rect.left<Math.min(innerWidth,bounds.right)
  ){
   const previous=before.get(key).display;
   const expiresAt=now+HIGHLIGHT_DURATION;
   const info={expiresAt,previous,current:display};

   highlightedCells.set(key,info);
   changedThisUpdate.push([key,{previous,current:display}]);
   cell.classList.add("data-updated");
   scheduleHighlightRemoval(key,cell,expiresAt);
  }
 }

 if(changedThisUpdate.length){
  lastUpdateCells.clear();
  for(const [key,{previous,current}] of changedThisUpdate)rememberLastUpdate(key,previous,current);
 }
}

lastUpdateButton.addEventListener("click",()=>{
 if(!lastUpdateCells.size)return;
 const expiresAt=Date.now()+HIGHLIGHT_DURATION;

 for(const [key,{previous,current}] of lastUpdateCells){
  highlightedCells.set(key,{expiresAt,previous,current});
 }

 applyActiveHighlights({restart:true});
});

function parseDisplayedNumber(value){
 let text=String(value??"").trim();
 if(!text||text==="—")return null;

 const parts=new Intl.NumberFormat().formatToParts(12345.6);
 const group=parts.find(p=>p.type==="group")?.value??",";
 const decimal=parts.find(p=>p.type==="decimal")?.value??".";

 text=text.replace(/[≈+%]/g,"").replace(/[\u00A0\u202F\s]/g,"");
 if(group)text=text.split(group).join("");
 if(decimal!==".")text=text.split(decimal).join(".");

 if(!/^-?\d+(?:\.\d+)?$/.test(text))return null;
 const number=Number(text);
 return Number.isFinite(number)?number:null;
}

function decimalPlaces(value){
 const text=String(value??"").replace(/[\u00A0\u202F\s%≈+]/g,"");
 const decimal=new Intl.NumberFormat().formatToParts(1.1).find(p=>p.type==="decimal")?.value??".";
 const index=text.lastIndexOf(decimal);
 return index<0?0:Math.min(8,text.length-index-1);
}

function changeLabel(previous,current){
 const oldNumber=parseDisplayedNumber(previous);
 const newNumber=parseDisplayedNumber(current);

 if(oldNumber!=null&&newNumber!=null){
  const difference=newNumber-oldNumber;
  const decimals=Math.max(decimalPlaces(previous),decimalPlaces(current));
  const absolute=new Intl.NumberFormat(undefined,{
   minimumFractionDigits:decimals,
   maximumFractionDigits:decimals
  }).format(Math.abs(difference));
  const sign=difference>0?"+":difference<0?"−":"±";
  const suffix=String(current).includes("%")?"%":"";
  return `${sign}${absolute}${suffix}`;
 }

 return `Previous: ${previous||"—"}`;
}

let updateDetailPopup=null;
function hideUpdateDetail(){
 if(updateDetailPopup){
  updateDetailPopup.remove();
  updateDetailPopup=null;
 }
}

function showUpdateDetail(cell,text){
 hideUpdateDetail();

 const popup=document.createElement("div");
 updateDetailPopup=popup;
 popup.textContent=text;
 popup.setAttribute("role","status");
 popup.style.position="fixed";
 popup.style.zIndex="1000";
 popup.style.padding="6px 9px";
 popup.style.border="1px solid var(--border)";
 popup.style.borderRadius="6px";
 popup.style.background="var(--surface2)";
 popup.style.color="var(--text)";
 popup.style.boxShadow="0 6px 18px #0005";
 popup.style.font="600 12px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace";
 popup.style.pointerEvents="none";
 popup.style.whiteSpace="nowrap";

 document.body.append(popup);

 const rect=cell.getBoundingClientRect();
 const popupRect=popup.getBoundingClientRect();
 const left=Math.min(
  Math.max(8,rect.left+(rect.width-popupRect.width)/2),
  innerWidth-popupRect.width-8
 );
 const top=rect.top-popupRect.height-7>=8
  ?rect.top-popupRect.height-7
  :Math.min(innerHeight-popupRect.height-8,rect.bottom+7);

 popup.style.left=`${left}px`;
 popup.style.top=`${top}px`;

 setTimeout(()=>{
  if(updateDetailPopup===popup)hideUpdateDetail();
 },5000);
}

document.addEventListener("click",event=>{
 const cell=event.target.closest?.("td.data-updated");
 if(!cell)return;
 if(event.target.closest("a,button,input,select,textarea"))return;

 const row=cell.parentElement;
 const key=`${row?.dataset.wallet||"totals"}:${cell.cellIndex}`;
 const info=highlightedCells.get(key);
 if(!info||info.expiresAt<=Date.now())return;

 showUpdateDetail(cell,changeLabel(info.previous,info.current));
});

document.addEventListener("keydown",event=>{if(event.key==="Escape")hideUpdateDetail();});


let refreshBusy=false,lastSnapshot="";
function editingControl(){return document.activeElement?.matches("input,select,textarea");}
async function refreshData(){
 if(refreshBusy||document.hidden||(dataLoaded&&editingControl()))return;
 refreshBusy=true;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(`./data/validators.json?t=${Date.now()}`,{cache:"no-store",signal:controller.signal});
  if(!response.ok)throw Error(response.status);
  const p=await response.json();
  if(!Array.isArray(p.validators)||p.validators.some(v=>!v||typeof v.wallet_address!=="string"))throw Error("Invalid snapshot");
  const signature=JSON.stringify(p);
  if(document.hidden||(dataLoaded&&editingControl()))return;
  if(signature!==lastSnapshot){
   const before=displayedCells(),wasLoaded=dataLoaded;
   installSnapshot(p);lastSnapshot=signature;
   if(wasLoaded)highlightUpdates(before);
  }
  $("refreshStatus").textContent="Auto-refresh · every minute";
 }catch(e){
  console.error(e);
  $("refreshStatus").textContent=dataLoaded?"Refresh unavailable · showing last snapshot; retrying automatically":"Unable to load data · retrying automatically";
 }finally{clearTimeout(timeout);refreshBusy=false;}
}
async function startRefresh(){
 try{
  const response=await fetch('./data/simulation-sources.json',{cache:"no-cache",signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status);
  simulationSources=await response.json();
 }catch(e){console.error(e);$("simulationNote").append(" Historical stakes could not be loaded.");}
 await refreshData();
 setInterval(refreshData,60000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshData();});
}
startRefresh();
