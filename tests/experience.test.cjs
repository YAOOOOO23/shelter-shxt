const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

// Run the real rules and receipt recorder without the animation clock or a browser.
function game(saved){
  const storage=new Map(saved?[['shelterPrototypeV2',JSON.stringify(saved)]]:[]);
  const nodes=new Map();
  const node=selector=>{
    if(selector==='.modal.show')return null;
    if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',style:{},dataset:{},inert:false,
      classList:{add(){},remove(){}},focus(){},setAttribute(){},querySelector(){return{focus(){}};}});
    return nodes.get(selector);
  };
  const math=Object.create(Math);math.random=()=>.5;
  const context=vm.createContext({Math:math,document:{querySelector:node,querySelectorAll(){return[];}},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout(){},
    playExperience(){},animateBattle(){},paintFacilityPreviews(){},paintEvolutionSprites(){},updateActivityNotice(){},console});
  const source=['events.js','experience.js','combat.js','game.js'].map(file=>{
    const text=fs.readFileSync(path.join(root,file),'utf8');
    return file==='game.js'?text.slice(0,text.indexOf("const canvas=$('#scene')")):text;
  }).join('\n');
  vm.runInContext(source,context);
  vm.runInContext('const fullGameRender=render;render=()=>{finalizeExperience();save()}',context);
  const run=code=>vm.runInContext(code,context);
  const read=code=>JSON.parse(JSON.stringify(run(code)));
  return{run,read,html:selector=>nodes.get(selector)?.innerHTML,saved:()=>JSON.parse(storage.get('shelterPrototypeV2'))};
}

test('equipped knife evolves once: +8 power, one daily use, saved visual receipt',()=>{
  const g=game();g.run("ascendTarget('gear:'+state.gear[0].uid)");
  assert.equal(g.read('totalPower()'),43);assert.equal(g.read('state.talentUses'),0);
  const result=g.read('state.experienceHistory[0]');
  assert.deepEqual(result.changes.find(x=>x.key==='power'),{key:'power',label:'总战力',icon:'⚔',from:35,to:43});
  assert.equal(result.meta.evolution.from,'锈蚀猎刀');assert.equal(result.meta.evolution.to,'符文猎刀');
  assert.equal(g.saved().gear[0].level,1);
  g.run("ascendTarget('gear:'+state.gear[0].uid)");assert.equal(g.read('state.gear[0].level'),1);
});

test('evolving an unequipped weapon does not invent a current-power gain',()=>{
  const g=game();g.run("state.gear.push({uid:'spare',base:'staff',level:0});ascendTarget('gear:spare')");
  assert.equal(g.read('totalPower()'),35);
  assert.equal(g.read("state.experienceHistory[0].changes.some(x=>x.key==='power')"),false);
  assert.match(g.read('state.experienceHistory[0].meta.evolution.explanation'),/尚未装备/);
});

test('a duplicate material grade grants no duplicate collection power',()=>{
  const g=game();g.run("state.graded['wood:2']=1;ascendTarget('mat:wood:1:1')");
  assert.equal(g.read('totalPower()'),41);assert.equal(g.read("state.graded['wood:2']"),2);
  assert.equal(g.read('state.inventory.wood'),7);
  assert.match(g.read('state.experienceHistory[0].meta.evolution.explanation'),/不重复增加/);
});

test('ten forest actions across two days discover a usable core and blueprint',()=>{
  const g=game();g.run("for(let i=0;i<5;i++)doAction('forest');nextDay();for(let i=0;i<5;i++)doAction('forest')");
  assert.equal(g.read('state.cores.beastCore'),1);assert.equal(g.read('state.discoveredModules.length'),9);
  const result=g.read('state.experienceHistory[0]');
  assert.deepEqual(result.progress,{from:9,to:10});assert.deepEqual(result.newCores,['beastCore']);
  assert.equal(result.newBlueprints.length,1);assert.match(g.read('getNextStep().title'),/核心/);
});

test('a built collector creates exactly the water credited to it at dawn',()=>{
  const g=game();g.run("installModule('dew');nextDay()");
  assert.equal(g.read('state.inventory.water'),9);assert.equal(g.read('state.inventory.food'),5);
  const result=g.read('state.experienceHistory[0]');
  assert.deepEqual(result.meta.production.map(s=>[s.name,s.key,s.actual]),[['露水收集器','water',2]]);
  assert.equal(result.changes.find(x=>x.key==='mat:water').to-result.changes.find(x=>x.key==='mat:water').from,1);
  assert.ok(result.meta.ledger.some(x=>x.source.includes('露水收集器')&&x.effect==='水 +2'));
});

