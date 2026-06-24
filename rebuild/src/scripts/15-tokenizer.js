/* ohPrimer tokenizer — Document {blocks} -> {words,originals,pacing,segments,chapters}
   Ported verbatim from index.html (see rebuild/README.md). Pure, no DOM/state deps. NOTE: the MAX_TOKEN_CHARS long-token skip mangles
   space-less scripts (CJK/Thai) — tracked as ISSUES M8, documented in tests, not
   yet fixed (needs real CJK fixtures). */

const MAX_TOKEN_CHARS=30;

function getPunctuationDelay(w){
  if(/[.!?]$/.test(w))return 1.7;
  if(/[;:]$/.test(w))return 1.2;
  if(/,$/.test(w))return 1.0;
  if(/[-–—]$/.test(w))return 1.0;
  return w.length>10?1.1:1.0;
}

function abbreviateUrl(url){
  try{
    const u=new URL(url);
    const host=u.hostname.replace(/^www\./,"");
    const segs=u.pathname.split("/").filter(Boolean);
    if(segs.length===0)return host;
    if(segs.length===1)return host+"/"+segs[0];
    const last=segs[segs.length-1];
    return host+"/…/"+last;
  }catch{
    return url.length>MAX_TOKEN_CHARS?url.slice(0,MAX_TOKEN_CHARS-1)+"…":url;
  }
}

function emitToken(raw,st){
  // URL abbreviation
  if(/^https?:\/\//i.test(raw)){
    st.words.push(abbreviateUrl(raw));
    st.originals.push(raw);
    st.pacing.push(1.0);
    return;
  }
  // Long-token skip
  if(raw.length>MAX_TOKEN_CHARS){
    st.words.push("…");
    st.originals.push(raw);
    st.pacing.push(1.0);
    st.skipped++;
    return;
  }
  // Hyphenated compound split (hyphen only, not em/en dash)
  if(raw.length>6&&raw.includes("-")&&!/[–—]/.test(raw)){
    const parts=raw.split("-").filter(Boolean);
    if(parts.length>1){
      parts.forEach((p,i)=>{
        st.words.push(p);
        st.originals.push(raw);
        st.pacing.push(i<parts.length-1?0.8:getPunctuationDelay(p));
      });
      return;
    }
  }
  st.words.push(raw);
  st.originals.push(raw);
  st.pacing.push(getPunctuationDelay(raw));
}

function tokenizeText(text,state){
  // Strip invisible Unicode chars (zero-width spaces, joiners, soft hyphens, BOM)
  // that survive web copy-paste and break word splitting.
  const clean=text.replace(/[\u200B\u200C\u200D\u2060\u00AD\uFEFF]/g,"");
  const raw=clean.split(/\s+/).filter(Boolean);
  for(const w of raw)emitToken(w,state);
}

function tokenizeDocument(doc){
  const st={words:[],originals:[],pacing:[],segments:new Map(),chapters:[],skipped:0,blockStartWordIdx:new Array((doc.blocks||[]).length)};
  for(let bi=0;bi<(doc.blocks||[]).length;bi++){
    st.blockStartWordIdx[bi]=st.words.length;
    const block=doc.blocks[bi];
    if(block.type==="chapter"){
      st.chapters.push({idx:st.words.length,title:block.title});
      continue;
    }
    if(block.type==="segment"){
      const segIdx=st.words.length;
      st.segments.set(segIdx,{kind:block.kind,content:block.content});
      st.words.push("["+block.kind+"]");
      st.originals.push("["+block.kind+"]");
      st.pacing.push(1.5);
      continue;
    }
    if(block.type==="text"&&block.text){
      tokenizeText(block.text,st);
      // Paragraph break — appended as a zero-width pause via a softer delay on the last word is ok;
      // but a real pause benefits readability. We add a small "paragraph ghost" through pacing.
      if(st.pacing.length)st.pacing[st.pacing.length-1]=Math.max(st.pacing[st.pacing.length-1],1.5);
    }
  }
  return st;
}
