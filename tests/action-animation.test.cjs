const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('attack, shield and hammer atlases contain eight equal transparent frames',()=>{
  for(const kind of ['attack','guard','hammer']){
    const png=fs.readFileSync(path.join(root,'assets',`hero-${kind}.png`));
    assert.equal(png.readUInt32BE(16),1536);assert.equal(png.readUInt32BE(20),192);assert.equal(png[25],6);
  }
});
test('action poses change frames without changing their render scale or foot baseline',()=>{
  const calls=[];
  class LoadedImage{constructor(){this.complete=true;this.naturalWidth=1536;}}
  const world=vm.createContext({Image:LoadedImage,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),gatheringCorrection:()=>1,drawSprite(){},context:{save(){},restore(){},drawImage(...args){calls.push(args);}}});
  vm.runInContext(fs.readFileSync(path.join(root,'action-animation.js'),'utf8'),world);
  for(const kind of ['attack','guard','hammer']){
    calls.length=0;vm.runInContext(`for(const phase of [0,.25,.5,.75,1])drawActionHero(context,'${kind}',340,331,phase)`,world);
    assert.deepEqual(calls.map(x=>x[1]),[0,384,768,1152,1344]);
    assert.ok(calls.every(x=>Math.abs(x[6]+x[8]-331)<.001));
    assert.ok(calls.every(x=>x[7]===calls[0][7]&&x[8]===calls[0][8]));
  }
});
