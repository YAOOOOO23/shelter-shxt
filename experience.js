// Presentation records contain real before/after values. Animations never delay a save.
let activeExperience = null;
let viewedExperience = null;
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayNumber = value => Number.isInteger(value) ? String(value) : Number(value.toFixed(1)).toString();
const itemLabel = key => MATS[key]?.[1] || ({releaseCrystal:'解构水晶',essence:'路线精华'}[key]) || key;

function experienceSnapshot() {
  return {
    day:state.day, actions:state.actions, uses:state.talentUses, power:totalPower(), hp:state.hp,
    maxHp:state.maxHp+aggregate().hp, shelter:state.shelter.hp, shelterMax:shelterMaxValue(),
    inventory:{...state.inventory}, graded:{...state.graded}, cores:{...state.cores},
    shelterLevel:state.shelter.level,route:state.shelter.route,modules:state.modules.map(x=>({...x})),
    gear:state.gear.map(x=>({...x})), blueprints:[...state.discoveredModules],
    progress:{...state.explores}
  };
}

function beginExperience(kind, meta={}) {
  activeExperience = {kind, meta:{originPage:typeof currentGamePage==='undefined'?'explore':currentGamePage,...meta}, before:experienceSnapshot()};
}

function finalizeExperience() {
  if (!activeExperience || pendingBattle&&!pendingBattle.resolved) return;
  const {kind,meta,before} = activeExperience, after = experienceSnapshot(), changes=[];
  const add = (key,label,icon,from,to) => {
    if (Math.abs(to-from)>.001) changes.push({key,label,icon,from,to});
  };
  add('actions','行动','↟',before.actions,after.actions);
  add('uses','今日升华','✦',before.uses,after.uses);
  for (const key of new Set([...Object.keys(before.inventory),...Object.keys(after.inventory)])) {
    add(`mat:${key}`,`${itemLabel(key)}${MATS[key]?' · L1':''}`,MATS[key]?.[0]||'◇',before.inventory[key]||0,after.inventory[key]||0);
  }
  for (const key of new Set([...Object.keys(before.graded),...Object.keys(after.graded)])) {
    const [mat,level]=key.split(':');
    add(`graded:${key}`,`${itemLabel(mat)} · L${level}`,MATS[mat]?.[0]||'◇',before.graded[key]||0,after.graded[key]||0);
  }
  add('power','总战力','⚔',before.power,after.power);
  add('hp','生命','♥',before.hp,after.hp);
  add('maxHp','生命上限','♡',before.maxHp,after.maxHp);
  add('shelter','庇护所耐久','⌂',before.shelter,after.shelter);
  add('shelterMax','耐久上限','▥',before.shelterMax,after.shelterMax);
  const newCores = Object.keys(after.cores).filter(k=>(after.cores[k]||0)>(before.cores[k]||0));
  for (const key of new Set([...Object.keys(before.cores),...Object.keys(after.cores)])) {
    add(`core:${key}`,CORES[key]?.[1]||key,CORES[key]?.[0]||'◇',before.cores[key]||0,after.cores[key]||0);
  }
  const record = {
    id:uid(), day:state.day, kind, meta, changes, newCores,
    newGear:after.gear.filter(x=>!before.gear.some(y=>y.uid===x.uid)).map(x=>({uid:x.uid,name:gearDef(x).names[x.level],icon:gearDef(x).icon})),
    newBlueprints:after.blueprints.filter(x=>!before.blueprints.includes(x)),
    before:{power:before.power,hp:before.hp,shelter:before.shelter,shelterMax:before.shelterMax,shelterLevel:before.shelterLevel,route:before.route,modules:before.modules},
    story:JSON.parse(JSON.stringify(state.story))
  };
  if (meta.area) record.progress = {from:before.progress[meta.area]||0,to:after.progress[meta.area]||0};
  state.experienceHistory = [record,...(state.experienceHistory||[])].slice(0,12);
  state.experienceSeen[kind] = true;
  activeExperience = null;
  viewedExperience = null;
  playExperience(record);
  if(typeof presentExperience==='function')presentExperience(record);
}

function nextDisaster() {
  const day=(Math.floor(state.day/5)+1)*5;
  if (day>100) return null;
  const event=MAJOR_EVENTS[day/5-1];
  return {day,left:day-state.day,event,damage:Math.ceil(shelterMaxValue()*event.damage/100)};
}

function maintenanceCost() {
  const scale=1+Math.floor(state.day/25);
  return state.shelter.route?{wood:2*scale,stone:2*scale,water:scale}:{wood:1,stone:1,water:1,food:1};
}