test('healing attribution respects the actual health cap',()=>{
  const g=game();g.run("state.modules=[{id:'mushroom',level:1}];state.gear.push({uid:'healer',base:'vineArmor',level:0});state.equipped.护甲='healer';state.hp=98;nextDay()");
  assert.equal(g.read('state.hp'),100);
  const sources=g.read("state.experienceHistory[0].meta.production.filter(s=>s.key==='heal')");
  assert.equal(sources.reduce((n,s)=>n+s.actual,0),2);assert.equal(sources[1].actual,0);
});

test('fractional core boosts are rounded once and accurately allocated to sources',()=>{
  const g=game();g.run("state.modules=[{id:'dew',level:1},{id:'resonance',level:1}];state.coreSlots=['springCore','springCore'];nextDay()");
  const sources=g.read("state.experienceHistory[0].meta.production.filter(s=>s.key==='water')");
  assert.equal(sources.reduce((n,s)=>n+s.actual,0),7);
  assert.equal(g.read('state.inventory.water'),14);
});

test('disaster forecast matches actual damage and a destroyed shelter ends the run',()=>{
  const g=game();g.run('state.day=4;state.shelter.hp=14');
  assert.equal(g.read('nextDisaster().damage'),15);assert.equal(g.read('getNextStep().urgent'),true);
  g.run('nextDay()');assert.equal(g.read('state.gameOver'),true);
  const result=g.read('state.experienceHistory[0]');
  assert.equal(result.meta.disaster.damage,14);assert.equal(result.changes.find(c=>c.key==='shelter').to,0);
});

test('repair feedback reports capped restoration and the true resource cost',()=>{
  const g=game();g.run('state.shelter.hp=98;repairShelter()');
  const result=g.read('state.experienceHistory[0]');
  assert.equal(result.changes.find(c=>c.key==='shelter').to-result.changes.find(c=>c.key==='shelter').from,2);
  assert.equal(g.read('state.inventory.wood'),7);assert.equal(g.read('state.inventory.food'),5);
});

test('nearest hidden reward uses progress modulo ten, not largest lifetime count',()=>{
  const g=game();g.run('state.explores={creek:9,forest:10,ruins:3,route:0}');
  assert.equal(g.read('closestExploration()'),'creek');
});

test('route choice cannot switch or exceed level ten; level three unlocks its area',()=>{
  const g=game();g.run("state.cores={beastCore:1,mountainCore:1};state.inventory.wood=1000;state.inventory.stone=1000;state.inventory.food=1000;upgradeShelter('beast');upgradeShelter('stone');upgradeShelter('beast');upgradeShelter('beast')");
  assert.equal(g.read('state.shelter.route'),'beast');assert.equal(g.read('state.shelter.level'),3);
  g.run("doAction('route')");assert.equal(g.read('state.routeUses'),1);
  g.run("state.shelter.level=10;upgradeShelter('beast')");assert.equal(g.read('state.shelter.level'),10);
});

test('even a stronger player chooses actions before a battle can award loot',()=>{
  const g=game();g.run("beginExperience('explore',{area:'forest'});state.actions--;startBattle('forest',WORLD_EVENTS.forest.danger[0],[])");
  assert.equal(g.read('pendingBattle.resolved'),false);assert.equal(g.read('state.experienceHistory.length'),0);assert.equal(g.read('state.hp'),100);
  g.run("performCombatAction('heavy');if(!pendingBattle.resolved)performCombatAction('attack')");
  const result=g.read('state.experienceHistory[0]');
  assert.equal(result.meta.battle.power,35);assert.equal(result.meta.battle.threshold,30);assert.equal(result.meta.battle.manual,true);
  assert.ok(result.meta.battle.rounds>=1);assert.equal(g.read('pendingBattle.resolved'),true);
});

test('missing honey never advances the round or weakens an enemy',()=>{
  const g=game();g.run("state.inventory.honey=0;beginExperience('explore',{area:'ruins'});startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[])");
  assert.equal(g.read("performCombatAction('honey')"),false);
  assert.equal(g.read('pendingBattle.threshold'),145);assert.equal(g.read('pendingBattle.round'),1);
  g.run("performCombatAction('retreat')");assert.equal(g.read('pendingBattle.resolved'),true);
});

