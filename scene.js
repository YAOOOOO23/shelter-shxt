// Local pixel-art atlases provide the world, characters and their walk cycle.
const worldArt={biomes:new Image(),sprites:new Image(),enemies:new Image(),walk:new Image()};
worldArt.biomes.src='assets/biomes.png';
worldArt.sprites.src='assets/sprites.png';
worldArt.enemies.src='assets/enemies.png';
worldArt.walk.src='assets/hero-walk.png';
const EXPLORATION_TIMING={departEnd:.28,returnStart:.73};
const WALK_ANIMATION={frames:8,size:96,stride:96,height:90,travel:144};
const spriteRects={
  shelter0:[0,140,362,246],shelter1:[362,60,362,326],shelter2:[724,45,362,341],shelter3:[1086,0,362,386],
  hero:[60,418,240,288],walk:[404,417,255,289],collect:[752,455,272,251],evolved:[1100,396,348,310],
  water:[24,752,318,316],food:[377,752,320,316],forge:[724,752,350,316],wolf:[1084,798,364,270]
};
// Tight bounds keep enemy feet on the shared ground instead of on atlas padding.
const enemySpriteBounds=[[31,142,290,138],[343,50,271,230],[641,76,309,204],[983,51,262,232],[1269,74,320,206],[20,381,296,195],[326,370,303,206],[638,342,312,234],[969,369,291,208],[1287,319,308,263],[16,628,304,275],[335,682,296,217],[623,625,308,280],[963,684,315,219],[1297,645,301,260]];
let scenePlayback=null,scenePhase='',sceneFocus=null;
const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
function motionReduced(){return !!state.feedbackPrefs?.reduced||motionQuery.matches;}
function syncMotionControls(){
  document.documentElement.classList.toggle('reduced-motion',motionReduced());
  $('#motionToggle').setAttribute('aria-pressed',String(motionReduced()));
  $('#motionToggle').textContent=motionReduced()?'动态已减少':'减少动态';
  $('#speedToggle').setAttribute('aria-pressed',String(!!state.feedbackPrefs?.fast));
  $('#speedToggle').textContent=state.feedbackPrefs?.fast?'演出 2×':'演出 1×';
}
motionQuery.addEventListener('change',()=>{syncMotionControls();if(motionReduced())stopScenePlayback();});
function facilitySprite(id){
  if(id==='dew')return'water';if(id==='smoke')return'food';
  if(['wall','foundation','stabilizer'].includes(id))return'wall';
  if(['warm','rootbed'].includes(id))return'bed';
  if(['mushroom','greenhouse','branch'].includes(id))return'garden';
  if(['traps','coldroom','fog'].includes(id))return'trap';
  if(['workbench','specimen','sorter','voidbox'].includes(id))return'workbench';
  if(['altar','prism','resonance','observer','monument'].includes(id))return'altar';
  if(id==='miner')return'mine';if(id==='guard')return'guard';if(id==='tower')return'tower';if(id==='display')return'trophy';if(id==='alchemy')return'cauldron';
  return'forge';
}
function focusFacility(id){sceneFocus={id,until:performance.now()+2200};}