function closestExploration({availableOnly=false}={}) {
  const keys=Object.keys(ACTIONS);
  if (state.shelter.level>=3&&(!availableOnly||state.routeUses<3)) keys.push('route');
  return keys.sort((a,b)=>(10-(state.explores[a]||0)%10)-(10-(state.explores[b]||0)%10))[0];
}

function getNextStep() {
  const disaster=nextDisaster(), chosen=route();
  if (state.gameOver) return {title:state.shelter.hp<=0?'这次旅程结束了':'你已活过百日',text:'回看最近的经历，整理这一轮的成长与取舍。',go:'history',button:'回看经历'};
  if (state.inventory.water<2 || state.inventory.food<2) {
    const water=state.inventory.water<2;
    if(!state.actions){
      if(state.inventory.water>=1&&state.inventory.food>=1)return {title:'余粮够过今晚，先休息恢复行动',text:'今日探索行动已用完。过夜消耗水、食物各1份，明早恢复5次行动，再去补给。',go:'night',button:'回营休息'};
      return {title:'补给不足，今天也已没有探索行动',text:'过夜必须持有L1水、食物各1份。本轮已无法继续，可回看经历并重新开始；下次先留好过夜补给。',go:'history',button:'查看本轮记录',urgent:true};
    }
    return {title:water?'先为过夜备好饮水':'先补充过夜的食物',text:`过夜需要基础水、食物各1份。${water?'小溪每次保底带回6份水。':'森林事件可能找到食物，储肉架可以每日产食物。'}`,go:water?'explore:creek':'explore:forest',button:water?'前往小溪':'前往森林'};
  }
  if (disaster && disaster.left<=1 && state.shelter.hp<=disaster.damage) return {title:'下次过夜，庇护所将无法承受灾难',text:`${disaster.event.name}预计损伤${disaster.damage}耐久，当前只有${displayNumber(state.shelter.hp)}。维修每次需要${costText(maintenanceCost())}。`,go:'repair',button:'查看维修',urgent:true};
  const available=ROUTES.find(r=>(state.cores[r.core]||0)>0);
  if (!chosen && available) return {title:`核心可以唤醒${available.name}`,text:`你已持有${CORES[available.core][1]}。首次进化消耗该核心、木材8、石材5，本轮选定后持续发展这条路线。`,go:`route:${available.id}`,button:'查看进化路线'};
  if (!state.experienceSeen.explore) return {title:'先去河岸带回第一份收获',text:'一次探索消耗1次行动。看一看带回的物资，怎样帮助你度过第一夜。',go:'explore:creek',button:'选择小溪探索'};
  if (state.talentUses>0 && !state.experienceSeen.ascend) return {title:'试试让猎刀进化',text:'今日还有升华机会。已装备的武器进化后，战力立即生效；升华不消耗探索行动。',go:'ascend',button:'查看升华目标'};
  if (state.actions===0) return state.talentUses>0?{title:'结束今天前，还能使用升华',text:`今日剩余${state.talentUses}次，过夜后按每日上限刷新。`,go:'ascend',button:'查看升华'}:{title:'带着今天的收获回营休息',text:'过夜消耗水、食物各1份，并结算营地生产、治疗，恢复5次行动。',go:'night',button:'查看过夜'};
  if (!state.modules.length) {
    const missingWood=state.inventory.wood<3,missingStone=state.inventory.stone<2;
    if(missingWood||missingStone){const material=missingWood?'木材':'石材',area=missingWood?'forest':'ruins',need=missingWood?3-state.inventory.wood:2-state.inventory.stone;return{title:`为第一座收集器准备${material}`,text:`还差${material}${need}份。${missingWood?'森林':'遗迹'}探索每次保底带回6份，建成后每天产水2份。`,go:`explore:${area}`,button:`收集${material}`};}
    return {title:'让营地开始自己产出',text:'露水收集器消耗木材3、石材2，每天产水2份。安装后，下一次清晨就能看到它工作。',go:'module:dew',button:'查看收集器'};
  }
  if (chosen && state.shelter.level<3) return {title:'把庇护所升到3级',text:'3级将开放路线专属区域，每天最多探索3次，仍消耗今日行动。',go:`route:${chosen.id}`,button:'查看下一次进化'};
  const area=closestExploration({availableOnly:true}),left=10-(state.explores[area]||0)%10;
  return {title:`${area==='route'?chosen.name:ACTIONS[area].name}，再推进${left}点发现隐藏馈赠`,text:area==='route'?'专属区域的隐藏馈赠带来高级路线材料和模块图纸。':'普通区域每10点进度必得区域核心、高级材料和一张新图纸。',go:`explore:${area}`,button:'前往探索'};
}