test('old V2 saves load new presentation defaults; saved history survives reload',()=>{
  const g=game();g.run("doAction('creek')");const saved=g.saved();
  assert.equal(game(saved).read('state.experienceHistory.length'),1);
  delete saved.experienceHistory;delete saved.experienceSeen;delete saved.feedbackPrefs;
  const old=game(saved);assert.equal(old.read('state.experienceHistory.length'),0);assert.equal(old.read('state.feedbackPrefs.fast'),false);
});

test('milestones refresh uses and day 101 displays the hundred-day victory',()=>{
  const g=game();g.run('state.day=24;nextDay()');assert.equal(g.read('state.talentUses'),2);
  g.run('state.day=99;state.shelter.hp=100;nextDay()');assert.equal(g.read('state.gameOver'),false);
  g.run('nextDay()');assert.equal(g.read('state.gameOver'),true);assert.match(g.read('state.story.kicker'),/百日通关/);
});

test('combat source breakdown reconciles equipped gear, collections, modules, cores and route bonuses',()=>{
  const g=game();g.run("state.modules=[{id:'reactor',level:2},{id:'resonance',level:1},{id:'traps',level:2}];state.coreSlots=['magmaCore','frostCore'];state.shelter.route='frost';state.shelter.level=3;state.hp=20;state.graded['wood:3']=1;state.gear.push({uid:'cape',base:'frostCape',level:1});state.equipped.护甲='cape'");
  const feedback=g.read('combatFeedback(100)');
  assert.equal(feedback.powers.reduce((sum,x)=>sum+x.value,0),g.read('totalPower()'));
  assert.ok(feedback.powers.some(x=>x.name.includes('低生命')&&x.value===18));
  assert.ok(Math.abs(feedback.threshold.reduce((sum,x)=>sum+x.value,0)-g.read('aggregate().threshold+routeThresholdBonus()'))<1e-9);
  assert.ok(feedback.threshold.some(x=>x.name==='捕兽陷阱阵'&&x.value===.12));
});

test('a battle preserves the recent upgrade that contributed to its outcome',()=>{
  const g=game();g.run("ascendTarget('gear:'+state.gear[0].uid);beginExperience('explore',{area:'forest'});startBattle('forest',WORLD_EVENTS.forest.danger[0],[]);performCombatAction('heavy');if(!pendingBattle.resolved)performCombatAction('attack')");
  const battle=g.read('state.experienceHistory[0].meta.battle');
  assert.equal(battle.feedback.growth.from,35);assert.equal(battle.feedback.growth.to,43);
  assert.equal(battle.feedback.powers.find(x=>x.name==='符文猎刀').value,16);
  assert.equal(battle.feedback.rawThreshold,30);
});

test('honey and armour are attributed only when they actually affect the battle',()=>{
  const g=game();g.run("state.gear.push({uid:'armour',base:'stoneArmor',level:0});state.equipped.护甲='armour';beginExperience('explore',{area:'ruins'});startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[]);pendingBattle.pattern=['attack'];performCombatAction('honey');performCombatAction('attack');if(!pendingBattle.resolved)performCombatAction('retreat')");
  const battle=g.read('state.experienceHistory[0].meta.battle');
  assert.equal(battle.feedback.honey,true);assert.equal(battle.feedback.rawThreshold,145);assert.equal(battle.threshold,116);
  assert.deepEqual(battle.feedback.usedDamageReduce,[{name:'石壳甲',value:.08}]);
});

test('exhausted actions never recommend another collection action or an impossible night',()=>{
  const g=game();g.run('state.actions=0;state.talentUses=0;state.experienceSeen={explore:true,ascend:true};state.inventory.wood=0;state.inventory.stone=0');
  assert.equal(g.read('getNextStep().go'),'night');
  g.run('state.inventory.water=1');assert.equal(g.read('getNextStep().go'),'night');
  g.run('state.inventory.water=0');assert.equal(g.read('getNextStep().go'),'history');assert.equal(g.read('getNextStep().urgent'),true);
});

test('reaching shelter level three records its newly unlocked area exactly once',()=>{
  const g=game();g.run("state.cores.springCore=1;state.inventory.wood=200;state.inventory.stone=200;state.inventory.water=200;upgradeShelter('water');upgradeShelter('water');upgradeShelter('water')");
  assert.equal(g.read('state.experienceHistory[0].meta.unlockedArea'),true);
  g.run("upgradeShelter('water')");assert.equal(g.read('state.experienceHistory[0].meta.unlockedArea'),false);
});

