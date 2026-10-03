const assert = require('node:assert/strict');
const {calculate} = require('../docs/totals.js');

const rows = [
 {stake_current_epoch:100,stake_next_epoch:200,stake_live_estimate:150,stake_current_pct:10,stake_active_pct:25,is_active_validator:true,delegator_count:2,canonical_blocks_all_epochs:10,blocks_previous_epoch:3,blocks_current_epoch:5,blocks_epoch_delta:2},
 {stake_current_epoch:300,stake_next_epoch:300,stake_live_estimate:250,stake_current_pct:30,stake_active_pct:null,is_active_validator:false,delegator_count:4,canonical_blocks_all_epochs:20,blocks_previous_epoch:0,blocks_current_epoch:0,blocks_epoch_delta:0},
];
const total = calculate(rows);
assert.equal(total.stake_current_epoch,400);
assert.equal(total.stake_current_pct,40);
assert.equal(total.stake_active_pct,25);
assert.equal(total.stake_next_delta,100);
assert.equal(total.stake_next_delta_pct,25); // Not the sum of individual percentage changes (100%).
assert.equal(total.stake_live_delta,-100);
assert.equal(total.stake_live_delta_pct,-20);
assert.equal(total.delegator_count,6);
assert.equal(total.canonical_blocks_all_epochs,30);
assert.equal(total.blocks_epoch_delta,2);
assert.equal(calculate([rows[0]]).canonical_blocks_all_epochs,10);
assert.equal(calculate([...rows,{stake_current_epoch:null}]).stake_current_epoch,null);
assert.equal(calculate([{stake_active_pct:null}]).stake_active_pct,null);
assert.equal(calculate([]).canonical_blocks_all_epochs,0);
assert.equal(calculate([]).stake_next_delta_pct,null);
assert.equal(calculate([{stake_current_epoch:0,stake_next_epoch:10}]).stake_next_delta,10);
assert.equal(calculate([{stake_current_epoch:0,stake_next_epoch:10}]).stake_next_delta_pct,null);
assert.equal(Object.hasOwn(total,'blocks_since_last_produced'),false);
console.log('Totals: sums, aggregate percentages, filtered subset, missing values and zero baseline OK');