function drawSprite(context,id,x,ground,width,alpha=1,faceLeft=false){
  const rect=spriteRects[id];if(!rect||!worldArt.sprites.complete||!worldArt.sprites.naturalWidth)return;
  const h=width*rect[3]/rect[2],screen=context.canvas,correction=screen.id==='scene'&&screen.clientWidth?screen.width*screen.clientHeight/(screen.height*screen.clientWidth):1,dw=width*correction;
  context.save();context.globalAlpha=(Number.isFinite(context.globalAlpha)?context.globalAlpha:1)*alpha;context.imageSmoothingEnabled=false;
  if(faceLeft){context.translate(x*2,0);context.scale(-1,1);}
  context.drawImage(worldArt.sprites,...rect,Math.round(x-dw/2),Math.round(ground-h),Math.round(dw),Math.round(h));context.restore();
}
function walkFrameAtDistance(distance){
  // One complete two-step cycle covers one stride, independent of FPS or playback speed.
  return Math.floor((Math.max(0,distance)%WALK_ANIMATION.stride)/WALK_ANIMATION.stride*WALK_ANIMATION.frames);
}
function drawWalkingHero(context,x,ground,distance,faceLeft=false){
  const art=worldArt.walk,{frames,size,height}=WALK_ANIMATION;
  if(!art.complete||art.naturalWidth<frames*size||art.naturalHeight<size){drawSprite(context,'walk',x,ground,76,1,faceLeft);return;}
  const frame=walkFrameAtDistance(distance),screen=context.canvas,correction=screen.id==='scene'&&screen.clientWidth?screen.width*screen.clientHeight/(screen.height*screen.clientWidth):1,width=height*correction;
  context.save();context.imageSmoothingEnabled=false;
  if(faceLeft){context.translate(x*2,0);context.scale(-1,1);}
  context.drawImage(art,frame*size,0,size,size,Math.round(x-width/2),Math.round(ground-height),Math.round(width),height);
  context.restore();
}
function paintEvolutionSprites(){
  $$('[data-evolution-pose]').forEach(canvas=>{const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);drawSprite(c,canvas.dataset.evolutionPose,canvas.width/2,canvas.height-4,canvas.width*.72);});
}
function drawFacility(context,id,x,ground,width,time=0){
  const type=facilitySprite(id);
  if(['water','food','forge'].includes(type)){drawSprite(context,type,x,ground,width);return;}
  const screen=context.canvas,correction=screen.id==='scene'&&screen.clientWidth?screen.width*screen.clientHeight/(screen.height*screen.clientWidth):1;
  context.save();context.translate(x,ground);context.scale(width/100*correction,width/100);context.imageSmoothingEnabled=false;
  const block=(x,y,w,h,color)=>{context.fillStyle=color;context.fillRect(x,y,w,h);};
  // Small code-drawn props cover non-atlas facilities without disguising them as a forge.
  const wood='#795c3a',light='#b69b66',stone='#657565',edge='#34493b',leaf='#82a75a',glow='#b7dc9d';
  if(type==='wall'){
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){const xx=-43+col*22+(row%2?5:0);block(xx,-18-row*17,20,15,stone);block(xx,-18-row*17,20,3,'#94a18a');}
    block(-46,-83,15,13,edge);block(-14,-83,15,13,edge);block(19,-83,15,13,edge);
  }else if(type==='bed'){
    block(-43,-24,86,13,wood);block(-42,-16,7,16,wood);block(34,-16,7,16,wood);block(-40,-39,80,15,'#8d9a69');block(-34,-44,23,13,'#c6ba90');block(-4,-36,40,16,'#668260');
  }else if(type==='garden'){
    block(-43,-26,86,24,wood);block(-38,-30,76,9,'#3a3321');
    for(let i=0;i<4;i++){const xx=-28+i*19;block(xx,-57-i%2*14,4,31,leaf);block(xx-9,-59-i%2*14,22,9,leaf);block(xx-5,-67-i%2*14,14,10,'#b2c781');}
  }else if(type==='trap'){
    block(-44,-14,88,8,stone);for(let i=0;i<7;i++){const xx=-38+i*12;block(xx,-37,5,24,light);block(xx+1,-43,3,7,'#d7cca1');}block(-17,-53,34,11,'#7eafa4');block(-10,-72,20,20,'#99c6c0');
  }else if(type==='workbench'){
    block(-43,-41,86,11,light);block(-37,-30,8,30,wood);block(29,-30,8,30,wood);block(-24,-66,34,25,wood);block(-20,-62,26,4,light);block(17,-65,9,25,stone);block(8,-71,27,9,stone);
  }else if(type==='mine'){
    block(-43,-14,86,14,stone);block(-30,-56,60,42,edge);block(-20,-44,40,30,'#18291f');block(-35,-65,70,12,wood);block(-35,-65,8,65,wood);block(27,-65,8,65,wood);block(-8,-45,16,25,'#b6be8b');block(-17,-51,34,8,light);
  }else if(type==='guard'){
    block(-17,-57,34,34,stone);block(-13,-80,26,24,stone);block(-9,-71,6,5,'#f3cd6f');block(4,-71,6,5,'#f3cd6f');block(-15,-23,10,23,edge);block(5,-23,10,23,edge);block(-31,-55,13,32,stone);block(18,-55,22,36,'#8a9d80');block(21,-50,16,5,light);
  }else if(type==='tower'){
    block(-31,-62,7,62,wood);block(24,-62,7,62,wood);block(-42,-74,84,15,light);block(-34,-102,7,30,wood);block(27,-102,7,30,wood);block(-42,-110,84,12,wood);block(-5,-97,10,22,'#d4bf77');
  }else if(type==='trophy'){
    block(-41,-51,82,10,light);block(-35,-41,7,41,wood);block(28,-41,7,41,wood);block(-10,-65,20,14,'#c7ac65');block(-19,-82,9,22,'#e1d9b2');block(10,-82,9,22,'#e1d9b2');block(-28,-88,9,13,'#e1d9b2');block(19,-88,9,13,'#e1d9b2');
  }else if(type==='cauldron'){
    block(-31,-43,62,32,'#48594d');block(-40,-50,80,10,stone);block(-22,-11,8,11,wood);block(14,-11,8,11,wood);block(-31,-47,62,6,'#96b16b');block(-12,-65,4,14,glow);block(8,-72,4,14,glow);
  }else{
    block(-39,-15,78,15,stone);block(-28,-28,56,13,'#8a9c80');block(-19,-39,38,11,stone);block(-12,-62,24,22,'#92c5b1');block(-6,-78,12,17,'#d5edb8');block(-4,-63,8,19,'#e1edba');
  }
  context.restore();
}
function paintFacilityPreviews(){
  $$('[data-module-preview]').forEach(canvas=>{const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);drawFacility(c,canvas.dataset.modulePreview,canvas.width/2,canvas.height-4,canvas.width*.78);});
}
worldArt.sprites.onload=()=>{paintEvolutionSprites();paintFacilityPreviews();};

