const GAME_PAGES=['explore','shelter','bag','ascend','codex','journal'];
let currentGamePage='explore';

function gamePageFromHash(){
  const key=window.location.hash.slice(1);
  return GAME_PAGES.includes(key)?key:'explore';
}
function showGamePage(page,{historyMode='push',focus=false,scroll=true}={}){
  if(typeof pendingBattle!=='undefined'&&pendingBattle&&page!=='explore')return;
  if(!GAME_PAGES.includes(page))page='explore';
  if(page!=='explore'&&typeof scenePlayback!=='undefined'&&scenePlayback)stopScenePlayback({resources:false});
  const changed=page!==currentGamePage;currentGamePage=page;
  for(const key of GAME_PAGES){
    const panel=$(`#${key}Panel`),tab=$(`[data-tab="${key}"]`),selected=key===page;
    panel.hidden=!selected;panel.inert=!selected;panel.classList.toggle('active',selected);
    tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  }
  const slot=$(`#${page==='journal'?'journal':'explore'}RecordSlot`),receipt=$('#journeyCard');
  if(receipt.parentElement!==slot)slot.append(receipt);
  const folds=state.feedbackPrefs.folds||{};
  receipt.open=page==='journal'?(folds.receiptJournal??true):(folds.receiptExplore??folds.journeyCard??false);
  if(changed&&page!=='journal'){viewedExperience=null;renderRecord();}
  if(historyMode!=='none'&&window.location.hash!==`#${page}`)window.history[historyMode==='replace'?'replaceState':'pushState']({page},'',`#${page}`);
  if(scroll&&changed)$('.topbar').scrollIntoView({block:'start',behavior:'instant'});
  if(focus)$(`[data-tab="${page}"]`).focus({preventScroll:true});
  updateActivityNotice();
}
function revealFoldParents(element){
  let ancestor=element?.parentElement;
  while(ancestor){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}
}
function presentExperience(record){
  const important=record.kind==='ascend'||record.kind==='route'||record.meta.disaster||record.newCores.length||record.newGear.length||record.newBlueprints.length;
  const firstBuild=record.kind==='build'&&!state.experienceSeen.firstBuildReceipt;
  if(important||firstBuild)$('#journeyCard').open=true;
  if(firstBuild)state.experienceSeen.firstBuildReceipt=true;
  updateActivityNotice();
}
function updateActivityNotice(){
  const record=state.experienceHistory?.[0],notice=$('#activityNotice');
  notice.hidden=currentGamePage==='explore'||currentGamePage==='journal'||!record||record.meta.originPage!==currentGamePage;
  if(!notice.hidden)notice.innerHTML=`${record.meta.coreAction==='socket'&&CORES[record.meta.coreKey]?`<span class="socket-flash" aria-hidden="true"><i>◇</i><span>${CORES[record.meta.coreKey][0]}</span></span>`:''}${record.meta.craft?`<span class="notice-craft" aria-hidden="true">${MATS[record.meta.craft.material][0]} → <b>${MATS[record.meta.craft.material][0]} L${record.meta.craft.to}</b></span>`:''}<span>${escapeText(record.story.title)}</span><button data-go="result">查看操作结果</button>`;
}
function initNavigation(){
  state.feedbackPrefs.folds={...state.feedbackPrefs.folds};
  $$('[data-remember-fold]').forEach(fold=>{
    if(typeof state.feedbackPrefs.folds[fold.id]==='boolean')fold.open=state.feedbackPrefs.folds[fold.id];
    fold.addEventListener('toggle',()=>{
      state.feedbackPrefs.folds||={};
      const key=fold.id==='journeyCard'?(currentGamePage==='journal'?'receiptJournal':'receiptExplore'):fold.id;
      state.feedbackPrefs.folds[key]=fold.open;save();
    });
  });
  $$('.primary-tabs [data-tab]').forEach((tab,index,tabs)=>{
    tab.onclick=()=>showGamePage(tab.dataset.tab,{focus:true});
    tab.addEventListener('keydown',event=>{
      let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
      event.preventDefault();showGamePage(tabs[next].dataset.tab,{focus:true});
    });
  });
  window.addEventListener('popstate',()=>showGamePage(gamePageFromHash(),{historyMode:'none',scroll:false}));
  window.addEventListener('hashchange',()=>showGamePage(gamePageFromHash(),{historyMode:'none',scroll:false}));
  showGamePage(gamePageFromHash(),{historyMode:'replace',scroll:false});
}
