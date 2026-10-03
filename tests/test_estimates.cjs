const assert=require('node:assert/strict');
const {calculate}=require('../docs/estimates.js');
const totals=require('../docs/totals.js');
const estimate=calculate(12000000,800000000);
assert.ok(Math.abs(estimate.expected_blocks_epoch-80.325)<1e-10);
assert.ok(Math.abs(estimate.expected_coinbase_epoch-28917)<1e-8);
assert.equal(calculate(0,800000000).expected_blocks_epoch,0);
for(const [stake,total] of [[null,800],[100,null],[100,0],[-1,800],[900,800],[NaN,800],[100,Infinity]]){
 assert.equal(calculate(stake,total).expected_blocks_epoch,null);
 assert.equal(calculate(stake,total).expected_coinbase_epoch,null);
}
const rows=[calculate(100,1000),calculate(300,1000)];
assert.equal(totals.calculate(rows).expected_blocks_epoch,calculate(400,1000).expected_blocks_epoch);
assert.equal(totals.calculate([rows[0]]).expected_coinbase_epoch,rows[0].expected_coinbase_epoch);
assert.equal(totals.calculate([...rows,calculate(null,1000)]).expected_blocks_epoch,null);
console.log('Estimates: reference calculation, missing values and filtered totals OK');
