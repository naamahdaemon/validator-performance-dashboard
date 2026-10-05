const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('docs/app.js','utf8');
let payload={validators:[{wallet_address:'wallet',blocks:1}]},calls=0,installs=0,flashes=0;
let fail=false,editing=false;
const status={textContent:''};
const context=vm.createContext({
 console:{error(){}},AbortController,setTimeout,clearTimeout,
 document:{hidden:false,activeElement:{matches:()=>editing}},dataLoaded:false,
 $:()=>status,displayedCells:()=>new Map(),highlightUpdates:()=>flashes++,
 installSnapshot:()=>{installs++;context.dataLoaded=true;},
 fetch:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>payload};}
});
vm.runInContext(source.slice(source.indexOf('let refreshBusy='),source.indexOf('async function startRefresh')),context);
(async()=>{
 await context.refreshData();assert.equal(installs,1);assert.equal(flashes,0);
 await context.refreshData();assert.equal(installs,1);
 payload={validators:[{wallet_address:'wallet',blocks:2}]};
 await context.refreshData();assert.equal(installs,2);assert.equal(flashes,1);
 editing=true;const before=calls;await context.refreshData();assert.equal(calls,before);editing=false;
 context.document.hidden=true;await context.refreshData();assert.equal(calls,before);context.document.hidden=false;
 fail=true;await context.refreshData();assert.equal(installs,2);assert.match(status.textContent,/last snapshot/);
 fail=false;payload={wrong:true};await context.refreshData();assert.equal(installs,2);
 payload={validators:[{wallet_address:'wallet',blocks:3}]};await context.refreshData();assert.equal(installs,3);
 console.log('Refresh: unchanged snapshots, updates, editing, hidden tab, failure and recovery OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
