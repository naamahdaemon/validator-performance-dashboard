(function(root){
 const finite=v=>typeof v==="number"&&Number.isFinite(v);
 const stake=v=>finite(v)&&v>=0;
 const validFee=v=>finite(v)&&v>=0&&v<=100;
 function calculate(row,amount,sources={},overrides={}){
  const wallet=row.wallet_address;
  const base=row.commission_pct;
  const local=Object.hasOwn(overrides,wallet)&&validFee(overrides[wallet]);
  const fee=local?overrides[wallet]:validFee(base)?base:null;
  const historical=row.previous_epoch_label&&row.stake_previous_epoch_label===row.previous_epoch_label&&stake(row.stake_previous_epoch)
   ?row.stake_previous_epoch:sources.stake_history?.[row.previous_epoch_label]?.[wallet];
  const hasHistory=stake(historical),real=hasHistory?historical:row.stake_current_epoch;
  const blocks=row.blocks_previous_epoch;
  // Only full Mesa epochs have the 360 MINA reward assumed by this model.
  const supported=/^mesa:\d+$/.test(row.previous_epoch_label||"");
  const gross=supported&&stake(amount)&&stake(real)&&real>0&&Number.isInteger(blocks)&&blocks>=0
   ?blocks*360*(amount/(real+amount)):null;
  const change=stake(row.stake_current_epoch)&&stake(row.stake_live_estimate)
   ?row.stake_live_estimate-row.stake_current_epoch:null;
  const currentBlocks=row.blocks_current_epoch_inclusive,currentStake=row.stake_current_epoch;
  const currentGross=/^mesa:\d+$/.test(row.network_epoch_label||"")&&stake(amount)&&stake(currentStake)&&currentStake>0&&Number.isInteger(currentBlocks)&&currentBlocks>=0
   ?currentBlocks*360*(amount/(currentStake+amount)):null;
  return {
   commission_pct:fee,commission_local:local,commission_source_pct:validFee(base)?base:null,
   simulation_gross:gross,simulation_net:gross!==null&&fee!==null?gross*(1-fee/100):null,
   simulation_current_gross:currentGross,simulation_current_net:currentGross!==null&&fee!==null?currentGross*(1-fee/100):null,
   simulation_approximate:!hasHistory,simulation_stake:stake(real)?real:null,
   stake_current_live_delta:change,
   stake_current_live_delta_pct:change!==null&&row.stake_current_epoch>0?change/row.stake_current_epoch*100:null,
  };
 }
 function parseOverrides(raw){
  const result={};
  try{const data=JSON.parse(raw);if(data&&typeof data==="object"&&!Array.isArray(data))
   for(const [key,value] of Object.entries(data))if(/^B62[a-zA-Z0-9]+$/.test(key)&&validFee(value))result[key]=value;
  }catch(_){}
  return result;
 }
 const api={calculate,validFee,parseOverrides};
 root.ValidatorSimulation=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
