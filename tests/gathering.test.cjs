const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function renderer(){
  const draws=[];
  class LoadedImage{constructor(){this.complete=true;this.naturalWidth=1024;this.naturalHeight=256;}}
  const context={canvas:{id:'scene',width:900,height:380,clientWidth:900,clientHeight:380},save(){},restore(){},drawImage(...args){draws.push(args);}};
  const world=vm.createContext({Image:LoadedImage,context,drawSprite(){}});
  vm.runInContext(fs.readFileSync(path.join(root,'gathering.js'),'utf8'),world);
  return{draws,run:source=>vm.runInContext(source,world)};
}
test('all three work atlases ship eight transparent frames plus the matching target atlas',()=>{
  for(const name of ['hero-chop','hero-mine','hero-water','gather-targets']){
    const png=fs.readFileSync(path.join(root,'assets',name+'.png'));
    assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),name==='gather-targets'?256:128);assert.equal(png[25],6);
  }
});
test('regions select the correct gathering tool, while food-only routes never depict chopping',()=>{
  const r=renderer();
  assert.equal(r.run("gatheringActionFor('creek')"),'water');assert.equal(r.run("gatheringActionFor('forest')"),'chop');assert.equal(r.run("gatheringActionFor('ruins')"),'mine');
  assert.equal(r.run("gatheringActionFor('route','ancient')"),'chop');assert.equal(r.run("gatheringActionFor('route','machine')"),'mine');assert.equal(r.run("gatheringActionFor('route','beast')"),null);
});
test('each work cycle changes tool poses without lifting the foot anchor or resizing the body',()=>{
  for(const kind of ['chop','mine','water']){
    const r=renderer();r.run(`for(const time of [0,250,500,750,1000])drawGatheringHero(context,'${kind}',340,331,time)`);
    assert.deepEqual(r.draws.map(call=>call[1]),[0,256,512,768,0]);
    assert.ok(r.draws.every(call=>Math.abs(call[6]+call[8]-331)<.001));
    assert.ok(r.draws.every(call=>call[7]===r.draws[0][7]&&call[8]===r.draws[0][8]));
  }
});
test('2x presentation speed advances work poses at 2x without changing gameplay or size',()=>{
  const r=renderer();r.run("drawGatheringHero(context,'mine',340,331,250,1);drawGatheringHero(context,'mine',340,331,125,2)");
  assert.deepEqual(r.draws[0].slice(1),r.draws[1].slice(1));
});
test('unknown gathering kinds and page hashes fall back safely',()=>{
  const r=renderer();assert.equal(r.run("gatheringFrameAtTime('unknown',1000)"),0);
  const code=fs.readFileSync(path.join(root,'navigation.js'),'utf8'),world=vm.createContext({window:{location:{hash:'#not-a-game-page'}}});vm.runInContext(code,world);
  assert.equal(vm.runInContext('gamePageFromHash()',world),'explore');
});
