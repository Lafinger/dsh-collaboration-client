// Local subprocess fixture for stdio lifecycle only. Never starts SSH, networking or a login provider.
import {collaborationMeta}from'../../src/protocol.mjs';
const mode=process.argv[2];process.stdin.setEncoding('utf8');let buffer='';
process.stdin.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const message=JSON.parse(line);
 if(mode==='publickey'){process.stdout.end();setTimeout(()=>{process.stderr.write('fixture@offline.invalid: Permission denied (publickey).\n');process.exitCode=255;process.stdin.destroy();},25);return;}
 if(mode==='invalid-protocol'){process.stdout.write('server diagnostic token=fixture-sensitive-secret\n');return;}
 if(mode==='success'){
  if(message.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:1,_meta:collaborationMeta(),authMethods:[{id:'dingtalk-device'}]}})+'\n');
  else if(message.method==='collaboration/login/start')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{requestId:'fixture',loginUrl:'https://login.example.test/collaboration/login/11111111-1111-1111-1111-111111111111',expiresAt:Date.now()+300000}})+'\n');
  else process.exitCode=99;
 }
}});
