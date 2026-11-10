// Turn decisions are applied once and saved immediately. Animation never deals damage.
const COMBAT_INTENTS={
  attack:{icon:'↗',name:'扑击',description:'会在你行动后攻击',multiplier:1},
  charge:{icon:'◌',name:'蓄力',description:'本回合不攻击，下一招是重击；重击可打断',multiplier:0},
  heavy:{icon:'⚒',name:'重击',description:'伤害较高，防御可大幅减伤',multiplier:1.8},
  guard:{icon:'▥',name:'防守',description:'本回合不攻击；抵挡轻击，重击可破防',multiplier:0}
};
let combatTimer=null;
function combatInventory(b=pendingBattle){return b.training?b.supplies:state.inventory;}
function combatIntent(b=pendingBattle){return {...COMBAT_INTENTS[b.pattern[b.intentIndex%b.pattern.length]],type:b.pattern[b.intentIndex%b.pattern.length]};}
function combatIncomingDamage(b=pendingBattle,intent=combatIntent(b)){
  return intent.multiplier?Math.max(1,Math.round((b.threshold*.14+4)*clamp(b.threshold/Math.max(1,b.power),.55,1.5)*intent.multiplier*(1-b.damageReduce))):0;
}
function combatStrikeDamage(action,b=pendingBattle){
  const intent=combatIntent(b),base=Math.max(8,Math.round(b.power*.55)),guard=intent.type==='guard'&&action==='attack'?.45:1;
  return Math.max(1,Math.round(base*(action==='heavy'?1.75:1)*(b.focus?1.35:1)*guard));
}
function combatOptions(b=pendingBattle){
  const bag=combatInventory(b),heal=Math.min(18,b.maxHp-b.hp);
  return [
    {id:'attack',key:'1',icon:'↗',name:'轻击',text:`造成${combatStrikeDamage('attack',b)}伤害，恢复1体力`,reason:''},
    {id:'heavy',key:'2',icon:'⚒',name:'重击',text:`造成${combatStrikeDamage('heavy',b)}伤害，消耗2体力；破防/打断`,reason:b.stamina<2?'体力不足2点，轻击或防御可以恢复':''},
    {id:'guard',key:'3',icon:'▥',name:'防御反击',text:'本回合减伤80%，恢复2体力；下次攻击+35%',reason:''},
    {id:'honey',key:'4',icon:'⬡',name:'蜂蜜诱饵',text:'蜂蜜×1；敌人本回合扑空，后续门槛降低20%',reason:b.honeyUsed?'每场只能使用一次诱饵':(bag.honey||0)<1?'没有蜂蜜，可在森林事件中获得':''},
    {id:'heal',key:'5',icon:'♥',name:'战场补给',text:`水×1、食物×2；恢复${Math.max(0,heal)}生命，敌人仍会行动`,reason:heal<=0?'生命已满':(bag.water||0)<1||(bag.food||0)<2?'需要水×1、食物×2':''},
    {id:'retreat',key:'6',icon:'↶',name:'撤退',text:`损失${Math.min(Math.max(0,b.hp-1),Math.ceil(combatIncomingDamage(b,{multiplier:1})*.3))}生命，保留探索保底物资`,reason:''}
  ];
}
function startBattle(area,e,baseRewards=[],{training=false}={}){
  if(pendingBattle||state.gameOver)return false;
  if(!training&&!activeExperience)beginExperience('explore',{area});
  if(typeof stopScenePlayback==='function')stopScenePlayback({resources:false});
  const a=aggregate(),threshold=Math.max(5,Math.round(e.threshold*(1-a.threshold-routeThresholdBonus()))),power=totalPower();
  const patterns=[['attack','charge','heavy'],['guard','attack','charge','heavy'],['attack','attack','charge','heavy']];
  const seed=[...e.name].reduce((sum,c)=>sum+c.charCodeAt(0),0),enemyMaxHp=Math.max(24,Math.round(threshold*1.1+18));
  pendingBattle={version:1,id:uid(),area,e:JSON.parse(JSON.stringify(e)),baseRewards,training,
    threshold,power,enemyMaxHp,enemyHp:enemyMaxHp,hp:training?100:state.hp,maxHp:training?100:state.maxHp+a.hp,
    initialHp:training?100:state.hp,damageReduce:Math.min(.9,a.damageReduce),stamina:3,focus:0,round:1,
    pattern:training?['charge','heavy','attack','guard']:patterns[seed%patterns.length],intentIndex:0,
    honeyUsed:false,phase:'input',resolved:false,turns:[],enemyStrikes:0,
    supplies:training?{water:3,food:6,honey:1}:null,feedback:combatFeedback(e.threshold),experience:training?null:activeExperience};
  if(typeof showGamePage==='function')showGamePage('explore',{scroll:false});
  saveCombat();render();$('.stage').scrollIntoView?.({block:'start',behavior:'instant'});focusCombatControl();return true;
}
function startPracticeBattle(){
  const enemy={...WORLD_EVENTS.forest.danger[0],threshold:Math.max(45,Math.round(totalPower()*1.05))};
  return startBattle('forest',enemy,[],{training:true});
}
function saveCombat(){
  if(pendingBattle){if(!pendingBattle.resolved&&!pendingBattle.training)pendingBattle.experience=activeExperience;state.combat=pendingBattle;}
  else state.combat=null;
  save();
}
function restoreCombat(){
  if(!state.combat)return;
  const b=state.combat;
  if(b.version!==1||!b.e||!Array.isArray(b.pattern)||!b.pattern.length){state.combat=null;pendingBattle=null;save();return;}
  pendingBattle=b;b.animation=null;b.phase='input';
  activeExperience=b.resolved||b.training?null:b.experience;
  if(typeof showGamePage==='function')showGamePage('explore',{historyMode:'replace',scroll:false});
}
function performCombatAction(action){
  const b=pendingBattle;if(!b)return false;
  if(action==='continue')return closeCombat();
  if(b.resolved||b.phase!=='input')return false;
  const option=combatOptions(b).find(x=>x.id===action);if(!option||option.reason)return false;
  const intent=combatIntent(b),beforeHp=b.hp,beforeEnemy=b.enemyHp,bag=combatInventory(b),round=b.round;
  let dealt=0,received=0,healed=0,interrupted=false,enemySkipped=false,lethal=false;
  if(action==='attack'||action==='heavy'){
    dealt=Math.min(b.enemyHp,combatStrikeDamage(action,b));b.enemyHp-=dealt;
    b.stamina=action==='heavy'?b.stamina-2:Math.min(3,b.stamina+1);b.focus=0;
    interrupted=action==='heavy'&&intent.type==='charge'&&b.enemyHp>0;
  }
  if(action==='guard'){b.stamina=Math.min(3,b.stamina+2);b.focus=1;}
  if(action==='honey'){bag.honey--;b.honeyUsed=true;b.threshold=Math.max(5,Math.round(b.threshold*.8));enemySkipped=true;}
  if(action==='heal'){bag.water--;bag.food-=2;healed=Math.min(18,b.maxHp-b.hp);b.hp+=healed;}
  if(action==='retreat'){
    received=Math.min(Math.max(0,b.hp-1),Math.ceil(combatIncomingDamage(b,{multiplier:1})*.3));b.hp-=received;
  }else if(b.enemyHp>0&&!interrupted&&!enemySkipped){
    const incoming=combatIncomingDamage(b,intent);
    if(incoming>0){b.enemyStrikes++;received=action==='guard'?Math.floor(incoming*.2):incoming;lethal=received>=b.hp;b.hp=Math.max(1,b.hp-received);received=Math.min(received,beforeHp+healed-1);}
  }
  if(!b.training)state.hp=b.hp;
  const parts=[option.name];if(dealt)parts.push(`敌人 −${dealt}`);if(healed)parts.push(`生命 +${healed}`);
  if(received)parts.push(`生命 −${received}`);else if(intent.multiplier&&action!=='retreat'&&b.enemyHp>0)parts.push(enemySkipped?'诱饵使敌人扑空':interrupted?'打断成功':'完全格挡');
  if(interrupted&&!parts.includes('打断成功'))parts.push('打断蓄力');
  const turn={round,action,intent:intent.name,dealt,received,healed,interrupted,text:parts.join(' · ')};
  b.turns.push(turn);b.turns=b.turns.slice(-20);b.round++;
  b.intentIndex=(b.intentIndex+(interrupted?2:1))%b.pattern.length;
  const duration=typeof motionReduced==='function'&&!motionReduced()?1200/(state.feedbackPrefs.fast?2:1):0;
  b.animation={action,intent:intent.type,beforeHp,beforeEnemy,dealt,received,healed,interrupted,enemySkipped,start:typeof performance==='undefined'?0:performance.now(),duration};
  b.phase=duration?'animating':'input';
  if(action==='retreat')finishCombat('retreat');else if(b.enemyHp<=0)finishCombat('victory');else if(lethal)finishCombat('defeat');
  saveCombat();render();
  if(duration){
    const id=b.id,completedRound=b.round;
    if(combatTimer!==null)clearTimeout(combatTimer);
    combatTimer=setTimeout(()=>{if(pendingBattle?.id===id&&pendingBattle.round===completedRound){pendingBattle.phase='input';pendingBattle.animation=null;saveCombat();renderCombat();focusCombatControl(action);}combatTimer=null;},duration);
  }else focusCombatControl(action);
  return true;
}
function finishCombat(outcome){
  const b=pendingBattle;if(!b||b.resolved)return;
  b.resolved=true;b.outcome=outcome;b.experience=null;
  if(b.training){b.summary=outcome==='victory'?'演练获胜':outcome==='defeat'?'演练结束 · 试试防住重击':'已退出演练';return;}
  const overpower=outcome==='victory'&&b.power>=b.threshold*1.5,a=aggregate();
  if(outcome==='victory'){
    const rewards=[...b.baseRewards],beast=state.shelter.route==='beast'?1+state.shelter.level*.12:1;
    applyGains(b.e.gain,1.5*(overpower?2+a.overpower:1)*beast*(1+a.dangerReward),rewards);
    if(Math.random()<.16+a.loot)dropGear(true,rewards);
    b.summary=overpower?'压制获胜':'战斗胜利';story(b.summary,b.e.name,`你用${b.round-1}个回合击败敌人，战利品已带回。`,rewards);log(`击败${b.e.name}，${b.round-1}回合：${rewards.join('、')}`,'good');
  }else{
    b.summary=outcome==='retreat'?'成功撤退':'重伤败退';
    story(b.summary,`离开${b.e.name}`,outcome==='retreat'?'保留探索保底物资，没有战斗战利品。':'你负伤返回，保留1点生命与探索保底物资。补给和治疗设施可以帮助恢复。',[]);log(`${b.summary}：${b.e.name}`,'bad');
  }
  const feedback=b.feedback;feedback.honey=b.honeyUsed;
  feedback.usedDamageReduce=b.enemyStrikes?feedback.damageReduce:[];
  feedback.usedRewards=outcome==='victory'?[...feedback.dangerReward,...(state.shelter.route==='beast'?[{name:route().name,value:state.shelter.level*.12}]:[]),...(overpower?feedback.overpower:[])]:[];
  if(activeExperience)activeExperience.meta.battle={manual:true,battleId:b.id,name:b.e.name,power:b.power,threshold:b.threshold,mode:outcome==='victory'?(overpower?'overpower':'victory'):outcome,rounds:b.round-1,turns:b.turns,feedback,
    explanation:`共${b.round-1}回合。开战战力${b.power}，敌方门槛${b.threshold}。${outcome==='victory'?(overpower?'达到1.5倍门槛，压制战利品加成生效。':'战利品已按实际结果结算。'):outcome==='retreat'?'主动撤退，保留保底物资。':'重伤败退，保留1点生命。'}${b.honeyUsed?'本战使用了蜂蜜诱饵。':''}`};
}
function closeCombat(){
  const b=pendingBattle;if(!b?.resolved||b.phase==='animating')return false;
  const record=state.experienceHistory.find(x=>x.meta.battle?.battleId===b.id);
  pendingBattle=null;state.combat=null;renderCombat();render();save();
  (b.training?$('#practiceBattle'):$(`[data-action="${b.area}"]`))?.focus({preventScroll:true});
  if(record&&typeof playCombatReturn==='function')playCombatReturn(record);
  return true;
}
function focusCombatControl(preferred){
  if(typeof document==='undefined')return;
  const b=pendingBattle;if(!b||b.phase==='animating')return;
  const target=b.resolved?'continue':preferred||'attack';
  $(`#combatPanel [data-combat="${target}"]:not(:disabled)`)?.focus({preventScroll:true});
}
function renderCombat(){
  const b=pendingBattle,panel=$('#combatPanel');panel.hidden=!b;
  document.body?.classList.toggle('in-combat',!!b);
  $('.primary-tabs').inert=!!b;$('.supply-bar').inert=!!b;
  if(!b)return;
  const intent=combatIntent(b),busy=b.phase==='animating',bag=combatInventory(b),last=b.turns.at(-1);
  const record=state.experienceHistory.find(x=>x.meta.battle?.battleId===b.id);
  const gains=record?.changes.filter(x=>x.to>x.from&&(x.key.startsWith('mat:')||x.key.startsWith('graded:')||x.key.startsWith('core:')))||[];
  panel.innerHTML=`<div class="combat-heading"><b>${b.training?'无损演练':'野外遭遇'} · ${b.e.name}</b><span>${b.resolved?b.summary:`第${Math.max(1,b.round-(busy?1:0))}回合`}</span></div>
    <div class="combat-vitals"><div><span>你 <b>${displayNumber(b.hp)} / ${displayNumber(b.maxHp)}</b></span><i><em style="width:${b.hp/b.maxHp*100}%"></em></i></div><div class="enemy-vital"><span>敌人 <b>${b.enemyHp} / ${b.enemyMaxHp}</b></span><i><em style="width:${b.enemyHp/b.enemyMaxHp*100}%"></em></i></div><div class="combat-stamina"><span>体力</span><div aria-label="${b.stamina}/3体力">${[0,1,2].map(i=>`<i class="${i<b.stamina?'filled':''}"></i>`).join('')}</div></div></div>
    ${b.training?'<p class="practice-note">演练不消耗真实生命、物资或探索行动，也不发放战利品。</p>':''}
    ${b.resolved?`<div class="combat-result ${b.outcome==='victory'?'win':''}"><span>${b.outcome==='victory'?'✦':'↶'}</span><div><b>${escapeText(b.summary)}</b><small>${b.training?'可以随时再来练习':b.outcome==='victory'?'已保存战利品，收起后可查看完整明细':'没有战斗奖励，探索保底物资仍在背包'}</small></div><div class="combat-loot">${gains.slice(0,4).map(x=>`<span>${x.icon} +${displayNumber(x.to-x.from)}</span>`).join('')}</div></div><button class="combat-continue" data-combat="continue" ${busy?'disabled':''}>${busy?'动作结算中…':'收起战斗 · 返回营地'}</button>`:
    `<div class="enemy-intent" data-intent="${intent.type}"><span>${intent.icon}</span><div><small>${busy?'动作演出中':'敌人下一招'}</small><b>${intent.name}${intent.multiplier?` · 预计${combatIncomingDamage(b)}伤害`:''}</b><p>${intent.description}</p></div><em>${busy?'请稍候':'轮到你'}</em></div><div class="combat-actions">${combatOptions(b).map(x=>`<button data-combat="${x.id}" ${busy||x.reason?'disabled':''}><span class="combat-key">${x.key}</span><strong><span>${x.icon}</span> ${x.name}</strong><small>${escapeText(x.reason||x.text)}</small></button>`).join('')}</div><p class="combat-supplies">⬡ 蜂蜜 ${bag.honey||0} · 💧 水 ${bag.water||0} · 🍖 食物 ${bag.food||0}<span>等待安全 · 回合不扣行动 · 数字键1–6</span></p>`}
    <p class="combat-turn-note" role="status">${last?escapeText(last.text):'先观察敌人的意图，再选择行动。轻击和防御恢复体力，重击可以破防或打断。'}</p>
    <details class="combat-rounds"><summary>战斗记录${b.turns.length?' · '+(b.round-1>b.turns.length?'最近'+b.turns.length+' / 共'+(b.round-1):b.turns.length)+'回合':''}</summary>${b.turns.map(x=>`<p>第${x.round}回合 · ${escapeText(x.text)}</p>`).join('')||'<p>战斗尚未开始。</p>'}</details>${battleSourcesMarkup(b.feedback,b.threshold)}`;
}
function initCombat(){
  $('#practiceBattle').onclick=startPracticeBattle;
  document.addEventListener('click',event=>{const button=event.target.closest('[data-combat]');if(button)performCombatAction(button.dataset.combat);});
  document.addEventListener('keydown',event=>{
    if(!pendingBattle||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    const actions=['attack','heavy','guard','honey','heal','retreat'];
    if(/^[1-6]$/.test(event.key)&&!pendingBattle.resolved){event.preventDefault();performCombatAction(actions[+event.key-1]);}
    if(event.key==='Enter'&&pendingBattle.resolved&&event.target===document.body){event.preventDefault();performCombatAction('continue');}
  });
}
