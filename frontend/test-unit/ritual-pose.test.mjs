import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../components/peace-room/ritual-pose.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ritualPose}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('Catholic sign touches forehead, chest, actor left then actor right at feedback cues',()=>{
 for(const [time,step,point] of [[500,'forehead',[0,2.15,.34]],[1300,'chest',[0,1.24,.42]],[2100,'left-shoulder',[.43,1.4,.22]],[2900,'right-shoulder',[-.43,1.4,.22]]]){
  const pose=ritualPose('cross',time);assert.equal(pose.step,step);pose.right.forEach((n,i)=>assert.ok(Math.abs(n-point[i])<1e-10));
 }
 const end=ritualPose('cross',4000);assert.equal(end.step,'rest');assert.ok(end.right[0]<0&&end.left[0]>0);assert.deepEqual(ritualPose('cross',100,true),end);
});
test('different practices have distinct meaningful poses and reduced motion stays stable',()=>{
 assert.equal(ritualPose('dua',500).palmUp,true);assert.equal(ritualPose('prayer',500).palmUp,false);assert.ok(ritualPose('bow',1250).bow>ritualPose('prayer',1250).bow);
 assert.notDeepEqual(ritualPose('beads',300).right,ritualPose('beads',700).right);assert.deepEqual(ritualPose('beads',300,true),ritualPose('beads',700,true));
 assert.ok(ritualPose('stone',650).right[1]<ritualPose('stone',1400).right[1]);assert.equal(ritualPose('beads',300,false,5).step,'bead-5');
});
