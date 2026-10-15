// OFFLINE test seam: the pinned official DSH registry selects and serves the package's declared browser export.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {createTestPrimitives} from './official-ui.mjs';
import {Context} from '@deepseek-ai/cordis';
import {ClientModuleRegistry} from '@deepseek-ai/dsh-client-modules';
const require=createRequire(import.meta.url);

export async function loadBrowserThroughDsh(packageRoot,{react={createElement:()=>null},primitives=createTestPrimitives()}={}){
  const manifest=JSON.parse(readFileSync(resolve(packageRoot,'package.json'),'utf8'));
  const host=new Context();
  const entry={options:{name:manifest.name},fiber:{},disabled:false,parent:{tree:{ctx:{baseUrl:pathToFileURL(resolve(packageRoot,'package.json')).href}}}};
  // No server, user profile, platform credentials, browser cookie, SSH, models or business store.
  host.provide('loader',{entries:()=>[entry]});
  const fiber=host.plugin(ClientModuleRegistry);
  try{
    await fiber.await();
    const registry=fiber.ctx.get('clientModules'),graph=registry.graph();
    assert.equal(graph.entries.length,1);assert.equal(graph.entries[0].id,manifest.name);
    const response=await registry.fetchBundle(new Request('https://offline.invalid/'+graph.entries[0].url));
    assert.equal(response.status,200);
    const source=await response.text();
    const target={mode:'queue',pendingQueue:[],load(registration){this.pendingQueue.push(registration);}};
    const windowFacade={__ModuleLoader__:target};if(globalThis.window)for(const key of ['innerWidth','innerHeight'])windowFacade[key]=globalThis.window[key];
    if(globalThis.window)for(const key of ['addEventListener','removeEventListener'])windowFacade[key]=globalThis.window[key].bind(globalThis.window);
    const context=vm.createContext({window:windowFacade,document:globalThis.document,Date,queueMicrotask,setTimeout,clearTimeout,crypto:globalThis.crypto,confirm:globalThis.confirm});
    // Use the official browser module system, not an ad-hoc require/module substitute.
    let bootstrap;
    const coreManifest=require.resolve('@deepseek-ai/dsh-client-modules/package.json');
    const coreSource=readFileSync(resolve(dirname(coreManifest),'lib/client.js'),'utf8');
    new vm.Script(coreSource,{filename:'dsh-client-modules/client.js'}).runInNewContext({window:{__ModuleLoader__:{load(registration){bootstrap=registration;}}}});
    assert.ok(bootstrap);
    const core=bootstrap.factory(name=>{throw new Error('Unexpected bootstrap external '+name);});
    const fetchedUrls=[];
    const modules=core.createClientModuleSystem(target,{id:bootstrap.id,exports:core},{boot:graph,staticModules:{react,'react-dom':require('react-dom'),'@deepseek-ai/dsh-client-ui-primitives':primitives},loadBundle:async url=>{
      fetchedUrls.push(url);
      const served=await registry.fetchBundle(new Request(new URL(url,'https://offline.invalid/')));assert.equal(served.status,200);
      new vm.Script(await served.text(),{filename:manifest.name+'/client.js'}).runInContext(context);
    }});
    const browser=await modules.import(manifest.name+'/client');
    assert.equal(typeof browser.apply,'function');assert.equal(typeof browser.CollaborationPanel,'function');
    assert.equal(fetchedUrls.length,1,'Official initial-load combo must arrive without failed-import fallback');
    return {browser,source,graph,clientPath:registry.clientPath(manifest.name),modules};
  }finally{await fiber.dispose();await host.fiber.dispose();}
}
