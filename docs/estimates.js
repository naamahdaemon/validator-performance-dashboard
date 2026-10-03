(function(root){
 // Proportional estimate of canonical production, not a VRF slot prediction.
 function calculate(stake,total){
  if(typeof stake!=="number"||!Number.isFinite(stake)||stake<0||
     typeof total!=="number"||!Number.isFinite(total)||total<=0||stake>total){
   return {expected_blocks_epoch:null,expected_coinbase_epoch:null};
  }
  const blocks=7140*0.75*(stake/total);
  return {expected_blocks_epoch:blocks,expected_coinbase_epoch:blocks*360};
 }
 root.ValidatorEstimates={calculate};
 if(typeof module!=="undefined"&&module.exports)module.exports={calculate};
})(globalThis);