function jumpTo(destination) {
  const [type,id]=destination.split(':');
  if(type==='history'){showGamePage('journal');$('#journeyCard').open=true;return;}
  if(type==='result'){showGamePage('explore',{scroll:false});$('#journeyCard').open=true;$('#journeyCard').scrollIntoView({block:'start',behavior:motionReduced()?'instant':'smooth'});return;}
  if(type==='page'){showGamePage(GAME_PAGES.includes(id)?id:'explore',{focus:true});return;}
  let tab='explore',target=null;
  if(['ascend','shelter','bag'].includes(type))tab=type;
  if(['route','module','repair'].includes(type))tab='shelter';
  if(['equipment','cores'].includes(type))tab='bag';
  showGamePage(tab,{scroll:false});
  if(type==='equipment'||type==='cores'){
    const sub=type==='equipment'?'equipment':'cores';
    $$('[data-sub],.subpanel').forEach(x=>x.classList.remove('active'));
    $(`[data-sub="${sub}"]`).classList.add('active');$(`#${sub}Sub`).classList.add('active');
  }
  if(type==='module'){moduleFilter='全部';renderModules();renderAvailability();target=$(`[data-module-install="${id}"]`)||$(`[data-module-up="${id}"]`)||$(`[data-module-remove="${id}"]`);focusFacility(id);}
  if(type==='route')target=$(`[data-route="${id}"]`);
  if(type==='repair')target=$('#repairShelter');
  if(type==='night')target=$('#nextDay');
  if(type==='explore')target=$(`[data-action="${id}"]`);
  if(type==='equipment'&&id)target=$(`[data-equip="${id}"]`);
  if(type==='ascend')target=$('#useTalent');
  target=target||$(`#${tab}Panel`);revealFoldParents(target);
  const card=target.closest('.route-card,.module-card,.installed-card,.gear-card')||target;
  card.classList.remove('attention');void card.offsetWidth;card.classList.add('attention');
  card.scrollIntoView({behavior:motionReduced()?'instant':'smooth',block:'center'});
  if(target.disabled){card.tabIndex=-1;card.focus({preventScroll:true});}else if(target.focus)target.focus({preventScroll:true});
}

function renderJourneyObjectives() {
  const area=closestExploration(), count=state.explores[area]||0;
  $('#objectives').innerHTML=`<div class="objective"><b>${area==='route'?'专属区域':ACTIONS[area].name} · ${count%10}/10</b><div class="progress"><i style="width:${count%10*10}%"></i></div><small>再${10-count%10}点触发隐藏馈赠</small></div><div class="objective"><b>庇护所成长 · ${state.shelter.level}/10级</b><div class="progress"><i style="width:${state.shelter.level*10}%"></i></div><small>${state.shelter.level<3?'3级开放专属区域':'专属区域每日最多探索3次'}</small></div>`;
}

