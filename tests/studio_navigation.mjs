// Exercise the actual Odoo host setup with a simulated action lifecycle.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../static/src/js/elks_paper_studio.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export class','class');
let Host;
const callbacks={}; const calls=[];
const context={Component:class{},registry:{category:()=>({add:(name,component)=>{Host=component;}})},useRef:()=>({}),useService:name=>name==='orm'?{call:async(...args)=>{calls.push(args);return {};}}:{},useSetupAction:options=>{callbacks.options=options;},onWillStart:fn=>{callbacks.start=fn;},onMounted:fn=>{callbacks.mount=fn;},onWillUnmount:()=>{},window:{addEventListener:()=>{},removeEventListener:()=>{}}};
vm.runInNewContext(source,context);
for(const props of [{action:{params:{issue_id:27}}},{action:{params:{resId:27}}},{action:{params:{}},resId:27},{action:{context:{active_id:27}}}]) {
 const host=new Host();host.props={...props,updateActionState:(state)=>{assert.equal(state.resId,27);assert.doesNotThrow(()=>JSON.stringify(state));}};
 host.setup();await callbacks.start();callbacks.mount();
 assert.equal(host.issueId,27);assert.equal(calls.at(-1)[2][0][0],27);
 assert.equal(callbacks.options.getGlobalState().resId,27);
}
const missing=new Host();missing.props={action:{params:{}}};
assert.throws(()=>missing.setup(),/No newsletter was created/);
assert.ok(calls.every(call=>call[1]==='action_studio_load'),'refresh only loads an existing issue');
console.log('Studio navigation: issue ID survives restored action state; no create RPC on refresh.');
