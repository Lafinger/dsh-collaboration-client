import assert from'node:assert/strict';
const field=(block,start,length)=>block.subarray(start,start+length).toString('utf8').replace(/\0.*$/s,'');
function paxFields(body){
 const values={};let offset=0;
 while(offset<body.length){const space=body.indexOf(32,offset);assert.ok(space>offset,'Invalid PAX length');const lengthText=body.subarray(offset,space).toString('ascii');assert.match(lengthText,/^\d+$/,'Invalid PAX length');const size=Number(lengthText),end=offset+size;assert.ok(Number.isSafeInteger(size)&&end<=body.length&&end>space+1&&body[end-1]===10,'Invalid PAX record');const row=body.subarray(space+1,end-1).toString('utf8'),equals=row.indexOf('=');assert.ok(equals>0,'Invalid PAX field');values[row.slice(0,equals)]=row.slice(equals+1);offset=end;}
 return values;
}
/** Read regular package files only; PAX names do not bypass the same path/link checks. */
export function parsePackageTar(tar){
 const entries=new Map();let offset=0,globalPax={},localPax={};
 while(offset+512<=tar.length){
  const block=tar.subarray(offset,offset+512);if(block.every(value=>value===0))break;
  const rawName=field(block,0,100),prefix=field(block,345,155),type=field(block,156,1)||'0';offset+=512;
  const sizeText=field(block,124,12).trim();assert.match(sizeText,/^[0-7]+$/,'Invalid tar length');let size=parseInt(sizeText,8);
  const checksum=parseInt(field(block,148,8).trim(),8),sum=block.reduce((value,byte,index)=>value+(index>=148&&index<156?32:byte),0);assert.equal(checksum,sum,'Invalid tar checksum');
  const pax={...globalPax,...localPax};if(!['x','g'].includes(type)&&pax.size!==undefined){assert.match(pax.size,/^\d+$/,'Invalid PAX size');size=Number(pax.size);}
  assert.ok(Number.isSafeInteger(size)&&size>=0&&offset+size<=tar.length,'Invalid archive length');const body=tar.subarray(offset,offset+size);offset+=Math.ceil(size/512)*512;
  if(type==='x'){localPax={...localPax,...paxFields(body)};continue;}if(type==='g'){globalPax={...globalPax,...paxFields(body)};continue;}
  const filename=pax.path??((prefix?prefix+'/':'')+rawName);localPax={};
  assert.ok(filename.startsWith('package/')&&!filename.includes('\\')&&!filename.includes('\0')&&!filename.split('/').includes('..'),'Unsafe tar entry: '+JSON.stringify(filename));
  assert.ok(!pax.linkpath,'Unsupported tar link');if(type==='5')continue;assert.equal(type,'0','Unsupported tar entry '+type);
  const name=filename.slice(8);assert.ok(name&&!entries.has(name),'Duplicate or empty package entry '+name);entries.set(name,Buffer.from(body));
 }
 return entries;
}