function renderExperience() {
  const disaster=nextDisaster(),r=route(),step=getNextStep();
  $('#supplyMeters').innerHTML=['water','food','wood','stone'].map(k=>`<div class="supply" data-supply="${k}"><span>${MATS[k][0]}</span><div><small>${MATS[k][1]} · L1</small><b>${state.inventory[k]||0}</b></div></div>`).join('')+`<button class="supply shelter-supply" data-go="repair"><span>⌂</span><div><small>庇护所耐久</small><b>${displayNumber(state.shelter.hp)}<em> / ${shelterMaxValue()}</em></b></div></button>`;
  $('#dayBrief').className=`day-brief${disaster&&state.shelter.hp<=disaster.damage?' danger':''}`;
  $('#dayBrief').textContent=state.gameOver?'本轮旅程已结束':disaster?`${disaster.left}天后 · ${disaster.event.name}｜预计损伤${disaster.damage}耐久`:'最终灾难已度过，结束今日即可通关';
  $('#nextStep').className=`next-step${step.urgent?' urgent':''}`;
  $('#nextStep').innerHTML=`<summary><span class="step-mark">${step.urgent?'!':'↟'}</span><span><small>${step.urgent?'营地预警':'接下来可以做'}</small><b>${escapeText(step.title)}</b></span><span class="fold-chevron" aria-hidden="true"></span></summary><div class="step-body"><p>${escapeText(step.text)}</p><button data-go="${step.go}">${step.button}<span aria-hidden="true"> →</span></button></div>`;
  if(step.urgent)$('#nextStep').open=true;
  const coreReady=!r&&ROUTES.some(x=>(state.cores[x.core]||0)>0);
  if (coreReady) $('#miniShelterEffect').textContent='已持有进化核心，前往庇护所查看可选路线';
  $('#campFacilities').innerHTML=state.modules.length?state.modules.map(m=>{const d=MODULES.find(x=>x.id===m.id);return `<button data-go="module:${m.id}"><canvas class="facility-preview" width="96" height="100" data-module-preview="${m.id}" aria-hidden="true"></canvas><span><b>${d.name}<em>Lv.${m.level}</em></b><small>${moduleEffectText(d,m.level)}</small><small class="facility-output">${escapeText(facilityProductionText(m.id))}</small></span><span aria-hidden="true">↗</span></button>`}).join(''):`<button class="empty-facility" data-go="module:dew"><span class="facility-sprite facility-water" aria-hidden="true"></span><span><b>这里可以建起第一座设施</b><small>建造收集器，让营地在清晨产水</small></span><span aria-hidden="true">＋</span></button>`;
  $('#nextDay').disabled=state.gameOver;
  $('#nextDay').title=`过夜消耗基础水、食物各1份。${state.actions?`剩余${state.actions}次行动不会保留。`:''}${state.talentUses?`今日还有${state.talentUses}次升华可用。`:''}`;
  $('#facilityCount').textContent=`${state.modules.length}/3`;
  $('#sceneFacilities').innerHTML=state.modules.map((m,i)=>{const d=MODULES.find(x=>x.id===m.id),output=facilityProductionText(m.id);return `<button class="facility-hotspot" style="left:${(565+i*120)/9}%" data-go="module:${m.id}" aria-label="${escapeText(d.name+'，'+output+'，查看或升级')}"><span>${escapeText(d.name)}<small>${escapeText(output)}</small></span></button>`;}).join('');
  $('#routeFoldNote').textContent=r?`${r.name} · ${state.shelter.level}级`:'尚未选择';
  $('#blueprintCount').textContent=`已发现${state.discoveredModules.length}张`;
  paintFacilityPreviews();renderRecord();renderAvailability();updateActivityNotice();
}

