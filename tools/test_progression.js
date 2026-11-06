const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
class Element {
  constructor(){this.value='';this.listeners={};this.dataset={};this.classList={add(){},remove(){}};}
  set innerHTML(s){this.html=s;const o=s.match(/<option(?: value="([^"]*)")?[^>]*>([^<]*)/);if(o&&!this.value)this.value=o[1]||o[2];}
  get innerHTML(){return this.html||'';}
  addEventListener(n,fn){this.listeners[n]=fn;}
  click(){this.listeners.click?.();}
}
const elements={};let exported,printed=false;
const document={querySelector(s){return elements[s] ||=new Element();},querySelectorAll(){return [];},createElement(){return new Element();}};
const context={document,window:{print(){printed=true;}},location:{hash:''},Blob:class{constructor(parts){exported=parts.join('');}},URL:{createObjectURL(){return 'test';},revokeObjectURL(){}},setTimeout(fn){fn();}};
vm.createContext(context);
for(const file of ['web/degree_results_data.js','web/app.js','web/progression.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const get=id=>document.querySelector('#'+id);
assert.equal(get('progressionYear').value,'2025/2026');
assert.match(get('progressionHeadline').innerHTML,/67 of 359/);
assert.match(get('progressionHeadline').innerHTML,/37 of 67/);
assert.match(get('progressionTable').innerHTML,/25.0 pp/);
assert.equal((get('progressionTable').innerHTML.match(/<tr>/g)||[]).length,8);
get('progressionSort').value='rate';get('progressionSort').listeners.input();
assert.match(get('progressionTable').innerHTML,/^<tr><td><strong>Automotive Chassis Systems/);
get('progressionSort').value='change';get('progressionSort').listeners.input();
assert.match(get('progressionTable').innerHTML,/^<tr><td><strong>Automotive Chassis Systems/);
get('progressionExport').click();assert.match(exported,/Group Design Project/);assert.match(exported,/post-resit; summary rows excluded; imported 2026-11-06/);
for(const [year,expected] of [['2022/2023','41 of 229'],['2023/2024','42 of 238'],['2024/2025','77 of 323']]){
  get('progressionYear').value=year;get('progressionYear').listeners.input();
  assert.ok(get('progressionHeadline').innerHTML.includes(expected),year);
  assert.ok(!get('progressionTable').innerHTML.includes('NaN'));
}
get('progressionPrint').click();assert.ok(printed);
console.log('Progression checks passed: four years, count/rate/change rankings, totals, CSV and print handlers.');