test('next-step recommendations respect the separate three-use route limit',()=>{
  const g=game();g.run("state.shelter.route='water';state.shelter.level=3;state.routeUses=3;state.explores.route=9;state.modules=[{id:'dew',level:1}];state.experienceSeen={explore:true,ascend:true}");
  assert.notEqual(g.read('getNextStep().go'),'explore:route');
  assert.equal(g.read('closestExploration()'),'route','the progress overview may still display its saved milestone');
});

test('facility output keeps the actual dawn yield when its level changes later that day',()=>{
  const g=game();g.run("state.inventory.wood=100;state.inventory.stone=100;installModule('dew');nextDay();upgradeModule('dew')");
  assert.equal(g.read("facilityProductionText('dew')"),'今日清晨：水 +2');
  assert.equal(g.read("moduleUpgradeCost(state.modules[0]).wood"),9);
  g.run('nextDay()');assert.equal(g.read("facilityProductionText('dew')"),'今日清晨：水 +4');
});

test('the first dawn updates installed-facility yield immediately, without a second action or reload',()=>{
  const g=game();g.run("render=fullGameRender;installModule('dew');nextDay()");
  assert.match(g.html('#installedModules'),/今日清晨：水 \+2/);
  assert.match(g.html('#campFacilities'),/今日清晨：水 \+2/);
});

test('manual combat blocks exploration and sleeping while idle turns never inflict passive damage',()=>{
  const g=game();g.run("startBattle('forest',WORLD_EVENTS.forest.danger[0],[])");
  const before=g.read('[state.actions,state.hp,state.day,state.inventory]');
  g.run("doAction('creek');nextDay();repairShelter()");assert.deepEqual(g.read('[state.actions,state.hp,state.day,state.inventory]'),before);
  assert.equal(g.read('pendingBattle.round'),1);assert.equal(g.read('state.experienceHistory.length'),0);
});

test('a heavy strike spends stamina and interrupts a charging enemy before its heavy attack',()=>{
  const g=game();g.run("startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[]);pendingBattle.pattern=['charge','heavy','attack'];pendingBattle.intentIndex=0;performCombatAction('heavy')");
  assert.equal(g.read('pendingBattle.stamina'),1);assert.equal(g.read('state.hp'),100);
  assert.equal(g.read('combatIntent().type'),'attack');assert.equal(g.read('pendingBattle.turns[0].interrupted'),true);
  assert.equal(g.read("performCombatAction('heavy')"),false);assert.equal(g.read('pendingBattle.round'),2);
});

test('defending reduces actual damage, restores stamina and grants one non-stacking empowered strike',()=>{
  const g=game();g.run("startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[]);pendingBattle.pattern=['attack'];pendingBattle.stamina=0");
  const incoming=g.read('combatIncomingDamage()'),strike=g.read("combatStrikeDamage('attack')");
  g.run("performCombatAction('guard')");assert.equal(g.read('100-state.hp'),Math.floor(incoming*.2));assert.equal(g.read('pendingBattle.stamina'),2);
  assert.equal(g.read("combatStrikeDamage('attack')"),Math.round(strike*1.35));
  g.run("performCombatAction('guard')");assert.equal(g.read("combatStrikeDamage('attack')"),Math.round(strike*1.35));
  g.run("performCombatAction('attack')");assert.equal(g.read('pendingBattle.focus'),0);assert.equal(g.read('pendingBattle.stamina'),3);
});

test('enemy guard reduces light damage while heavy attacks penetrate it',()=>{
  const g=game();g.run("startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[]);pendingBattle.pattern=['guard']");
  assert.equal(g.read("combatStrikeDamage('attack')"),Math.round(Math.round(35*.55)*.45));
  assert.equal(g.read("combatStrikeDamage('heavy')"),Math.round(Math.round(35*.55)*1.75));
});

test('honey is consumed once per battle and prevents that turn of enemy damage',()=>{
  const g=game();g.run("startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[]);pendingBattle.pattern=['heavy'];performCombatAction('honey')");
  assert.equal(g.read('state.hp'),100);assert.equal(g.read('state.inventory.honey'),0);assert.equal(g.read('pendingBattle.threshold'),116);
  assert.equal(g.read("performCombatAction('honey')"),false);assert.equal(g.read('pendingBattle.round'),2);
});

