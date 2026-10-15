import {WebSocket} from 'ws';
import {PassThrough} from 'node:stream';
import {JsonPeer,AccessError} from './protocol.mjs';

export function trustedOrigin(value){
 let url;try{url=new URL(value);}catch{throw new AccessError(-32602,'请输入有效HTTPS服务地址');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new AccessError(-32602,'服务地址必须为可信HTTPS origin，不含账号、路径或参数');return url.origin;
}
export async function readServiceInfo(origin,{fetchImpl=fetch}={}){
 origin=trustedOrigin(origin);let response;
 try{response=await fetchImpl(origin+'/collaboration/info',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});}catch{throw new AccessError(-32001,'无法连接协作HTTPS入口，请核对网络、域名与证书');}
 if(!response.ok)throw new AccessError(-32011,'协作服务入口不可用或版本不匹配');
 let size=0,parts=[];for await(const chunk of response.body){size+=chunk.length;if(size>8192)throw new AccessError(-32011,'服务信息超限');parts.push(chunk);}
 let info;try{info=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new AccessError(-32011,'服务信息不是预期JSON');}
 if(info.origin!==origin||info.mvpHttpsVersion!==1||info.loginMethod!=='dingtalk-pc'||info.protocolVersion!==3||typeof info.serviceId!=='string'||!info.serviceId.trim()||info.serviceId.length>200)throw new AccessError(-32011,'服务身份或双端MVP版本不匹配，不回退SSH');return info;
}
export async function openHttps(origin,{WebSocketClass=WebSocket}={}){
 origin=trustedOrigin(origin);const url=new URL('/collaboration/socket',origin);url.protocol='wss:';
 const ws=new WebSocketClass(url,{handshakeTimeout:10000,maxPayload:1024*1024,perMessageDeflate:false,followRedirects:false});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',()=>reject(new AccessError(-32001,'协作HTTPS连接失败，请核对网络／证书／服务版本')));ws.once('close',()=>reject(new AccessError(-32001,'协作HTTPS握手提前结束')));ws.once('unexpected-response',(_r,response)=>{response.destroy();reject(new AccessError(-32001,'服务器拒绝协作连接'));});});
 const input=new PassThrough(),output=new PassThrough();
 output.on('data',chunk=>{if(ws.readyState!==1||ws.bufferedAmount>4*1024*1024){ws.terminate();return;}ws.send(chunk.toString('utf8'),{binary:false});});
 ws.on('message',(data,binary)=>{if(binary){ws.close(1003);return;}if(input.writableLength>4*1024*1024){ws.terminate();return;}input.write(data);});ws.on('close',()=>input.destroy());ws.on('error',()=>input.destroy());
 input.on('close',()=>{if(ws.readyState<2)ws.close();});output.on('close',()=>{if(ws.readyState<2)ws.close();});
 return new JsonPeer(input,output);
}
