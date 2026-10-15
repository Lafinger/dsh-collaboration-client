import test from'node:test';import assert from'node:assert/strict';import{parsePackageTar}from'../scripts/package-archive.mjs';
function block(name,body=Buffer.alloc(0),type='0'){
 const header=Buffer.alloc(512);header.write(name,0,100);header.write(body.length.toString(8).padStart(11,'0')+'\0',124,12);header.write(type,156,1);header.fill(32,148,156);const checksum=header.reduce((sum,value)=>sum+value,0);header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148,8);
 return Buffer.concat([header,body,Buffer.alloc((512-body.length%512)%512)]);
}
function pax(key,value){const entry=key+'='+value+'\n';let size=Buffer.byteLength(entry)+2;while(true){const row=size+' '+entry,next=Buffer.byteLength(row);if(next===size)return Buffer.from(row);size=next;}}
const archive=(...parts)=>Buffer.concat([...parts,Buffer.alloc(1024)]);
test('package archive parser honors byte-sized PAX paths for Unicode and long names instead of extracting PaxHeader',()=>{
 const path='package/docs/设计确认-自动发现与设置.md',body=Buffer.from('fixture');const entries=parsePackageTar(archive(block('package/plain.txt',body),block('PaxHeader',pax('path',path),'x'),block('PaxHeader',body)));
 assert.equal(entries.get('docs/设计确认-自动发现与设置.md').toString(),'fixture');assert.equal(entries.size,2);
});
test('PAX cannot bypass package root, traversal, duplicates or link rejection; malformed lengths fail closed',()=>{
 for(const path of ['../outside','package/../outside','package/C:\\outside','/package/outside'])assert.throws(()=>parsePackageTar(archive(block('PaxHeader',pax('path',path),'x'),block('PaxHeader',Buffer.from('x')))),/Unsafe tar entry/);
 assert.throws(()=>parsePackageTar(archive(block('package/x',Buffer.alloc(0),'2'))),/Unsupported tar/);
 assert.throws(()=>parsePackageTar(archive(block('package/x'),block('package/x'))),/Duplicate/);
 assert.throws(()=>parsePackageTar(archive(block('PaxHeader',Buffer.from('999 path=package/x\n'),'x'))),/PAX/);
});
