const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function cell(index,width=36){
 const classes=new Set(),properties={};
 return {cellIndex:index,colSpan:1,hidden:false,classes,properties,
  classList:{add:name=>classes.add(name)},
  style:{setProperty:(name,value)=>properties[name]=value},
  getBoundingClientRect:()=>({width})};
}
const headers=[cell(0),cell(1,140),cell(2,200)];
const body=[cell(0),cell(1),cell(2)],totals=[cell(0),cell(1),cell(2)];
const classes=new Set(),storage=new Map([['validator-freeze-columns','true']]);
let change,resize;
const control={checked:false,addEventListener:(_,callback)=>change=callback};
const table={tHead:{rows:[{cells:headers}]},rows:[{cells:headers},{cells:body},{cells:totals}],
 classList:{toggle:(name,enabled)=>enabled?classes.add(name):classes.delete(name)}};
const context=vm.createContext({$:()=>control,document:{querySelector:()=>table},
 localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
 ResizeObserver:class{constructor(callback){resize=callback;}observe(){}}});
const source=fs.readFileSync('docs/app.js','utf8');
vm.runInContext(source.slice(source.indexOf('const freezeColumns='),source.indexOf('function updateColumnVisibility()')),context);
context.updateFrozenColumns();
assert(classes.has('freeze-columns'));
for(const row of table.rows){
 assert(row.cells[0].classes.has('frozen-column'));
 assert(row.cells[1].classes.has('frozen-column'));
 assert(!row.cells[2].classes.has('frozen-column'));
 assert.equal(row.cells[1].properties['--frozen-left'],'36px');
}
headers[0].getBoundingClientRect=()=>({width:44});resize();
assert.equal(body[1].properties['--frozen-left'],'44px');
control.checked=false;change();
assert(!classes.has('freeze-columns'));
assert.equal(storage.get('validator-freeze-columns'),'false');
control.checked=true;change();
table.rows.push({cells:[cell(0),cell(1),cell(2)]});context.updateFrozenColumns();
assert(table.rows[3].cells[1].classes.has('frozen-column'));
// Toggling a favorite must preserve the existing sticky cell and focused button.
let click,button,applied=0;
const favorite=body[0];
favorite.append=value=>{button=value;};
favorite.replaceWith=()=>assert.fail('Favorite clicks must not replace the sticky cell');
context.cell=()=>favorite;
context.document.createElement=()=>({attributes:{},
 setAttribute(name,value){this.attributes[name]=value;},
 addEventListener(name,callback){if(name==='click')click=callback;}});
context.favorites=new Set();
context.f={favoritesOnly:{checked:false}};
context.apply=()=>applied++;
vm.runInContext(source.slice(source.indexOf('function favoriteCell('),source.indexOf('function bar(')),context);
assert.equal(context.favoriteCell({wallet_address:'A',validator_name:'Validator A'}),favorite);
const originalButton=button;
for(const selected of [true,false,true]){
 click();
 assert.equal(button,originalButton);
 assert.equal(button.attributes['aria-pressed'],String(selected));
 assert.equal(button.textContent,selected?'★':'☆');
 assert.equal(button.title,selected?'Remove from favorites':'Add to favorites');
 assert(favorite.classes.has('frozen-column'));
 assert.equal(favorite.properties['--frozen-left'],'0px');
 assert.equal(context.favorites.has('A'),selected);
 assert.deepEqual(JSON.parse(storage.get('validator-favorites-v1')),selected?['A']:[]);
}
context.f.favoritesOnly.checked=true;click();assert.equal(applied,1);
console.log('Frozen columns: restored preference, headers, rows, totals, resize, toggle and rebuilt rows OK');