function renderRecord() {
  const record=(state.experienceHistory||[]).find(x=>x.id===viewedExperience)||(state.experienceHistory||[])[0];
  const initial=!record;
  $('#journeyCard').dataset.kind=record?.kind||'welcome';
  if(record) {
    $('#storyKicker').textContent=`${viewedExperience?'回看 · ':''}第${record.day}天 · ${record.story.kicker}`;
    $('#storyTitle').textContent=record.story.title;$('#storyText').textContent=record.story.text;
  }
  $('#rewardLine').hidden=!!record;
  const changes=record?.changes||[];
  const important=changes.filter(c=>['power','hp','shelter','shelterMax'].includes(c.key));
  const supplies=changes.filter(c=>!important.includes(c));
  const ordered=[...important,...supplies];
  const brief=ordered.filter(c=>!['actions','uses','maxHp','shelterMax'].includes(c.key)).slice(0,4);
  $('#recordSummary').textContent=record?(brief.map(c=>`${c.icon} ${c.to>c.from?'+':''}${displayNumber(c.to-c.from)}`).join(' · ')||'展开查看操作结果'):'展开查看开局提示';
  const changeMarkup=c=>`<div class="change ${c.to>c.from?'gain':'loss'}"><span class="change-icon">${c.icon}</span><div><small>${escapeText(c.label)}</small><b>${displayNumber(c.from)}<span> → </span>${displayNumber(c.to)}</b></div><em>${c.to>c.from?'+':''}${displayNumber(c.to-c.from)}</em></div>`;
  $('#changeList').innerHTML=ordered.slice(0,6).map(changeMarkup).join('')+(ordered.length>6?`<details class="more-changes"><summary>其余${ordered.length-6}项变化</summary>${ordered.slice(6).map(changeMarkup).join('')}</details>`:'');
  if (record?.meta.evolution) {
    const e=record.meta.evolution;
    $('#evolutionReveal').innerHTML=`<div class="evolution-reveal"><div>${e.hero?'<canvas width="140" height="120" data-evolution-pose="hero" aria-label="进化前的旅人"></canvas>':`<span class="evolution-item">${escapeText(e.icon)}</span>`}<small>${escapeText(e.from)}</small></div><span class="evolution-arrow">✦ →</span><div class="evolved">${e.hero?'<canvas width="140" height="120" data-evolution-pose="evolved" aria-label="进化后的旅人，武器发出光芒"></canvas>':`<span class="evolution-item">${escapeText(e.icon)}</span>`}<b>${escapeText(e.to)}</b></div></div>`;
    paintEvolutionSprites();
  } else $('#evolutionReveal').innerHTML='';
  if (record?.meta.battle) {
    const b=record.meta.battle;
    $('#evolutionReveal').innerHTML=`<div class="battle-comparison"><div><small>${b.manual?'开战战力':'你的战力'}</small><b>${b.power}</b></div><strong>${b.mode==='retreat'?'撤退':b.mode==='defeat'?'败退':'胜出'}</strong><div><small>${escapeText(b.name)} · 门槛</small><b>${b.threshold}</b></div></div><p class="effect-explanation">${escapeText(b.explanation)}</p>${b.turns?`<details class="combat-rounds"><summary>查看${b.rounds}个回合的行动</summary>${b.turns.map(x=>`<p>第${x.round}回合 · ${escapeText(x.text)}</p>`).join('')}</details>`:''}${battleSourcesMarkup(b.feedback,b.threshold)}`;
  }
  if(record?.meta.craft){const craft=record.meta.craft,item=MATS[craft.material];$('#evolutionReveal').innerHTML=`<div class="craft-reveal"><div class="craft-inputs"><span>${item[0]}</span><span>${item[0]}</span><span>${item[0]}</span></div><span>→</span><div class="craft-output"><span>${item[0]}</span><b>L${craft.from} → L${craft.to} · ${craft.count}份</b></div></div>`;}
  if(record?.meta.coreAction==='socket'&&CORES[record.meta.coreKey])$('#evolutionReveal').innerHTML=`<div class="socket-reveal"><span class="socket-flash" aria-hidden="true"><i>◇</i><span>${CORES[record.meta.coreKey][0]}</span></span><div><b>核心落入第${record.meta.slot+1}个镶嵌槽</b><small>${escapeText(corePassive(record.meta.coreKey))} · 取下后可用于其他用途</small></div></div>`;
  const links=[];
  if(record?.meta.originPage&&record.meta.originPage!=='explore'&&record.meta.originPage!=='journal'){
    const labels={shelter:'庇护所',bag:'背包',ascend:'升华',codex:'图鉴'};
    links.push(`<button class="receipt-return" data-go="page:${record.meta.originPage}">返回${labels[record.meta.originPage]||'探索'} →</button>`);
  }
  if(record?.meta.disaster)links.push('<button data-go="repair">⌂ 查看维修与材料消耗 →</button>');
  if(record?.kind==='build'&&!record.meta.removed)links.push('<button data-go="night">☾ 查看过夜，见证设施产出 →</button>');
  if(record?.meta.unlockedArea)links.push('<div class="discovery"><span>↟</span><div><b>路线专属区域已开放</b><small>每日最多3次，仍消耗探索行动；可获得路线材料与高级装备。</small></div><button data-go="explore:route">前往专属区域</button></div>');
  const equipId=record?.meta.evolution?.equip;
  if(equipId&&state.gear.some(x=>x.uid===equipId)&&!Object.values(state.equipped).includes(equipId))links.push(`<button data-go="equipment:${escapeText(equipId)}">前往装备，让加成生效 →</button>`);
  for (const key of record?.newCores||[]) {const route=ROUTES.find(x=>x.core===key);links.push(`<div class="discovery"><span>${CORES[key][0]}</span><div><b>发现${CORES[key][1]}</b><small>可用于${route.name}进化，也可镶嵌或升华；每种用途会占用这枚核心。</small></div><button data-go="route:${route.id}">查看路线</button><button data-go="cores">其他用途</button></div>`);}
  for (const gear of record?.newGear||[]) links.push(`<button data-go="equipment:${gear.uid}">${gear.icon} ${escapeText(gear.name)} · 比较并装备 →</button>`);
  for (const id of record?.newBlueprints||[]) {const d=MODULES.find(x=>x.id===id);links.push(`<button data-go="module:${id}">${d.icon} 新图纸：${d.name} · 查看建造 →</button>`);}
  const collection=changes.filter(c=>(c.key.startsWith('graded:')||c.key.startsWith('mat:')&&MATS[c.key.slice(4)])&&(c.from===0||c.to===0));
  if(collection.length)links.push(`<span class="collection-receipt">收藏变化：${collection.map(c=>{const level=c.key.startsWith('graded:')?+c.key.split(':')[2]:1;return`${escapeText(c.label)}${c.to>0?'首次持有，战力 +':'已用尽，战力 −'}${level*3}`;}).join('；')}。保留不同等级，各自提供收藏加成。</span>`);
  if (record?.progress) links.push(`<span class="progress-receipt">探索进度 ${record.progress.from} → ${record.progress.to}｜再${10-record.progress.to%10}点触发下一次隐藏馈赠</span>`);
  if (record?.meta.ledger) links.push(`<div class="settlement-ledger"><b>这一夜，营地发生了什么</b>${record.meta.ledger.map(x=>`<div><span>${escapeText(x.source)}</span><strong>${escapeText(x.effect)}</strong></div>`).join('')}</div>`);
  if (initial) links.push('<span class="welcome-hint">水与食物支撑过夜，木石用于建设。先选择一次探索，收获会在这里留下痕迹。</span>');
  $('#resultLinks').innerHTML=links.join('');
  $('#experienceHistory').innerHTML=(state.experienceHistory||[]).map(x=>`<button data-view-experience="${x.id}" ${viewedExperience===x.id?'aria-current="true"':''}><small>第${x.day}天</small><span>${escapeText(x.story.title)}</span><em>${x.changes.filter(c=>c.to>c.from).slice(0,3).map(c=>`${c.icon}+${displayNumber(c.to-c.from)}`).join(' ')}</em></button>`).join('')||'<p>第一次行动后，这里会保存最近12次经历。回看不会改变游戏进度。</p>';
}

