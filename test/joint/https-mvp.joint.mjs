// OFFLINE TLS proxy / two real plugins / real host Agent loop. DingTalk identity and model alone are synthetic.
import test from 'node:test';import assert from 'node:assert/strict';
import https from 'node:https';import http from 'node:http';import net from 'node:net';
import {mkdtempSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {WebSocket} from 'ws';import {QrMemberClient} from '../../src/qr-client.mjs';import {openHttps,readServiceInfo} from '../../src/https-peer.mjs';
import {LoginVault} from '../../src/login-vault.mjs';
const serverRoot=process.env.DSH_COLLABORATION_SERVER_ROOT;if(!serverRoot)throw Error('Joint only: explicitly select server checkout');
const {createTestCollaboration}=await import(pathToFileURL(join(serverRoot,'test/helpers/host.mjs')).href);
const {QrAccessService}=await import(pathToFileURL(join(serverRoot,'src/qr-service.mjs')).href);
const {AccessStore}=await import(pathToFileURL(join(serverRoot,'src/store.mjs')).href);
const {listenQrHttp}=await import(pathToFileURL(join(serverRoot,'src/qr-transport.mjs')).href);
const testCert=readFileSync(new URL('./mvp-test-cert.pem',import.meta.url)),testKey=readFileSync(new URL('./mvp-test-key.pem',import.meta.url));
const fakeCrypt=(action,input)=>action==='protect'?Buffer.from('offline-protected:'+input).toString('base64'):Buffer.from(input,'base64').toString().slice(18);
const official=userId=>({corpId:'corp',userId,unionId:'union-'+userId,internal:true,name:'Official '+userId});
function tlsRequest(url,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{
 const req=https.request(url,{method,headers,ca:testCert,servername:'mvp.example',lookup:(_host,_opts,callback)=>callback(null,[{address:'127.0.0.1',family:4}])},res=>{const parts=[];res.on('data',chunk=>parts.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(parts),json(){return JSON.parse(this.bytes.toString());}}));});req.on('error',reject);req.end(body);
});}
class TestWebSocket extends WebSocket{constructor(url,options){super(url,{...options,ca:testCert,servername:'mvp.example',lookup:(_host,_opts,callback)=>callback(null,[{address:'127.0.0.1',family:4}])});}}

test('QR MVP TLS roundtrip: two account-free clients auto-enroll, share project directory, isolate private sessions, restore secure login without model/business replay',{timeout:10000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'joint-mvp-'));let upstream;
 const proxy=https.createServer({cert:testCert,key:testKey},(req,res)=>{const forwarded=http.request({host:'127.0.0.1',port:upstream.address.port,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});forwarded.on('error',()=>{res.writeHead(502);res.end();});req.pipe(forwarded);});
 const sockets=new Set();proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 proxy.on('upgrade',(req,socket,head)=>{const remote=net.connect(upstream.address.port,'127.0.0.1',()=>{remote.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.reduce((all,value,index)=>all+(index%2?value+'\r\n':value+': '),'')}\r\n`);if(head.length)remote.write(head);remote.pipe(socket);socket.pipe(remote);});remote.on('error',()=>socket.destroy());socket.on('close',()=>remote.destroy());});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const origin=`https://mvp.example:${proxy.address().port}`;
 const collaboration=await createTestCollaboration({mode:'mvp-qr',serviceId:'joint-mvp',workspace:join(root,'workspace'),stateRoot:join(root,'state'),dingtalk:{corpId:'corp',clientId:'app',clientSecret:'synthetic',administratorUserId:'boss',agentId:'123',publicOrigin:origin}});
 const store=new AccessStore(join(root,'access.sqlite')),service=new QrAccessService({store,runtime:collaboration.runtime,cwd:collaboration.workspace,identities:collaboration.security,login:collaboration.login,projects:collaboration.services.projects});
 const login=collaboration.login;login.provider.verifyMember=async member=>official(member.user_id);
 upstream=await listenQrHttp(service,login,{port:0});const clients=[];
 const options=(id)=>{const directory=join(root,id);return {origin,serviceId:'joint-mvp',databasePath:directory+'.sqlite',openLogin:async()=>({status:'requested'}),vault:new LoginVault(directory+'.dpapi',{crypt:fakeCrypt}),connect:()=>openHttps(origin,{WebSocketClass:TestWebSocket})};};
 const create=id=>{const c=new QrMemberClient(options(id));clients.push(c);return c;};
 const post=async(path,value,cookie)=>{const response=await tlsRequest(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-collaboration-qr':'1',...cookie?{cookie}:{}},body:JSON.stringify(value)});assert.equal(response.status,200);return response;};
 const signIn=async(client,userId)=>{const started=await client.beginLogin();const bound=await post('/collaboration/qr/bind',{token:new URL(started.loginUrl).hash.slice(1)}),cookie=bound.headers['set-cookie'][0].split(';')[0],state=new URL(bound.json().authorizationUrl).searchParams.get('state');assert.equal((await client.verifyAuthStatus()).authenticated,false);login.provider.exchange=async()=>official(userId);const callback=await tlsRequest(origin+'/collaboration/oauth/callback?state='+state+'&code='+userId+'-one-use',{headers:{cookie}});assert.equal(callback.status,303);assert.equal((await client.verifyAuthStatus()).authenticated,true);};
 try{
  const info=await readServiceInfo(origin,{fetchImpl:async url=>{const r=await tlsRequest(url);return new Response(r.bytes,{status:r.status});}});assert.equal(info.serviceId,'joint-mvp');
  const a=create('a'),b=create('b');await signIn(a,'boss');await signIn(b,'member');assert.equal(a.authStatus().administrator,true);assert.equal(b.authStatus().administrator,false);
  const created=await a.management({action:'create',commandId:'one',key:'ONE',name:'Shared'}),projectId=created.project.id;assert.deepEqual((await b.projects()).map(p=>p.id),[projectId]);
  await assert.rejects(b.management({action:'role',commandId:'bad',projectId,role:'frontend',account:b.account,revision:'fake'}));
  a.selectProject('local-a',projectId);b.selectProject('local-b',projectId);
  await a.prompt('local-a',{messageId:'a1',text:'whoami'});await b.prompt('local-b',{messageId:'b1',text:'whoami'});
  const mapping=a.mapping('local-a');await assert.rejects((await b.ensureConnected()).request('collaboration/history',{sessionId:mapping.remote_id}));
  const eventsBefore=store.events(mapping.remote_id).length,identityBefore=a.account;a.close();
  const restarted=create('a');assert.equal((await restarted.verifyAuthStatus()).authenticated,true);assert.equal(restarted.account,identityBefore);await restarted.recoverAll();assert.equal(store.events(mapping.remote_id).length,eventsBefore);assert.equal(restarted.wasSubmitted('local-a','a1'),true);
  await restarted.logout();assert.equal(restarted.authStatus().authenticated,false);assert.equal((await b.verifyAuthStatus()).authenticated,true);
 }finally{for(const c of clients)if(!c.stopped)c.close();await service.close();await upstream.close();store.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy.close(resolve));}
});