test('healing pays the displayed supplies, caps recovery, and still allows the telegraphed enemy action',()=>{
  const g=game();g.run("state.hp=90;startBattle('forest',WORLD_EVENTS.forest.danger[0],[]);pendingBattle.pattern=['charge'];performCombatAction('heal')");
  assert.equal(g.read('state.hp'),100);assert.equal(g.read('state.inventory.food'),4);assert.equal(g.read('state.inventory.water'),7);
  assert.equal(g.read('pendingBattle.turns[0].healed'),10);assert.equal(g.read("performCombatAction('heal')"),false);
});

test('an animation lock rejects repeated input, and reload resumes the saved turn without replaying damage',()=>{
  const g=game();g.run("performance={now:()=>100};motionReduced=()=>false;clearTimeout=()=>{};startBattle('ruins',WORLD_EVENTS.ruins.danger[4],[]);pendingBattle.pattern=['attack'];performCombatAction('attack')");
  const after=g.read('[pendingBattle.round,pendingBattle.enemyHp,state.hp]');
  assert.equal(g.read("performCombatAction('attack')"),false);assert.deepEqual(g.read('[pendingBattle.round,pendingBattle.enemyHp,state.hp]'),after);
  const reloaded=game(g.saved());reloaded.run('restoreCombat()');
  assert.equal(reloaded.read('pendingBattle.phase'),'input');assert.deepEqual(reloaded.read('[pendingBattle.round,pendingBattle.enemyHp,state.hp]'),after);
});

test('victory rewards and its exploration receipt survive reload and can only be granted once',()=>{
  const g=game();g.run("state.basePower=500;beginExperience('explore',{area:'forest'});state.actions--;addMat('wood',6);startBattle('forest',WORLD_EVENTS.forest.danger[0],['木材×6'])");
  const resumed=game(g.saved());resumed.run("restoreCombat();performCombatAction('attack')");
  assert.equal(resumed.read('state.experienceHistory.length'),1);assert.equal(resumed.read('state.actions'),4);
  const rewards=resumed.read('state.inventory');assert.equal(resumed.read("performCombatAction('attack')"),false);
  const finished=game(resumed.saved());finished.run("restoreCombat();closeCombat();closeCombat()");
  assert.deepEqual(finished.read('state.inventory'),rewards);assert.equal(finished.read('state.experienceHistory.length'),1);assert.equal(finished.read('state.combat'),null);
});

test('defeat returns with one life, retaining base exploration supplies without battle loot',()=>{
  const g=game();g.run("state.hp=3;beginExperience('explore',{area:'ruins'});state.actions--;addMat('stone',6);startBattle('ruins',WORLD_EVENTS.ruins.danger[4],['石材×6']);pendingBattle.pattern=['heavy'];performCombatAction('attack')");
  assert.equal(g.read('state.hp'),1);assert.equal(g.read('pendingBattle.outcome'),'defeat');assert.equal(g.read('state.inventory.stone'),11);assert.equal(g.read('state.inventory.iron'),0);
  assert.equal(g.read('state.experienceHistory[0].meta.battle.mode'),'defeat');
});

test('practice uses virtual health and supplies and never changes the real inventory, actions or reward history',()=>{
  const g=game(),before=g.read('[state.hp,state.actions,state.inventory]');
  g.run("startPracticeBattle();pendingBattle.pattern=['attack'];performCombatAction('guard');performCombatAction('honey');performCombatAction('heal');performCombatAction('retreat');closeCombat()");
  assert.deepEqual(g.read('[state.hp,state.actions,state.inventory]'),before);assert.equal(g.read('state.experienceHistory.length'),0);assert.equal(g.read('state.combat'),null);
});

test('full UI rendering finalizes one combat receipt and clears the arena on returning to camp',()=>{
  const g=game();g.run("render=fullGameRender;state.basePower=500;startBattle('forest',WORLD_EVENTS.forest.danger[0],[]);performCombatAction('attack')");
  assert.equal(g.read('state.experienceHistory.length'),1);assert.equal(g.read('state.experienceHistory[0].meta.battle.manual'),true);
  assert.match(g.html('#combatPanel'),/返回营地/);g.run('closeCombat()');assert.equal(g.read('state.combat'),null);
});