function facilityProductionText(id){
  const definition=MODULES.find(x=>x.id===id);
  if(!['water','food','heal','ore'].includes(definition.effect))return '效果已生效';
  const dawn=state.experienceHistory.find(x=>x.kind==='night'&&x.day===state.day);
  const sources=dawn?.meta.production?.filter(x=>x.name===definition.name)||[];
  return sources.length?'今日清晨：'+sources.map(x=>x.key==='heal'?`生命 +${displayNumber(x.actual)}`:`${itemLabel(x.key)} +${displayNumber(x.actual)}`).join(' · '):'下一次过夜结算产出';
}

function combatEffectSources(effect){
  const rows=[],add=(name,value)=>{if(value)rows.push({name,value});};
  for(const id of Object.values(state.equipped).filter(Boolean)){const item=state.gear.find(x=>x.uid===id),d=item&&gearDef(item);if(d?.effect===effect)add(d.names[item.level],d.value*(item.level+1));}
  for(const m of state.modules){const d=MODULES.find(x=>x.id===m.id);if(d.effect===effect)add(d.name,d.value*m.level);}
  for(const s of state.specials)if(s.effect===effect)add(s.name,s.value*(s.level||1));
  const boost=1+aggregate().coreBoost;
  for(const key of state.coreSlots){const core=CORES[key],kind=core[2];if(effect==='power'&&kind==='lava')add(core[1],12*boost);if(effect==='threshold'&&['frost','poison'].includes(kind))add(core[1],.06*boost);if(effect==='dangerReward'&&kind==='beast')add(core[1],.15*boost);}
  return rows;
}
function combatFeedback(rawThreshold){
  const powers=[{name:'基础战力',value:state.basePower},{name:'不同等级的材料收藏',value:materialPower()},...combatEffectSources('power')];
  if(state.shelter.route==='lava')powers.push({name:route().name,value:state.shelter.level*5});
  if(state.shelter.route==='ancient')powers.push({name:route().name,value:state.shelter.level*2});
  if(state.hp/state.maxHp<.35&&state.modules.some(m=>m.id==='reactor'))powers.push({name:'血肉反应炉 · 低生命加成',value:18});
  const rounded=totalPower()-powers.reduce((sum,x)=>sum+x.value,0);if(Math.abs(rounded)>.001)powers.push({name:'合计取整',value:rounded});
  const threshold=combatEffectSources('threshold');if(routeThresholdBonus())threshold.push({name:route().name,value:routeThresholdBonus()});
  const growth=state.experienceHistory.find(record=>record.changes.some(x=>x.key==='power'&&x.to>x.from));
  return {rawThreshold,power:totalPower(),powers:powers.filter(x=>x.value),threshold,damageReduce:combatEffectSources('damageReduce'),dangerReward:combatEffectSources('dangerReward'),overpower:combatEffectSources('overpower'),growth:growth?{title:growth.story.title,...growth.changes.find(x=>x.key==='power')}:null};
}
function battleSourcesMarkup(feedback,threshold){
  if(!feedback)return '';
  const chips=rows=>rows.map(x=>`<span>${escapeText(x.name)} −${effectNumber('threshold',x.value)}</span>`).join('');
  return `<details class="combat-sources"><summary>查看这次战斗的成长与加成来源</summary><div class="power-sources">${feedback.powers.map(x=>`<div><span>${escapeText(x.name)}</span><i><em style="width:${Math.max(0,x.value)/Math.max(1,feedback.power)*100}%"></em></i><b>${displayNumber(x.value)}</b></div>`).join('')}</div><div class="threshold-source"><b>敌方门槛 ${feedback.rawThreshold} → ${threshold}</b><div>${chips(feedback.threshold)}${feedback.honey?'<span>蜂蜜诱饵 · 削弱后的门槛再降低20%</span>':''}</div></div>${feedback.usedDamageReduce?.length?`<p>本次伤害降低：${feedback.usedDamageReduce.map(x=>`${escapeText(x.name)} ${effectNumber('damageReduce',x.value)}`).join(' · ')}</p>`:''}${feedback.usedRewards?.length?`<p>本次战利品增益：${feedback.usedRewards.map(x=>`${escapeText(x.name)} +${effectNumber('dangerReward',x.value)}`).join(' · ')}</p>`:''}${feedback.growth?`<p class="recent-growth">✦ 最近的成长：${escapeText(feedback.growth.title)} · 战力 ${feedback.growth.from} → ${feedback.growth.to}</p>`:''}</details>`;
}

