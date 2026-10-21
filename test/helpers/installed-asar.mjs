// Optional read-only installed-host probe; never extracts an archive or reads profiles.
import {openSync,readSync,closeSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function readAsarMember(archive,member){
 const parts=member.replaceAll('\\','/').split('/');if(parts.some(part=>!part||part==='.'||part==='..'))throw Error('Explicit ASAR member required');
 const fd=openSync(archive,'r');
 try{
  const prefix=Buffer.alloc(16);if(readSync(fd,prefix,0,16,0)!==16)throw Error('Incomplete ASAR prefix');
  const headerSize=prefix.readUInt32LE(4),jsonSize=prefix.readUInt32LE(12);if(jsonSize>64*1024*1024||headerSize<jsonSize)throw Error('Invalid ASAR header');
  const json=Buffer.alloc(jsonSize);if(readSync(fd,json,0,jsonSize,16)!==jsonSize)throw Error('Incomplete ASAR header');
  const header=JSON.parse(json.toString('utf8'));let node=header;
  for(const part of parts){node=node.files?.[part];if(!node)throw Error('ASAR member unavailable: '+member);}
  if(node.link)throw Error('ASAR links are not followed');if(!Number.isSafeInteger(node.size)||node.size>16*1024*1024)throw Error('Bounded text member required');
  if(node.unpacked)return readFileSync(resolve(archive+'.unpacked',...parts),'utf8');
  const offset=8+headerSize+Number(node.offset);if(!Number.isSafeInteger(offset))throw Error('Invalid ASAR offset');
  const bytes=Buffer.alloc(node.size);if(readSync(fd,bytes,0,node.size,offset)!==node.size)throw Error('Incomplete ASAR member');return bytes.toString('utf8');
 }finally{closeSync(fd);}
}
