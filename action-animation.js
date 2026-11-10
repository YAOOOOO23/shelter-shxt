const ACTION_ANIMATIONS={attack:{frames:8,size:192,height:153.6},guard:{frames:8,size:192,height:153.6},hammer:{frames:8,size:192,height:153.6}};
const actionArt={};
for(const kind of Object.keys(ACTION_ANIMATIONS)){actionArt[kind]=new Image();actionArt[kind].src=`assets/hero-${kind}.png`;}
function actionFrame(kind,progress,repeat=false){
  const config=ACTION_ANIMATIONS[kind];if(!config)return 0;
  return Math.min(config.frames-1,Math.floor((repeat?Math.max(0,progress)%1:clamp(progress,0,.999))*config.frames));
}
function drawActionHero(context,kind,x,ground,progress,repeat=false){
  const config=ACTION_ANIMATIONS[kind],art=actionArt[kind];
  if(!config||!art?.complete||art.naturalWidth<config.size*config.frames){drawSprite(context,'hero',x,ground,76);return;}
  const frame=actionFrame(kind,progress,repeat),height=config.height,width=height*gatheringCorrection(context);
  context.save();context.imageSmoothingEnabled=false;context.drawImage(art,frame*config.size,0,config.size,config.size,x-width/2,ground-height,width,height);context.restore();
}
function combatAnimationProgress(b,now){
  return b.animation?.duration?clamp((now-b.animation.start)/b.animation.duration,0,1):1;
}
function drawCombatWorld(b,now){
  const animation=b.animation,t=combatAnimationProgress(b,now),moving=animation&&t<1&&!motionReduced(),correction=gatheringCorrection(ctx);
  const attack=moving&&['attack','heavy'].includes(animation.action),guard=moving&&animation.action==='guard';
  const strike=attack?Math.sin(clamp(t/.5,0,1)*Math.PI):0;
  const enemyStrike=moving&&animation.received>=0&&COMBAT_INTENTS[animation.intent].multiplier&&!animation.enemySkipped&&!animation.interrupted&&b.enemyHp>0?Math.sin(clamp((t-.5)/.5,0,1)*Math.PI):0;
  const heroX=450-120*correction+strike*80*correction-(moving&&animation.action==='retreat'?60*t*correction:0)-(moving&&animation.received&&t>.68?Math.sin((t-.68)/.32*Math.PI)*10*correction:0),enemyX=450+120*correction-enemyStrike*90*correction+(moving&&animation.dealt&&t>.22&&t<.5?Math.sin((t-.22)/.28*Math.PI)*18*correction:0);
  let fade=1;if(b.resolved&&b.enemyHp<=0)fade=moving?1-clamp((t-.32)/.55,0,1):.1;
  drawEnemy(b.e.name,enemyX,335,150,fade);
  if(attack)drawActionHero(ctx,'attack',heroX,331,clamp(t/.55,0,1));
  else if(guard)drawActionHero(ctx,'guard',heroX,331,clamp(t,0,1));
  else if(moving&&animation.action==='retreat')drawWalkingHero(ctx,heroX,331,60*t,true);
  else drawActionHero(ctx,'guard',heroX,331,0);
  canvas.dataset.combatPose=attack?'attack':guard?'guard':moving?animation.action:'ready';
  if(moving){
    if(attack&&t>.2&&t<.5){ctx.save();ctx.strokeStyle=animation.action==='heavy'?'#ffe6a4':'#e2eac2';ctx.lineWidth=animation.action==='heavy'?6:3;ctx.beginPath();ctx.arc(heroX+50*correction,265,45*correction,-1.2,1.1);ctx.stroke();ctx.restore();}
    if(animation.dealt&&t>.26)sceneText(`−${animation.dealt}`,enemyX,225-(t-.26)*35,'#ffe3a0',22);
    if(t>.65&&COMBAT_INTENTS[animation.intent].multiplier&&b.enemyHp>0){if(guard)orb(heroX+30*correction,275,50,'#a9dfdf',.5);sceneText(animation.enemySkipped?'诱饵 · 扑空':animation.interrupted?'打断':animation.received?`−${animation.received}`:'格挡',heroX,218-(t-.65)*35,animation.received?'#f0a484':'#b6e4d0',19);}
    if(animation.action==='honey'){const x=heroX+(enemyX-heroX)*t,y=260-Math.sin(t*Math.PI)*90;orb(x,y,22,'#e4bf65',.6);ctx.fillStyle='#f4d17a';ctx.fillRect(x-5,y-5,10,10);}
    if(animation.healed){orb(heroX,270,85,'#a6e0a1',Math.sin(t*Math.PI)*.5);sceneText(`♥ +${animation.healed}`,heroX,210-t*25,'#bdebb0',20);}
  }else if(!b.resolved){
    const intent=combatIntent(b);sceneText(`${intent.icon} ${intent.name}`,enemyX,185,intent.type==='heavy'?'#f1b28b':'#e4dba7');
    if(intent.type==='charge')orb(enemyX,285,65,'#f1bb69',motionReduced()?.25:.25+Math.sin(now/220)*.1);
    if(intent.type==='guard'){ctx.save();ctx.strokeStyle='#a5ccc8';ctx.lineWidth=3;ctx.strokeRect(enemyX-55*correction,240,95*correction,70);ctx.restore();}
  }
  if(b.resolved&&!moving)sceneText(b.summary,490,195,b.outcome==='victory'?'#e9d58d':'#c5d6ba',21);
}
function playCombatReturn(record){
  if(motionReduced())return;
  scenePlayback={record,start:performance.now(),rate:state.feedbackPrefs.fast?2:1,duration:1500/(state.feedbackPrefs.fast?2:1),returnOnly:true};
  scenePhase='';$('#skipScene').hidden=false;
}
