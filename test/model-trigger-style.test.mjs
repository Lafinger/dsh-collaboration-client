import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {loadOfficialUi} from './helpers/official-ui.mjs';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';

async function withStyles(check){
 const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>'),previous=Object.getOwnPropertyDescriptor(globalThis,'document'),disposers=[];
 Object.defineProperty(globalThis,'document',{value:dom.window.document,configurable:true});
 try{
  loadOfficialUi('@deepseek-ai/dsh-client-ui-model-selection',{globals:{document:dom.window.document}});
  const {browser}=await loadBrowserThroughDsh(process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url)));
  const ctx={on:()=>()=>{},effect:fn=>{const dispose=fn();if(typeof dispose==='function')disposers.push(dispose);},locale:{register:()=>()=>{}},slots:{inject:(name,fn)=>name==='conversation.input.model'?fn():()=>{},register:()=>()=>{}},inject:(_deps,fn)=>fn(ctx)};
  browser.apply(ctx);
  const official=dom.window.document.querySelector('style[data-plugin-css]'),custom=dom.window.document.querySelector('style[data-collaboration-style]');assert.ok(official);assert.ok(custom);
  const rules=tag=>[...tag.sheet.cssRules],nativeClass=suffix=>rules(official).find(rule=>new RegExp('^\\.[\\w-]+_'+suffix+'$').test(rule.selectorText??''))?.selectorText,nativeRule=suffix=>rules(official).find(rule=>rule.selectorText===nativeClass(suffix));
  const ownRule=selector=>rules(custom).find(rule=>rule.selectorText===selector);
  await check({nativeRule,nativeClass,ownRule,officialRules:rules(official)});
 }finally{for(const dispose of disposers.reverse())dispose();dom.window.close();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}
function matchProperties(actual,expected,properties){
 assert.ok(actual,'Missing collaboration style rule');assert.ok(expected,'Missing pinned native style rule');
 for(const property of properties){
  const value=rule=>{const raw=rule.style.getPropertyValue(property);return property==='background'&&raw==='0 0'?'transparent':raw;};
  assert.equal(value(actual),value(expected),'Native '+property+' differs for '+actual.selectorText);
 }
}
test('composer model trigger keeps the native typography, sizing and spacing',()=>withStyles(({nativeRule,ownRule})=>{
 matchProperties(ownRule('.dsh-collaboration-model-trigger'),nativeRule('trigger'),['display','align-items','gap','min-width','max-width','height','padding','border','border-radius','outline','background','color','font-size','font-weight','line-height','cursor']);
}));
test('effort, chevron and compact model icon retain separate native styling',()=>withStyles(({nativeRule,nativeClass,ownRule,officialRules})=>{
 matchProperties(ownRule('.dsh-collaboration-model-trigger-effort'),nativeRule('triggerEffort'),['flex-shrink','min-width','overflow','text-overflow','white-space','color']);
 matchProperties(ownRule('.dsh-collaboration-model-trigger-label'),nativeRule('triggerLabel'),['min-width','overflow','text-overflow','white-space']);
 matchProperties(ownRule('.dsh-collaboration-model-trigger-icon'),nativeRule('triggerIcon'),['display','flex']);
 matchProperties(ownRule('.dsh-collaboration-model-chevron'),nativeRule('chevron'),['color','flex','transition']);
 matchProperties(ownRule('.dsh-collaboration-model-chevron-open'),nativeRule('chevronOpen'),['transform']);
 const nativeVisibility=officialRules.find(rule=>rule.selectorText===nativeClass('triggerLabel')+','+nativeClass('triggerEffort'));
 matchProperties(ownRule('.dsh-collaboration-model-trigger-label,.dsh-collaboration-model-trigger-effort'),nativeVisibility,['display']);
 const nativeFocus=officialRules.find(rule=>rule.selectorText===nativeClass('trigger')+':focus-visible:not([data-selection-focus])');
 matchProperties(ownRule('.dsh-collaboration-model-trigger:focus-visible:not([data-selection-focus])'),nativeFocus,['box-shadow']);
}));
