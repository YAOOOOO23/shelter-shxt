const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function renderer(){
  const draws=[],transforms=[];
  const context={canvas:{id:'scene',width:900,height:380,clientWidth:900,clientHeight:380},
    save(){transforms.push('save');},restore(){transforms.push('restore');},
    translate(...args){transforms.push(['translate',...args]);},scale(...args){transforms.push(['scale',...args]);},
    drawImage(...args){draws.push(args);}};
  class LoadedImage{constructor(){this.complete=true;this.naturalWidth=1448;this.naturalHeight=1086;}}
  const world=vm.createContext({Image:LoadedImage,window:{matchMedia:()=>({matches:false,addEventListener(){}})},context});
  vm.runInContext(fs.readFileSync(path.join(root,'scene.js'),'utf8'),world);
  return{draws,transforms,run:source=>vm.runInContext(source,world)};
}

test('shipped walk atlas has eight equal transparent 96px frames',()=>{
  const png=fs.readFileSync(path.join(root,'assets','hero-walk.png'));
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),768);assert.equal(png.readUInt32BE(20),96);
  assert.equal(png[25],6,'PNG must retain RGBA transparency');
});

test('moving through a stride changes leg poses while keeping every foot baseline fixed',()=>{
  const r=renderer();
  r.run('for(const distance of [0,24,48,72,96])drawWalkingHero(context,425,331,distance)');
  assert.deepEqual(r.draws.map(call=>call[1]),[0,192,384,576,0]);
  assert.ok(r.draws.every(call=>call[6]+call[8]===331),'no whole-sprite vertical bob may lift planted feet');
  assert.ok(r.draws.every(call=>call[5]===380&&call[7]===90));
});

test('standing at the same distance cannot advance the walk animation',()=>{
  const r=renderer();r.run('drawWalkingHero(context,425,331,36);drawWalkingHero(context,425,331,36)');
  assert.deepEqual(r.draws[0].slice(1),r.draws[1].slice(1));
});

test('night presentation reserves readable time per source and a separate disaster phase',()=>{
  const r=renderer(),timing=r.run("nightPresentationTiming({meta:{production:Array(6).fill({}),disaster:{}}})");
  assert.ok(Math.abs((timing.productionEnd-timing.productionStart)*timing.duration/6-850)<.001);
  assert.ok(Math.abs((1-timing.productionEnd)*timing.duration-1800)<.001);
});

test('returning mirrors the whole gait without leaking a transform to the next draw',()=>{
  const r=renderer();r.run('drawWalkingHero(context,500,331,24,true);drawWalkingHero(context,500,331,24,false)');
  assert.deepEqual(r.transforms,['save',['translate',1000,0],['scale',-1,1],'restore','save','restore']);
  assert.equal(r.draws[0][1],r.draws[1][1]);
});

test('an unloaded walk atlas falls back safely and switches to animated poses when ready',()=>{
  const r=renderer();r.run('worldArt.walk.complete=false;drawWalkingHero(context,425,331,24);worldArt.walk.complete=true;drawWalkingHero(context,425,331,24)');
  assert.equal(r.draws[0][1],404,'fallback uses the existing approved walk sprite');
  assert.equal(r.draws[1][1],192,'loaded atlas uses the actual next leg pose');
});
