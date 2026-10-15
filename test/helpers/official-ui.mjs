// Pinned official browser artifacts + local static externals. No existing GUI/profile or remote service.
import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import{dirname,resolve}from'node:path';import vm from'node:vm';
import * as cordis from'@deepseek-ai/cordis';import * as slots from'@deepseek-ai/dsh-client-ui-slots';import * as store from'@deepseek-ai/dsh-client-store';
const require=createRequire(import.meta.url);
export const React=require('react');
export function createTestPrimitives(){
 return new Proxy({}, {get:(target,key)=>{
  if(Object.hasOwn(target,key))return target[key];
  return target[key]=(()=>{
   if(['useModalLayer','closeTopModal'].includes(key))return()=>{};
   if(key==='observeStickyMenuGroups')return()=>()=>{};
   if(key==='rankByName')return(rows,query='')=>rows.filter(row=>row.name.toLowerCase().includes(query.toLowerCase()));
   if(key==='Tooltip')return props=>props.children;
   if(key==='MenuGroup')return props=>React.createElement('div',{'data-test-primitive':'MenuGroup'},React.createElement('strong',null,props.label),props.children);
   if(['MenuSurface','Input','Button'].includes(key))return React.forwardRef((props,ref)=>React.createElement(key==='Input'?'input':key==='Button'?'button':'div',{...props,ref}));
   return props=>React.createElement('span',{'data-test-primitive':String(key),className:props?.className,'data-test-state':props?.state},props?.children);
  })();
 }});
}
export function loadOfficialUi(name,{globals={},overrides={},sourcePath}={}){
 const root=dirname(require.resolve(name+'/package.json'));let registration;
 const window=globals.window??{},previousLoader=Object.getOwnPropertyDescriptor(window,'__ModuleLoader__');
 Object.defineProperty(window,'__ModuleLoader__',{value:{load:row=>{registration=row;}},writable:true,configurable:true});
 const context=vm.createContext({console,queueMicrotask,setTimeout,clearTimeout,AbortController,URL,Date,TextEncoder,TextDecoder,...globals,window});
 try{new vm.Script(readFileSync(sourcePath??resolve(root,'lib/client.js'),'utf8'),{filename:name+'/client.js'}).runInContext(context);}
 finally{if(previousLoader)Object.defineProperty(window,'__ModuleLoader__',previousLoader);else delete window.__ModuleLoader__;}
 assert.equal(registration.id,name);
 const result=registration.factory(spec=>{
  if(Object.hasOwn(overrides,spec))return overrides[spec];
  if(spec==='@deepseek-ai/cordis')return cordis;if(spec==='@deepseek-ai/dsh-client-ui-slots')return slots;if(spec==='@deepseek-ai/dsh-client-store')return store;
  if(['react','react/jsx-runtime','react-dom','react-dom/client'].includes(spec))return require(spec);
  // Presentation primitives are supplied by the real Web shell; DOM diagnostic uses inert wrappers only.
  if(spec==='@deepseek-ai/dsh-client-ui-primitives')return createTestPrimitives();
  throw new Error('Unexpected official UI external '+spec);
 });
 return result;
}