function missingCost(cost){
  return Object.entries(cost).filter(([k,n])=>(state.inventory[k]||0)<n).map(([k,n])=>({key:k,count:n-(state.inventory[k]||0)}));
}
function missingCostText(cost){
  const missing=missingCost(cost),places={water:'小溪',food:'森林事件',wood:'森林',stone:'遗迹',iron:'遗迹',hide:'森林',honey:'森林事件'};
  return missing.length?'还差：'+missing.map(x=>`${itemLabel(x.key)}${x.count}份${places[x.key]?`（${places[x.key]}）`:''}`).join('、'):'材料已齐备';
}
function renderAvailability() {
  $$('[data-module-install]').forEach(button=>{
    const d=MODULES.find(x=>x.id===button.dataset.moduleInstall),card=button.closest('.module-card');
    let note=card.querySelector('.availability');if(!note){note=document.createElement('small');note.className='availability';card.append(note);}
    const missing=Object.entries(d.cost).filter(([k,n])=>(state.inventory[k]||0)<n);
    button.disabled=state.gameOver||state.modules.length>=3||missing.length>0;
    note.textContent=state.gameOver?'本轮已结束':state.modules.length>=3?'3个设施位置已满，拆卸需要解构水晶':missing.length?missingCostText(d.cost):'材料已齐备 · 建造不消耗行动';
  });
  $$('[data-module-up]').forEach(button=>{
    const m=state.modules.find(x=>x.id===button.dataset.moduleUp),cost=moduleUpgradeCost(m),card=button.closest('.installed-card');
    let note=card.querySelector('.upgrade-cost');if(!note){note=document.createElement('small');note.className='availability upgrade-cost';card.append(note);}
    button.disabled=state.gameOver||!canPay(cost);note.textContent=`升级消耗：${costText(cost)}。${state.gameOver?'本轮已结束':missingCostText(cost)}`;
  });
  $$('[data-module-remove]').forEach(button=>{
    const card=button.closest('.installed-card');let note=card.querySelector('.remove-cost');if(!note){note=document.createElement('small');note.className='availability remove-cost';card.append(note);}
    button.disabled=state.gameOver||(state.inventory.releaseCrystal||0)<1;note.textContent=state.gameOver?'本轮已结束':'拆卸消耗解构水晶×1并退还投入材料；'+((state.inventory.releaseCrystal||0)<1?'解构水晶可在每5天的灾难后获得':'解构水晶已齐备');
  });
  $$('[data-route]').forEach(button=>{
    const r=ROUTES.find(x=>x.id===button.dataset.route),card=button.closest('.route-card');
    let note=card.querySelector('.availability');if(!note){note=document.createElement('small');note.className='availability';card.append(note);}
    const selected=state.shelter.route===r.id,next=selected?state.shelter.level+1:1;
    if(state.gameOver){button.disabled=true;note.textContent='本轮已结束';return;}
    if(state.shelter.route&&!selected){note.textContent='本轮已选择其他路线';return;}
    if(next>10){note.textContent='已完成终极进化';return;}
    const missing=Object.entries(shelterCost(r,next)).filter(([k,n])=>(CORES[k]?state.cores[k]||0:state.inventory[k]||0)<n);
    note.textContent=missing.length?`还差：${missing.map(([k,n])=>`${CORES[k]?.[1]||itemLabel(k)}×${n-(CORES[k]?state.cores[k]||0:state.inventory[k]||0)}`).join('、')}${missing.some(([k])=>CORES[k])?`；探索${r.source}可发现核心`:''}`:selected?'材料已齐备，可继续进化':'可以进化 · 消耗核心，本轮路线将固定';
  });
  const cost=maintenanceCost(),restore=Math.min(state.shelter.route?15:5,shelterMaxValue()-state.shelter.hp),repair=$('#repairShelter');
  repair.disabled=state.gameOver||restore<=0||!canPay(cost);
  $('#repairNote').textContent=state.gameOver?'本轮已结束':restore<=0?'耐久已满，无需维修':`维修消耗：${costText(cost)}，本次恢复${displayNumber(restore)}耐久。${missingCostText(cost)}`;
  repair.title=$('#repairNote').textContent;
  $('#useTalent').textContent=state.gameOver?'本轮已结束':state.talentUses<1?'今日升华已用完 · 过夜后刷新':'选择今日升华目标';
  $('#practiceBattle').disabled=state.gameOver||!!pendingBattle;
  $$('[data-action]').forEach(button=>{if(button.disabled)button.querySelector('small').textContent=state.gameOver?'本轮已结束':state.actions<1?'今日行动已用完，过夜恢复':button.dataset.action==='route'?'今日专属区域3次已用完，过夜刷新':'';});
  $$('[data-core-equip]').forEach(button=>{if(state.coreSlots.length>=2){button.textContent='镶嵌槽已满';button.title='前往庇护所的核心镶嵌，取下一枚核心后再镶嵌';}});
  if(state.gameOver)$$('[data-equip],[data-unequip],[data-core-equip],[data-core-remove],[data-core-break]').forEach(button=>{button.disabled=true;button.title='本轮已结束';});
}

