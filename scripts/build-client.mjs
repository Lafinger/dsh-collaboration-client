import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
if(manifest.exports?.['./client']!=='./lib/client.js')throw new Error('DSH browser ./client must select the built classic-script entry, never the Node MemberClient');
const source=readFileSync(resolve(root,'client/index.js'),'utf8').replace('// MODEL_MENU',readFileSync(resolve(root,'client/model-menu.js'),'utf8'));
// Embed owner-local menu source in one classic no-JSX entry; transform only shell baseline imports.
if(!source.includes("import * as React from 'react';"))throw new Error('Unexpected client import');
const names=[...source.matchAll(/export (?:const|function) ([A-Za-z0-9_]+)/g)].map(m=>m[1]);
const body=source.replace("import * as React from 'react';","const React=require('react');")
  .replace("import {createPortal} from 'react-dom';","const {createPortal}=require('react-dom');")
  .replace("import {MenuSurface,MenuGroup,rankByName,observeStickyMenuGroups,IconChevronDownOutlineRegular,IconDataOutlineRegular,StateDot} from '@deepseek-ai/dsh-client-ui-primitives';","const {MenuSurface,MenuGroup,rankByName,observeStickyMenuGroups,IconChevronDownOutlineRegular,IconDataOutlineRegular,StateDot}=require('@deepseek-ai/dsh-client-ui-primitives');")
  .replaceAll('export const ','const ').replaceAll('export function ','function ');
if(/\bimport\s|\bexport\s/.test(body))throw new Error('Unbundled client dependency');
const output=`window.__ModuleLoader__.load({id:'dsh-collaboration-client',factory:(require)=>{\n${body}\nreturn {${names.join(',')}};\n}});\n`;
new vm.Script(output,{filename:'dsh-collaboration-client/client.js'}); // Reject ESM syntax before delivering a classic script.
mkdirSync(resolve(root,'lib'),{recursive:true});writeFileSync(resolve(root,'lib/client.js'),output);
console.log(JSON.stringify({clientBuild:'PASS',externalDependencies:['react','react-dom','@deepseek-ai/dsh-client-ui-primitives'],nodeApisInBrowser:false}));
