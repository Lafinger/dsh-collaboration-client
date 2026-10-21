// Isolated real-Chromium popup diagnosis. No current GUI, auth, or business service.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import WebSocket from 'ws';
const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baseline=resolve(root,'.dsh/admin-popup-baseline');mkdirSync(baseline,{recursive:true});
for(const name of ['lib/client.js','client/index.js']){const target=join(baseline,name.replaceAll('/','-'));if(!existsSync(target))writeFileSync(target,readFileSync(resolve(root,name)));}
const bundle=readFileSync(join(baseline,'lib-client.js'),'utf8');
const digest=createHash('sha256').update(bundle).digest('hex');
writeFileSync(join(baseline,'sha256.txt'),digest+'\n');
console.log(JSON.stringify({baselineSHA256:digest}));
const modules=new Map(),paths=new Map();
function moduleURL(file){if(paths.has(file))return paths.get(file);const url='/module/'+paths.size;paths.set(file,url);modules.set(url,'');let source=readFileSync(file,'utf8');
 const req=createRequire(file);
 const external=spec=>{if(spec==='react'||spec==='react-dom')return '/'+spec+'.mjs';if(spec==='react/jsx-runtime')return '/jsx.mjs';return moduleURL(req.resolve(spec));};
 if(/\bmodule\.exports|\bexports\.[\w]+\s*=/.test(source)&&!/^import /m.test(source)){
  const deps=[...new Set([...source.matchAll(/require\(["']([^"']+)["']\)/g)].map(x=>x[1]))];
  const imports=deps.map((s,i)=>`import * as d${i} from ${JSON.stringify(external(s))};`).join('\n');
  let keys=[];try{keys=Object.keys(req(file)).filter(k=>/^[$A-Z_a-z][$\w]*$/.test(k)&&k!=='default');}catch{}
  source=imports+`\nconst process={env:{NODE_ENV:'development'}};const module={exports:{}};const exports=module.exports;const deps={${deps.map((s,i)=>`${JSON.stringify(s)}:d${i}.default??d${i}`).join(',')}};const require=s=>{if(!(s in deps))throw Error('Unmapped '+s);return deps[s]};\n(function(module,exports,require){\n`+source+`\n})(module,exports,require);\nexport default module.exports;\n`+keys.map(k=>`export const ${k}=module.exports.${k};`).join('\n');
 }else source=source.replace(/(\bfrom\s*|\bimport\s*)(["'])([^"']+)\2/g,(all,p,q,s)=>p+JSON.stringify(external(s)));
 modules.set(url,source);return url;
}
const packageRoot=name=>dirname(require.resolve(name+'/package.json'));
const react=readFileSync(join(packageRoot('react'),'umd/react.development.js'),'utf8');
const reactDom=readFileSync(join(packageRoot('react-dom'),'umd/react-dom.development.js'),'utf8');
const assets=new Map([
 ['/react.js',react],['/react-dom.js',reactDom],['/react.mjs',`export default window.React;${Object.keys(require('react')).map(k=>`export const ${k}=window.React.${k};`).join('\n')}`],
 ['/react-dom.mjs',`export default window.ReactDOM;${Object.keys(require('react-dom')).map(k=>`export const ${k}=window.ReactDOM.${k};`).join('\n')}`],
 ['/jsx.mjs',`export const Fragment=window.React.Fragment;export const jsx=(type,p,key)=>window.React.createElement(type,{...p,key});export const jsxs=jsx;`],
 ['/plugin.js',bundle],
]);
const cordisURL=moduleURL(require.resolve('@deepseek-ai/cordis')),storeURL=moduleURL(require.resolve('@deepseek-ai/dsh-client-store')),slotsURL=moduleURL(require.resolve('@deepseek-ai/dsh-client-ui-slots'));
for(const [name,path] of [['renderer','@deepseek-ai/dsh-client-ui-renderer'],['settings','@deepseek-ai/dsh-client-ui-settings-general']])assets.set('/'+name+'.js',readFileSync(join(packageRoot(path),'lib/client.js'),'utf8'));
const currentHost=!process.argv.includes('--legacy-wrappers');
if(currentHost){
 const archive=process.env.ADMIN_POPUP_ASAR??join(process.env.LOCALAPPDATA,'Programs/DeepSeek Harness/resources/app.asar');
 const fd=openSync(archive,'r');try{const prefix=Buffer.alloc(16);readSync(fd,prefix,0,16,0);const header=Buffer.alloc(prefix.readUInt32LE(12));readSync(fd,header,0,header.length,16);const tree=JSON.parse(header),base=8+prefix.readUInt32LE(4);
 const asset=path=>{let item=tree;for(const part of path.split('/'))item=item.files[part];if(item.unpacked)throw Error('Unexpected unpacked asset '+path);const data=Buffer.alloc(item.size);readSync(fd,data,0,data.length,base+Number(item.offset));return data.toString('utf8')};
 let dist=tree;const distPath='dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist';for(const part of (distPath+'/assets').split('/'))dist=dist.files[part];
 const index=Object.keys(dist.files).find(n=>/^index-.*\.js$/.test(n));const shell=asset(distPath+'/assets/'+index),cut=shell.indexOf('const jZ="data-window-drag"');if(cut<0||!shell.includes('function SZ(){return{react:'))throw Error('Unrecognized published static external seam; do not guess');
 assets.set('/host-externals.mjs',shell.slice(0,cut)+'\nexport const externals=SZ();');
 for(const name of Object.keys(dist.files).filter(n=>/^(vendor-.*\.(js|css)|index-.*\.css)$/.test(n)))assets.set('/'+name,asset(distPath+'/assets/'+name));
 for(const [name,id]of [['renderer','dsh-client-ui-renderer'],['settings','dsh-client-ui-settings-general']])assets.set('/'+name+'.js',asset('dsh/node_modules/@deepseek-ai/'+id+'/lib/client.js'));
 console.log(JSON.stringify({hostArtifacts:'directed read-only ASAR',settingsVersion:JSON.parse(asset('dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-general/package.json')).version,webAssetSHA256:createHash('sha256').update(shell).digest('hex'),boot:'not executed; only published static external namespaces exported'}));
 }finally{closeSync(fd)}
}
let main=`import * as cordis from '${cordisURL}';import * as store from '${storeURL}';import * as slots from '${slotsURL}';
const React=window.React,ReactDOM=window.ReactDOM;
const primitives=new Proxy({}, {get:(t,k)=>t[k]??(t[k]=k==='useModalLayer'?()=>{}:k==='Tooltip'?p=>p.children:k==='observeStickyMenuGroups'?()=>()=>{}:p=>React.createElement('span',null,p?.children))});
const externals={'react':React,'react-dom':ReactDOM,'react-dom/client':ReactDOM,'react/jsx-runtime':{jsx:(t,p,key)=>React.createElement(t,{...p,key}),jsxs:(t,p,key)=>React.createElement(t,{...p,key}),Fragment:React.Fragment},'@deepseek-ai/cordis':cordis,'@deepseek-ai/dsh-client-store':store,'@deepseek-ai/dsh-client-ui-slots':slots,'@deepseek-ai/dsh-client-ui-primitives':primitives};
const loaded={};const load=id=>loaded[id]??(loaded[id]=window.registrations[id].factory(n=>{if(!(n in externals))throw Error('external '+n);return externals[n]}));
const ctx=new cordis.Context();ctx.provide('modules',{entries:{releaseChange:store.createSnapshotStore(null),dismissRelease:()=>{}}});await ctx.plugin(load('@deepseek-ai/dsh-client-ui-renderer')).await();
const localeSnapshot={revision:0},dict=new Map();const locale={getSnapshot:()=>localeSnapshot,subscribe:()=>()=>{},register:(n,d)=>{dict.set(n,d.zh);return()=>dict.delete(n)},bind:n=>k=>dict.get(n)?.[k]??k};ctx.provide('locale',locale);ctx.slots.installLocale(locale);
let member=null;window.rpcCalls=[];ctx.provide('connection',{state:store.createSnapshotStore('connected'),reconnect:()=>{},rpc:{call:async(path,name,request)=>{const {method,payload}=request;window.rpcCalls.push({method,payload});let value;if(method==='status')value={configuration:{mode:'mvp-qr',webQrLogin:1,state:'configured',origin:'https://fixture.invalid'},authenticated:true,administrator:true,name:'Fixture',account:'fixture',expiresAt:1900000000000};else if(method==='administration'){if(payload.action==='role'){member=payload.account;value={ok:true}}else value={projects:[{id:'p',key:'P',name:'Fixture P'},{id:'q',key:'Q',name:'Fixture Q'}],members:[{account:'member',name:'Fixture Member'}],...(payload.projectId?{project:{id:payload.projectId,roles:[{role:'frontend',label:'前端',member}]},revision:'fixture-v1'}:{})};}else throw Error('Unexpected '+method);return{ok:true,value};}}});
const remote={$host:{isLoopback:false},$on:()=>()=>{},settings:{}};ctx.provide('remote',remote);ctx.provide('remote.settings',remote.settings);ctx.provide('configForms',{developerTools:{enabled:store.createSnapshotStore(false),setEnabled:async()=>{}},describe:()=>store.createSnapshotStore({})});ctx.provide('shortcuts',{catalog:store.createSnapshotStore([]),register:()=>()=>{}});ctx.slots.provideRoot({hooks:{sessions:store.createSnapshotStore({phase:'ready',byId:{}})}});const absent=store.createSnapshotStore({key:undefined,hooks:{},keyedHooks:{},props:{}});ctx.slots.installScope('session',{current:absent,bindingSource:()=>absent});
await ctx.plugin({inject:['slots'],apply(c){c.slots.register({name:'root',children:{'sidebar.settings':{kind:'single',scope:'root'}}},({renderSlot})=>renderSlot('sidebar.settings',{wide:true}));}}).await();await ctx.plugin(load('dsh-collaboration-client')).await();await ctx.plugin(load('@deepseek-ai/dsh-client-ui-settings-general')).await();ReactDOM.createRoot(document.getElementById('app')).render(ctx.slots.renderSlot('root',{}));window.fixtureReady=true;`;
if(currentHost)main=`import {externals} from '/host-externals.mjs';const React=externals.react,ReactDOM=externals['react-dom/client'],cordis=externals['@deepseek-ai/cordis'],store=externals['@deepseek-ai/dsh-client-store'],slots=externals['@deepseek-ai/dsh-client-ui-slots'];\n`+main.slice(main.indexOf('const loaded='));
assets.set('/main.mjs',main);
assets.set('/',`<!doctype html><meta charset="utf-8">${currentHost?[...assets.keys()].filter(p=>p.endsWith('.css')).map(p=>`<link rel="stylesheet" href="${p}">`).join(''):''}<style>body{background:white;color:black;font:14px Arial}button,input,select{font:inherit}#control{position:fixed;top:0;left:0;z-index:9999}</style><select id="control"><option>control one</option><option>control two</option></select><div id="app"></div><script>window.registrations={};window.__ModuleLoader__={load:r=>window.registrations[r.id]=r};window.errors=[];window.addEventListener('error',e=>errors.push(e.error?.stack??e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));</script><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/renderer.js"></script><script src="/settings.js"></script><script src="/plugin.js"></script><script type="module" src="/main.mjs"></script>`);
const server=createServer((req,res)=>{const body=assets.get(req.url)??modules.get(req.url);res.writeHead(body===undefined?404:200,{'Content-Type':req.url==='/'?'text/html; charset=utf-8':req.url.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(body??'not found')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=mkdtempSync(join(tmpdir(),'dsh-popup-fixture-'));const chrome=spawn(process.env.ADMIN_POPUP_CHROME??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-extensions','--window-size=1280,1000','about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;const signals=[];
try{let port;for(let n=0;n<100;n++){try{port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await pause(100)}if(!port)throw Error('Chrome debugging port unavailable');const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const waiting=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=waiting.get(m.id);waiting.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;waiting.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}))});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception));return r.result.value};
 await cdp('Page.enable');await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});for(let n=0;n<60;n++){if(await evaluate('window.fixtureReady===true'))break;const errors=await evaluate('window.errors');if(errors?.length)throw Error(JSON.stringify(errors));await pause(100)}
 const click=async expression=>{const rect=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('missing target; buttons='+[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')+' errors='+JSON.stringify(window.errors));e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});await pause(100)};
 const key=async key=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{Escape:27,ArrowDown:40,Enter:13}[key]});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:{Escape:27,ArrowDown:40,Enter:13}[key]});await pause(60)};
 const sel=label=>`document.querySelector('select[aria-label="${label}"]')`;const btn=text=>`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
 const popup=async(target,phase)=>{await click(target);const state=await evaluate(`(()=>{const e=${target};return{open:e.matches(':open'),disabled:e.disabled,focused:document.activeElement===e,options:e.options.length}})()`);const ax=await cdp('Accessibility.getFullAXTree');const expanded=ax.nodes.filter(n=>n.role?.value==='combobox').map(n=>({name:n.name?.value,expanded:n.properties?.find(p=>p.name==='expanded')?.value?.value}));signals.push({phase,...state,expanded});console.log(JSON.stringify(signals.at(-1)));await key('Escape');if(!state.open)throw Error('POPUP_NOT_OPEN '+phase+' '+JSON.stringify(state));};
 await popup('document.getElementById("control")','bare-select-control');
 await click(btn('设置'));await click(btn('协作服务'));await click(btn('刷新项目和角色候选'));await popup(sel('管理项目'),'before:project');await click(sel('管理项目'));await key('ArrowDown');await key('Enter');await click(btn('读取所选项目'));for(const label of ['职责','角色成员']){await popup(sel(label),'before:'+label);await click(sel(label));await key('ArrowDown');await key('Enter');}
 await cdp('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{}); // no dialog is opened programmatically
 const dialogHandler=raw=>{const m=JSON.parse(raw);if(m.method==='Page.javascriptDialogOpening')cdp('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{})};ws.on('message',dialogHandler);await click(btn('确认角色分配'));await pause(200);const calls=await evaluate('window.rpcCalls');if(calls.filter(c=>c.payload?.action==='role').length!==1)throw Error('Expected exactly one fixture role assignment');
 for(const label of ['管理项目','职责','角色成员'])await popup(sel(label),'after-one-assignment:'+label);
 console.log(JSON.stringify({verdict:'NO_REPRO_IN_ISOLATED_BROWSER_FIXTURE',notCurrentAuthenticatedGUI:true,primitives:currentHost?'published current host modal contract + CSS; fixture connection service':'inert wrappers; not current host modal contract',fixtureRoleWrites:1,baselineSHA256:digest,signals}));
}catch(e){console.error(JSON.stringify({verdict:'ERROR_OR_RED_SEE_SIGNAL',error:e.message,signals}));process.exitCode=1;}finally{if(ws){try{ws.send(JSON.stringify({id:999999,method:'Browser.close'}))}catch{}ws.close()}chrome.kill();await new Promise(r=>server.close(r));}