function initExperience() {
  state.experienceHistory ||= [];
  state.experienceSeen ||= {};
  state.feedbackPrefs={fast:false,reduced:false,...state.feedbackPrefs};
  $('#historyToggle').onclick=()=>jumpTo('history');
  $('#speedToggle').onclick=()=>{state.feedbackPrefs.fast=!state.feedbackPrefs.fast;syncMotionControls();save();};
  $('#motionToggle').onclick=()=>{state.feedbackPrefs.reduced=!state.feedbackPrefs.reduced;syncMotionControls();if(motionReduced())stopScenePlayback();save();};
  $('#skipScene').onclick=stopScenePlayback;
  document.addEventListener('click',event=>{
    const go=event.target.closest('[data-go]');if(go)jumpTo(go.dataset.go);
    const history=event.target.closest('[data-view-experience]');if(history){showGamePage('journal',{scroll:false});viewedExperience=history.dataset.viewExperience;renderRecord();$('#journeyCard').open=true;$('#journeyCard').scrollIntoView({block:'nearest',behavior:motionReduced()?'instant':'smooth'});}
  });
  document.addEventListener('keydown',event=>{
    if(pendingBattle)return;
    const modal=$('.modal.show');
    if(event.key==='Escape'){if($('#choiceModal').classList.contains('show'))closeModal('choiceModal');else if(!modal)stopScenePlayback();}
    if(event.key==='Tab'&&modal){const buttons=[...modal.querySelectorAll('button:not(:disabled),select')],first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  initNavigation();
  syncMotionControls();
}

// These same sources power the simulation and its settlement receipt.
function dailyProductionSources() {
  const sources=[];
  const add=(name,key,amount,icon)=>{if(amount>0)sources.push({name,key,amount,icon});};
  for(const m of state.modules){const d=MODULES.find(x=>x.id===m.id),n=d.value*m.level;if(['water','food','heal'].includes(d.effect))add(d.name,d.effect,n,d.icon);if(d.effect==='ore'){add(d.name,'stone',n,d.icon);add(d.name,'iron',Math.max(1,Math.floor(n/2)),d.icon);}}
  const boost=1+aggregate().coreBoost;
  for(const key of state.coreSlots){const core=CORES[key],r=core[2];if(r==='water')add(core[1],'water',2*boost,core[0]);if(r==='ancient')add(core[1],'food',boost,core[0]);if(r==='holy')add(core[1],'heal',5*boost,core[0]);}
  for(const special of state.specials)if(special.effect==='heal')add(special.name,'heal',special.value*special.level,special.icon);
  for(const id of Object.values(state.equipped).filter(Boolean)){const it=state.gear.find(x=>x.uid===id),d=it&&gearDef(it);if(d?.effect==='heal')add(d.names[it.level],'heal',d.value*(it.level+1),d.icon);}
  const r=route(),l=state.shelter.level;
  if(r?.id==='water')add(r.name,'water',l*2,r.icon);
  if(r?.id==='ancient')add(r.name,'food',Math.ceil(l/2),r.icon);
  if(r?.id==='holy')add(r.name,'heal',l*4,r.icon);
  if(r?.id==='machine'){add(r.name,'stone',Math.ceil(l/2),r.icon);add(r.name,'iron',Math.ceil(l/3),r.icon);}
  return sources;
}