function nightPresentationTiming(record){
  const intro=900,production=Math.max(1,record.meta.production?.length||0)*850,outro=record.meta.disaster?1800:800;
  const duration=intro+production+outro;
  return {duration,productionStart:intro/duration,productionEnd:(intro+production)/duration};
}

function playExperience(record){
  if(['equip','core'].includes(record.kind))requestAnimationFrame(()=>{const target=record.kind==='equip'?$(`[data-slot="${record.meta.slot}"]`):record.meta.coreAction==='socket'?$(`[data-core-index="${record.meta.slot}"]`):null;if(target){target.classList.remove('item-arrival');void target.offsetWidth;target.classList.add('item-arrival');}});
  if(record.meta.battle?.manual){scenePlayback=null;scenePhase='';$('#skipScene').hidden=true;return;}
  // Starting another action cancels only the previous animation, never its result.
  if(typeof showGamePage==='function'){
    if(['explore','ascend','build','route','night','repair'].includes(record.kind))showGamePage('explore',{scroll:false});
    else if(currentGamePage!=='explore'){scenePlayback=null;$('#skipScene').hidden=true;return;}
  }
  const duration=record.kind==='explore'?(record.newCores.length?6600:6000):record.kind==='night'?nightPresentationTiming(record).duration:record.kind==='route'?3000:['build','repair'].includes(record.kind)?2600:record.kind==='ascend'||record.newCores.length?2400:1800;
  scenePlayback={record,start:performance.now(),rate:state.feedbackPrefs.fast?2:1,duration:duration/(state.feedbackPrefs.fast?2:1)};
  scenePhase='';$('#journeyCard').classList.remove('arrival');void $('#journeyCard').offsetWidth;$('#journeyCard').classList.add('arrival');
  $('#skipScene').hidden=motionReduced();
  const stage=$('.stage'),bounds=stage.getBoundingClientRect();
  if(bounds.bottom<100||bounds.top>window.innerHeight-100){(motionReduced()?$('#journeyCard'):stage).scrollIntoView({behavior:motionReduced()?'instant':'smooth',block:'start'});}
  if(!['explore','ascend','repair','build','route','night'].includes(record.kind))setScenePhase('change',record.story.title,'变化已生效 · 下方可查看实际结果','营地中的每一次调整，都留下了痕迹');
  if(motionReduced())stopScenePlayback();
}
function stopScenePlayback({resources=true}={}){
  const record=scenePlayback?.record;scenePlayback=null;scenePhase='';$('#skipScene').hidden=true;
  delete $('#scene').dataset.walkFrame;delete $('#scene').dataset.gatherAction;delete $('#scene').dataset.gatherFrame;
  delete $('#scene').dataset.workAction;
  $('#sceneTitle').textContent=route()?.name||'残破营地';
  $('#sceneEyebrow').textContent=`第${state.day}天 · ${state.modules.length}座设施正在营地`;
  $('#sceneStatus').textContent=state.gameOver?(state.shelter.hp<=0?'庇护所已被摧毁':'百日旅程已完成'):'已回到营地 · 收获和变化见下方';
  $('#scene').setAttribute('aria-label',`${route()?.name||'残破营地'}，${state.modules.length}座设施。${$('#sceneStatus').textContent}`);
  if(record&&resources&&!motionReduced())flyResources(record);
}
function flyResources(record){
  const stage=$('.stage').getBoundingClientRect();
  record.changes.filter(c=>c.key.startsWith('mat:')&&c.to>c.from).slice(0,4).forEach((change,i)=>{
    const key=change.key.slice(4),target=$(`[data-supply="${key}"]`);if(!target)return;
    const dest=target.getBoundingClientRect(),token=document.createElement('span');token.className='flying-resource';token.textContent=`${change.icon} +${displayNumber(change.to-change.from)}`;
    token.style.left=`${stage.left+stage.width*.58+i*14}px`;token.style.top=`${stage.top+stage.height*.7}px`;document.body.append(token);
    const animation=token.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dest.left+dest.width/2-stage.left-stage.width*.58-i*14}px,${dest.top-stage.top-stage.height*.7}px) scale(.6)`,opacity:0}],{duration:750,delay:i*90,easing:'cubic-bezier(.25,.1,.3,1)',fill:'both'});
    animation.onfinish=()=>{token.remove();const current=$(`[data-supply="${key}"]`);if(current){current.classList.remove('supply-pop');void current.offsetWidth;current.classList.add('supply-pop');}};
    animation.oncancel=()=>token.remove();
  });
}

function setScenePhase(key,title,status,eyebrow){
  if(scenePhase===key)return;scenePhase=key;$('#sceneTitle').textContent=title;$('#sceneStatus').textContent=status;$('#sceneEyebrow').textContent=eyebrow;$('#scene').setAttribute('aria-label',`${title}。${status}`);
}
function sceneText(text,x,y,color='#ffe9aa',size=15){
  ctx.save();ctx.font=`bold ${size}px "Microsoft YaHei", monospace`;ctx.textAlign='center';ctx.fillStyle='#07130ddd';const w=ctx.measureText(text).width+20;ctx.fillRect(Math.round(x-w/2),y-20,w,29);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
}
function orb(x,y,r,color,opacity=1){
  ctx.save();ctx.globalAlpha=opacity;const glow=ctx.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,color);glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
}
function drawCracks(hp,max){
  const damage=1-hp/max;if(damage<.15)return;
  ctx.save();ctx.strokeStyle='#171d19';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(175,245);ctx.lineTo(165,260);ctx.lineTo(174,272);ctx.lineTo(161,290);ctx.stroke();
  if(damage>.45){ctx.beginPath();ctx.moveTo(230,215);ctx.lineTo(219,237);ctx.lineTo(229,250);ctx.lineTo(221,279);ctx.stroke();}
  if(damage>.7){ctx.fillStyle='#1d211ae8';ctx.fillRect(115,249,23,27);ctx.fillRect(196,283,20,16);}ctx.restore();
}

function drawEnemy(name,x,ground,width,alpha=1){
  if(!worldArt.enemies.complete||!worldArt.enemies.naturalWidth)return;
  const names=Object.values(WORLD_EVENTS).flatMap(area=>area.danger.map(e=>e.name)),index=names.indexOf(name);
  if(index<0)return;const w=worldArt.enemies.naturalWidth/5,rect=enemySpriteBounds[index];
  const correction=canvas.clientWidth?canvas.width*canvas.clientHeight/(canvas.height*canvas.clientWidth):1,dw=width*rect[2]/w*correction,dh=width*rect[3]/w;
  ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(worldArt.enemies,...rect,Math.round(x-dw/2),ground-dh,dw,dh);ctx.restore();
}

function drawWorldScene(now=0){
  if(typeof currentGamePage!=='undefined'&&currentGamePage!=='explore'&&!scenePlayback){requestAnimationFrame(drawWorldScene);return;}
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,900,380);
  const playback=scenePlayback,record=playback?.record,rawProgress=playback?clamp((now-playback.start)/playback.duration,0,1):0;
  const progress=playback?.returnOnly?EXPLORATION_TIMING.returnStart+rawProgress*(1-EXPLORATION_TIMING.returnStart):rawProgress;
  $('#sceneFacilities').hidden=!!playback||!!pendingBattle||state.gameOver;
  let biome='camp',heroX=425,pose='hero',faceLeft=false,walkDistance=null,gathering=null,workElapsed=0;
  const weapon=state.gear.find(x=>x.uid===state.equipped.武器);
  if(weapon?.level>0)pose='evolved';
  if(playback?.record.kind==='explore'){
    // A short walk with gentle acceleration reads better than racing across the whole stage.
    const ease=t=>t*t*(3-2*t);
    if(progress<EXPLORATION_TIMING.departEnd){walkDistance=ease(progress/EXPLORATION_TIMING.departEnd)*WALK_ANIMATION.travel;heroX=425+walkDistance;pose='walk';setScenePhase('depart','离开营地','带好背包，前往探索地点','出发 · 消耗1次行动');}
    else if(progress<EXPLORATION_TIMING.returnStart){biome=record.meta.area==='route'?({water:'creek',frost:'creek',holy:'creek',ancient:'forest',beast:'forest',poison:'forest'}[state.shelter.route]||'ruins'):record.meta.area;heroX=340;pose=record.meta.battle?(weapon?.level?'evolved':'hero'):biome==='creek'?'collect':weapon?.level?'evolved':'hero';if(record.meta.battle||!gatheringActionFor(record.meta.area,state.shelter.route))setScenePhase('gather',biome==='creek'?'溪流河岸':biome==='forest'?'古老森林':'失落遗迹',record.meta.battle?`遭遇${record.meta.battle.name}`:record.story.title,'探索 · 发现眼前的物资');}
    else{walkDistance=ease(clamp((progress-EXPLORATION_TIMING.returnStart)/(1-EXPLORATION_TIMING.returnStart),0,1))*WALK_ANIMATION.travel;heroX=425+WALK_ANIMATION.travel-walkDistance;pose='walk';faceLeft=true;setScenePhase('return','带着收获回营','物资已入袋 · 查看下方收获与变化','归来 · 今天的足迹已经留下');}
  }
  if(record?.kind==='explore'&&progress>=EXPLORATION_TIMING.departEnd&&progress<EXPLORATION_TIMING.returnStart&&!record.meta.battle){
    gathering=gatheringActionFor(record.meta.area,state.shelter.route);
    workElapsed=Math.max(0,now-playback.start-playback.duration*EXPLORATION_TIMING.departEnd);
    if(gathering){const action=GATHER_ANIMATIONS[gathering];setScenePhase('gather-'+gathering,biome==='creek'?'溪流河岸':biome==='forest'?'古老森林':'失落遗迹',`${action.label} · 收集${action.resource}`,'采集 · 工具与动作正在产生收获');}
  }
  if(pendingBattle&&!playback){biome=pendingBattle.area;heroX=340;setScenePhase(`combat:${pendingBattle.id}:${pendingBattle.round}:${pendingBattle.phase}:${pendingBattle.resolved}`,pendingBattle.resolved?pendingBattle.summary:pendingBattle.e.name,pendingBattle.resolved?'结果已保存 · 收起战斗后返回营地':pendingBattle.phase==='animating'?'正在交锋 · 每次操作只结算一个回合':'轮到你 · 观察敌人意图，再选择行动',pendingBattle.training?'无损演练 · 生命、物资与行动均不消耗':`野外遭遇 · 第${Math.max(1,pendingBattle.round)}回合`);}
  if(worldArt.biomes.complete&&worldArt.biomes.naturalWidth){const tiles={camp:[0,0],creek:[1,0],forest:[0,1],ruins:[1,1]},tile=tiles[biome]||tiles.camp,w=worldArt.biomes.naturalWidth/2,h=worldArt.biomes.naturalHeight/2;ctx.drawImage(worldArt.biomes,tile[0]*w,tile[1]*h,w,h,0,0,900,380);}else{ctx.fillStyle='#233a30';ctx.fillRect(0,0,900,380);ctx.fillStyle='#3b4d2c';ctx.fillRect(0,285,900,95);}
  // A dark upper edge keeps location labels readable without obscuring the world.
  const shade=ctx.createLinearGradient(0,0,0,140);shade.addColorStop(0,'#06130ab0');shade.addColorStop(1,'transparent');ctx.fillStyle=shade;ctx.fillRect(0,0,900,140);
  const r=route(),routeColor={water:'#65c7dc',frost:'#b5e5eb',holy:'#f6d585',ancient:'#8bce7c',beast:'#d4a57a',poison:'#b4c65f',stone:'#d2c09a',machine:'#9dc4c5',lava:'#fa9c51',void:'#bb9cdd'}[r?.id]||'#f1c96d';
  if(biome==='camp'){
    const tier=!r?0:state.shelter.level<4?1:state.shelter.level<7?2:3;
    if(r)orb(180,240,125,routeColor,.25);
    if(record?.kind==='route'&&record.before.shelterLevel!==undefined){const oldTier=!record.before.route?0:record.before.shelterLevel<4?1:record.before.shelterLevel<7?2:3;drawSprite(ctx,`shelter${oldTier}`,185,318,oldTier?245:225,1-progress);drawSprite(ctx,`shelter${tier}`,185,318,tier?245:225,progress);}
    else drawSprite(ctx,`shelter${tier}`,185,318,tier?245:225);
    let hp=state.shelter.hp;
    if(record?.kind==='repair')hp=record.before.shelter+(state.shelter.hp-record.before.shelter)*progress;
    if(record?.kind==='night'&&record.meta.disaster)hp=progress<nightPresentationTiming(record).productionEnd?record.before.shelter:state.shelter.hp;
    drawCracks(hp,shelterMaxValue());
    // Each installed module has one visible, clickable counterpart below the stage.
    state.modules.forEach((m,i)=>{
      const x=565+i*120,type=facilitySprite(m.id),selected=sceneFocus?.id===m.id&&sceneFocus.until>now;
      if(selected||record?.meta.module===m.id&&progress>0)orb(x,270,65,'#e6c578',.55);
      const newlyBuilt=record?.kind==='build'&&!record.meta.removed&&record.meta.module===m.id&&!(record.before.modules||[]).some(old=>old.id===m.id);
      ctx.save();if(newlyBuilt)ctx.globalAlpha=clamp(progress/.75,0,1);
      drawFacility(ctx,m.id,x,322,100*(record?.meta.module===m.id&&!newlyBuilt ? 1+.04*Math.sin(progress*Math.PI):1),now);ctx.restore();
      if(!motionReduced()&&type==='water'){const drop=now/55%28;ctx.fillStyle='#8be4f1';ctx.fillRect(x+5,282+drop/2,3,5);}
      if(!motionReduced()&&type==='forge')orb(x-10,296,22,'#ffb25c',.3+Math.sin(now/210)*.08);
    });
    if(record?.kind==='build'&&record.meta.removed){const old=record.before.modules||[],index=old.findIndex(x=>x.id===record.meta.module);if(index>=0){ctx.save();ctx.globalAlpha=1-progress;drawFacility(ctx,old[index].id,565+index*120,322,100,now);ctx.restore();}}
  }
  const working=record&&['build','repair','route'].includes(record.kind);
  let workTarget=185;
  if(working){if(record.kind==='build'){const modules=record.meta.removed?record.before.modules||[]:state.modules,index=modules.findIndex(m=>m.id===record.meta.module);workTarget=565+Math.max(0,index)*120;}heroX=workTarget-80*gatheringCorrection(ctx);}
  if(gathering)drawGatheringTarget(ctx,gathering,heroX+GATHER_ANIMATIONS[gathering].targetOffset*gatheringCorrection(ctx),331,workElapsed,playback.rate);
  if(record?.kind==='ascend'&&record.meta.evolution?.hero)pose=progress<.45?'hero':'evolved';
  if(pendingBattle&&!playback){delete canvas.dataset.walkFrame;drawCombatWorld(pendingBattle,now);}
  else if(working&&!motionReduced()){
    delete canvas.dataset.walkFrame;drawActionHero(ctx,'hammer',heroX,331,(now-playback.start)*playback.rate/950,true);
    const strike=(now-playback.start)*playback.rate%950/950;
    if(strike>.4&&strike<.7){for(let i=0;i<6;i++){const t=(strike-.4)/.3;ctx.fillStyle=i%2?'#e0c28a':'#a3b5a0';ctx.fillRect(workTarget-20*gatheringCorrection(ctx)+(i-3)*7*t,285-Math.sin(t*Math.PI)*(8+i*4),3,3);}}
    canvas.dataset.workAction=record.kind;
  }
  else if(walkDistance!==null&&!motionReduced()){
    const frame=String(walkFrameAtDistance(walkDistance));if(canvas.dataset.walkFrame!==frame)canvas.dataset.walkFrame=frame;
    drawWalkingHero(ctx,heroX,331,walkDistance,faceLeft);
  }else if(gathering&&!motionReduced()){
    delete canvas.dataset.walkFrame;canvas.dataset.gatherAction=gathering;canvas.dataset.gatherFrame=String(gatheringFrameAtTime(gathering,workElapsed,playback.rate));
    drawGatheringHero(ctx,gathering,heroX,331,workElapsed,playback.rate);drawGatheringImpact(ctx,gathering,heroX,331,workElapsed,playback.rate);
  }else{
    if(canvas.dataset.walkFrame!==undefined)delete canvas.dataset.walkFrame;
    drawSprite(ctx,pose,heroX,331,pose==='collect'?100:pose==='evolved'?106:76,1,faceLeft);
  }
  if(!working)delete canvas.dataset.workAction;
  if(!pendingBattle)delete canvas.dataset.combatPose;
  if(!gathering){delete canvas.dataset.gatherAction;delete canvas.dataset.gatherFrame;}
  if(record?.meta.battle&&!record.meta.battle.manual&&biome!=='camp'){
    const battle=record?.meta.battle,name=battle?.name||pendingBattle.e.name,fade=battle&&battle.mode!=='retreat'?1-clamp((progress-.52)/.2,0,.85):1;
    drawEnemy(name,650,335,165,fade);sceneText(battle?`${battle.power} ⚔ ${battle.threshold}`:`${pendingBattle.power} ⚔ ${pendingBattle.threshold}`,490,195);
    if(battle&&progress>.5){sceneText(battle.mode==='retreat'?'避开危险':battle.mode==='overpower'?'绝对碾压':'战斗胜利',650,225,'#f5d083');if(!motionReduced()&&battle.mode!=='retreat'){ctx.strokeStyle='#f7dc8a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(610,240);ctx.lineTo(680,300);ctx.stroke();}}
  }
  if(biome==='creek'&&!motionReduced()){ctx.strokeStyle='#bcefe768';ctx.lineWidth=2;for(let i=0;i<4;i++){const x=350+i*100+Math.sin(now/800+i)*12;ctx.beginPath();ctx.ellipse(x,265+i%2*12,15+Math.sin(now/450)*3,3,0,0,Math.PI*2);ctx.stroke();}}
  if(record?.kind==='explore'&&progress>.4&&progress<EXPLORATION_TIMING.returnStart&&!record.meta.battle){const gains=record.changes.filter(c=>c.key.startsWith('mat:')&&c.to>c.from).slice(0,3);gains.forEach((c,i)=>{orb(470+i*65,240,30,'#f5d585',.35);sceneText(`${c.icon} +${displayNumber(c.to-c.from)}`,480+i*72,240-Math.sin(progress*8)*7);});}
  if(record?.newCores.length&&progress>.48){const key=record.newCores[0];orb(490,225,80,'#f4d286',.6);ctx.fillStyle='#f7dc94';ctx.beginPath();ctx.moveTo(490,198);ctx.lineTo(507,225);ctx.lineTo(490,252);ctx.lineTo(473,225);ctx.closePath();ctx.fill();ctx.fillStyle='#a1cbb6';ctx.fillRect(486,212,8,20);sceneText(CORES[key][1],490,175);}
  if(record?.kind==='ascend'){
    setScenePhase('ascend','万物升华',record.meta.evolution?.to||'物品完成进化','让成长成为看得见的力量');
    orb(425,255,95+Math.sin(progress*Math.PI)*45,'#e2c873',.55);
    for(let i=0;i<9;i++){const angle=i/9*Math.PI*2+progress*2;ctx.fillStyle='#ffe6a5';ctx.fillRect(425+Math.cos(angle)*70,252+Math.sin(angle)*60,4,4);}
    sceneText(record.meta.evolution?.to||'升华完成',425,160);
  }
  if(record?.kind==='repair'){
    setScenePhase('repair','修补庇护所','消耗建材，裂纹正在恢复','维修 · 让营地继续抵御灾难');orb(185,265,125,'#9ce6b0',Math.sin(progress*Math.PI)*.5);
    sceneText(`耐久 ${displayNumber(record.before.shelter)} → ${displayNumber(state.shelter.hp)}`,185,172,'#b6f4cb');
  }
  if(record?.kind==='build'||record?.kind==='route'){
    setScenePhase('build',record.kind==='route'?'庇护所进化':record.meta.removed?'设施拆卸':'营地建设',record.story.title,record.meta.removed?'设施已移除，投入材料已退回':'投入的物资，成为营地的一部分');
    if(progress<.75){ctx.strokeStyle='#eed39b';ctx.lineWidth=3;const x=record.kind==='route'?80:500;ctx.strokeRect(x,180,record.kind==='route'?220:330,140);for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(x+i*70,170);ctx.lineTo(x+i*70,330);ctx.stroke();}}
    record.changes.filter(x=>x.key.startsWith('mat:')&&x.to<x.from).slice(0,3).forEach((item,i)=>{const t=(progress*1.5+i*.2)%1;ctx.save();ctx.globalAlpha=Math.sin(t*Math.PI);sceneText(item.icon,workTarget+110*(1-t),290-45*Math.sin(t*Math.PI),'#e7d6a4',18);ctx.restore();});
  }
  if(record?.kind==='night'){
    const timing=nightPresentationTiming(record),start=timing.productionStart,end=timing.productionEnd;
    const nightAlpha=progress<start?progress/start*.82:progress<end?.82:(1-progress)/(1-end)*.82;
    ctx.fillStyle=`rgba(5,12,30,${clamp(nightAlpha,0,.82)})`;ctx.fillRect(0,0,900,380);
    if(progress<start){setScenePhase('night','夜幕降临','水与食物各消耗1份','休息 · 今日行动与升华次数将刷新');sceneText('💧 −1    🍖 −1',440,235,'#f2cc94');}
    else if(progress<end){
      setScenePhase('production','营地正在工作','设施、核心与装备逐项完成结算','清晨之前 · 看见每一份产出的来源');
      const sources=record.meta.production||[],source=sources[Math.min(sources.length-1,Math.floor((progress-start)/(end-start)*sources.length))];
      if(source){const index=state.modules.findIndex(m=>MODULES.find(d=>d.id===m.id).name===source.name),x=index>=0?565+index*120:425;orb(x,260,80,'#c4d88d',.45);sceneText(source.name,x,190);sceneText(source.key==='heal'?`♥ +${displayNumber(source.actual)}`:`${MATS[source.key]?.[0]||source.icon} +${source.actual}`,x,230);}
      else sceneText('行动恢复 · 升华次数刷新',450,230);
    }
    else if(record.meta.disaster){
      const name=record.meta.disaster.name,cold=/寒|冰|白灾/.test(name),fire=/火|熔/.test(name),rain=/雨/.test(name);
      setScenePhase('disaster',name,`庇护所受到${record.meta.disaster.damage}点损伤`,'世界灾难 · 建筑留下了真实的伤痕');
      if(!motionReduced()){
        ctx.fillStyle=cold?'#8ec9e52b':fire?'#dd6e352b':'#807fa52b';ctx.fillRect(0,0,900,380);
        for(let i=0;i<22;i++){
          const x=(i*83+now/(cold?25:7))%900,y=(i*47+now/(cold?18:5))%380;
          if(cold){ctx.fillStyle='#d2ebefbb';ctx.fillRect(x,y,i%3+2,i%3+2);}
          else if(fire){orb(x,y,12,'#ffad5a',.6);ctx.fillStyle='#ffc16c';ctx.fillRect(x,y,4,8);}
          else{ctx.strokeStyle=rain?'#afcad49a':'#bbc6ce55';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-(rain?12:45),y+(rain?45:8));ctx.stroke();}
        }
      }
      sceneText(`耐久 −${record.meta.disaster.damage}`,185,177,cold?'#d4f2ff':'#ffb3a1');
    }
    else setScenePhase('dawn',`第${state.day}天 · 清晨`,'营地已完成结算，新的旅程开始','日出 · 你又度过了一夜');
  }
  if(record?.kind==='explore'){
    const fade=Math.max(0,1-Math.abs(progress-EXPLORATION_TIMING.departEnd)/.025,1-Math.abs(progress-EXPLORATION_TIMING.returnStart)/.025);
    if(fade>0){ctx.fillStyle=`rgba(7,18,12,${fade})`;ctx.fillRect(0,0,900,380);}
  }
  const warning=!playback&&!pendingBattle&&biome==='camp'?nextDisaster():null;
  if(warning?.left===1){
    canvas.dataset.omen=warning.event.name;
    const cold=/寒|冰|白灾/.test(warning.event.name),fire=/火|熔/.test(warning.event.name),time=motionReduced()?0:now;
    const clouds=ctx.createLinearGradient(0,0,0,210);clouds.addColorStop(0,cold?'#9ccdd243':fire?'#b45c323b':'#555b7459');clouds.addColorStop(1,'transparent');ctx.fillStyle=clouds;ctx.fillRect(0,0,900,210);
    ctx.fillStyle=cold?'#cee5df88':fire?'#f0b37b88':'#a5bbc05e';
    for(let i=0;i<9;i++){const x=(i*117+time/60)%900,y=90+(i*39+time/100)%140;ctx.fillRect(x,y,cold?3:fire?2:1,cold?3:fire?4:17);}
  }else delete canvas.dataset.omen;
  if(playback&&progress>=1)stopScenePlayback();
  if(!scenePlayback&&!pendingBattle){const forecast=nextDisaster(),max=shelterMaxValue();setScenePhase(`idle:${state.day}:${state.shelter.route}:${state.modules.length}:${state.shelter.hp}:${max}:${state.gameOver}`,route()?.name||'残破营地',state.gameOver?(state.shelter.hp<=0?'庇护所已被摧毁':'百日旅程已完成'):forecast?.left===1?`明日${forecast.event.name} · 预计损伤${forecast.damage}耐久`:'营火尚暖 · 可以出发',`第${state.day}天 · ${state.modules.length}座营地设施`);}
  requestAnimationFrame(drawWorldScene);
}
