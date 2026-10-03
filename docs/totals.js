(function(root){
 function sum(rows,key,{inactiveIsZero=false}={}){
  let total=0;
  for(const row of rows){
   if(inactiveIsZero&&row.is_active_validator===false)continue;
   const value=row[key];
   if(typeof value!=="number"||!Number.isFinite(value))return null;
   total+=value;
  }
  return total;
 }
 function calculate(rows){
  const totals={};
  for(const key of ["stake_current_epoch","stake_current_pct","stake_next_epoch","stake_live_estimate","delegator_count","canonical_blocks_all_epochs","blocks_previous_epoch","blocks_current_epoch","blocks_epoch_delta"]){
   totals[key]=sum(rows,key);
  }
  totals.stake_active_pct=sum(rows,"stake_active_pct",{inactiveIsZero:true});
  for(const key of ["expected_blocks_epoch","expected_coinbase_epoch"])totals[key]=sum(rows,key);
  for(const [prefix,oldKey,newKey] of [["stake_next","stake_current_epoch","stake_next_epoch"],["stake_live","stake_next_epoch","stake_live_estimate"]]){
   const oldValue=totals[oldKey],newValue=totals[newKey];
   totals[prefix+"_delta"]=oldValue==null||newValue==null?null:newValue-oldValue;
   totals[prefix+"_delta_pct"]=oldValue==null||oldValue===0||newValue==null?null:(newValue-oldValue)/oldValue*100;
  }
  return totals;
 }
 root.ValidatorTotals={calculate};
 if(typeof module!=="undefined"&&module.exports)module.exports={calculate};
})(globalThis);
