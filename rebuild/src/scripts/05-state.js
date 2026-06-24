/* ohPrimer state + persistence
   Ported verbatim from index.html (see rebuild/README.md). localStorage-backed profile/prefs store. saveStore calls showToast (UI) on
   failure; otherwise self-contained. Provides activeProfile/persist used elsewhere. */

const STORE_KEY="openhearth_primer_v01";

function defaultPrefs(){return{wpm:300,mode:"classic",fSize:44,theme:"auto",autoSkipSegments:false,pagePanelOpen:true,contextStrip:true,highContrast:false,dyslexiaFont:false,parentPin:"",sync:{relayUrl:"",seed:""},ai:{provider:"none",key:"",baseUrl:"",model:""}}}

const PID_ADJ=["gentle","bright","calm","warm","kind","brave","swift","quiet","bold","true","wild","soft","keen","fair","glad","wise","dear","free","good","pure","cozy","snug","tall","deep","cool","wide","young","clear","still","steady","golden","mossy","misty","little","rosy","sleepy","lucky","merry","sunny","earthy"];

const PID_NOUN=["oak","elm","fern","moon","star","dawn","lake","hill","brook","grove","nest","hearth","flame","stone","leaf","rain","snow","wind","path","song","bell","home","light","spark","shore","field","rose","sage","pine","creek","vale","finch","wren","fox","hare","lark","porch","cove","barn","glen"];

function genPid(){
  const a=PID_ADJ[Math.floor(Math.random()*PID_ADJ.length)];
  const n=PID_NOUN[Math.floor(Math.random()*PID_NOUN.length)];
  const tag=Math.floor(Math.random()*90+10);
  return a+"-"+n+"-"+tag;
}

function defaultProfile(name="Reader"){return{name,pid:genPid(),feeds:[],stats:{wordsRead:0,minutes:0,sessions:0},prefs:defaultPrefs()}}

function loadStore(){try{return JSON.parse(localStorage.getItem(STORE_KEY))||null}catch{return null}}

let _persistWarned=false;

function saveStore(s){
  try{localStorage.setItem(STORE_KEY,JSON.stringify(s));_persistWarned=false;return true;}
  catch(e){
    console.warn("saveStore failed",e);
    // Surface a persistent failure once (quota full / private mode) instead of
    // silently losing prefs, stats, and the migration flag (M5).
    if(!_persistWarned){_persistWarned=true;try{showToast("Couldn't save — browser storage may be full or blocked");}catch{}}
    return false;
  }
}

function persist(){saveStore(state)}

function getState(){
  const s=loadStore();
  if(!s||!Array.isArray(s.profiles)||!s.profiles.length)return{profiles:[defaultProfile()],activeProfile:0};
  s.profiles=s.profiles.map((p,i)=>({...defaultProfile(p.name),...p,pid:p.pid||("p"+i),prefs:{...defaultPrefs(),...(p.prefs||{})},stats:{...{wordsRead:0,minutes:0,sessions:0},...(p.stats||{})}}));
  if(typeof s.activeProfile!=="number"||s.activeProfile<0||s.activeProfile>=s.profiles.length)s.activeProfile=0;
  return s;
}

function activeProfile(){return state.profiles[state.activeProfile]||state.profiles[0]}

function bookId(profileIdx,filename,size){return profileIdx+"::"+filename+"::"+(size||0);}

let state=getState();
