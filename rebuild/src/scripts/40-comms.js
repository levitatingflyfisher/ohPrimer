/* ohPrimer comms layer — networking / fetch plumbing
   Ported verbatim from index.html (see rebuild/README.md). Depends on 00-utils and, from modules not yet ported: confirmEgress, activeProfile.
   Provide those before assembly; the tests stub them. */

const MAX_TEXT_FETCH_BYTES=25*1024*1024;   // article/page fetch ceiling (H16)

const MAX_AUDIO_FETCH_BYTES=300*1024*1024;   // podcast episode ceiling (H16)

const CORS_PROXIES=[
  u=>"https://cors.eu.org/"+u,
  u=>"https://api.allorigins.win/raw?url="+encodeURIComponent(u),
  u=>"https://api.codetabs.com/v1/proxy?quest="+encodeURIComponent(u),
];

const BINARY_PROXIES=[
  u=>"https://cors.eu.org/"+u,
  u=>"https://api.allorigins.win/raw?url="+encodeURIComponent(u),
];

function fetchT(url,ms=8000){
  return fetch(url,{signal:AbortSignal.timeout(ms)});
}

async function fetchAndDecode(r){
  const buf=await r.arrayBuffer();
  if(buf.byteLength>MAX_TEXT_FETCH_BYTES)
    throw new Error("Fetched page is too large (over 25 MB) — refusing to load.");
  return decodeResponseBytes(new Uint8Array(buf),r.headers.get("content-type")||"");
}

function proxyConsented(){
  const p=activeProfile();
  return !!(p&&p.prefs&&p.prefs.egressConsent&&p.prefs.egressConsent.proxy);
}

async function ensureProxyConsent(interactive){
  if(proxyConsented())return true;
  if(!interactive)return false;
  return await confirmEgress("proxy",
    "This page didn't allow a direct fetch. Loading it requires routing the address and its contents through a public CORS proxy (cors.eu.org / allorigins.win / codetabs.com), so a third party would see them. Allow public proxies for this profile?");
}

async function fetchWithProxies(url,opts){
  assertSafeFetchUrl(url);
  const interactive=!opts||opts.interactive!==false;
  // Try direct first (short timeout — CORS failures are fast, hangs are not)
  try{const r=await fetchT(url,5000);if(r.ok)return await fetchAndDecode(r);throw new Error(r.status);}catch{}
  // Direct failed → public-proxy fallback leaves the device. Gate on consent.
  if(!(await ensureProxyConsent(interactive)))
    throw new Error("Direct fetch failed and public proxies are off (enable them when prompted, or paste the text instead).");
  for(const mkUrl of CORS_PROXIES){
    try{
      const r=await fetchT(mkUrl(url));
      if(r.ok)return await fetchAndDecode(r);
    }catch{}
  }
  throw new Error("Blocked by CORS — all proxies failed. Try pasting the article text instead.");
}

async function fetchFeedConditional(url,meta){
  assertSafeFetchUrl(url);
  meta=meta||{};
  // Direct first — only path where conditional headers are meaningful.
  const headers={};
  if(meta.etag)headers["If-None-Match"]=meta.etag;
  if(meta.lastModified)headers["If-Modified-Since"]=meta.lastModified;
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(8000),headers});
    if(r.status===304)return{status:"notModified"};
    if(r.status===429||r.status===503){
      const ra=r.headers.get("retry-after");
      let retrySec=60;
      if(ra){
        const n=parseInt(ra,10);
        if(!isNaN(n))retrySec=n;
        else{const d=Date.parse(ra);if(!isNaN(d))retrySec=Math.max(1,Math.round((d-Date.now())/1000));}
      }
      return{status:"throttled",retryAfter:retrySec};
    }
    if(r.status===404||r.status===410)return{status:"notFound"};
    if(r.ok){
      const body=await fetchAndDecode(r);
      return{
        status:"fresh",
        body,
        etag:r.headers.get("etag")||null,
        lastModified:r.headers.get("last-modified")||null,
      };
    }
    // 4xx: treat as error, caller decides whether to mark broken
    return{status:"error",code:r.status};
  }catch{}
  // Fall back to proxies — but never prompt here (this runs during background
  // refresh); only use them if the profile already consented (see ISSUES.md C5).
  if(!proxyConsented())return{status:"error"};
  for(const mkUrl of CORS_PROXIES){
    try{
      const r=await fetchT(mkUrl(url));
      if(r.ok){
        const body=await fetchAndDecode(r);
        return{status:"fresh",body,etag:null,lastModified:null,viaProxy:true};
      }
    }catch{}
  }
  return{status:"error"};
}

async function fetchBinaryWithProxies(url,onProgress,opts){
  assertSafeFetchUrl(url);
  const interactive=!opts||opts.interactive!==false;
  // Media hosts (pdst.fm, megaphone.fm, transistor.fm) don't send CORS headers,
  // so direct fetch fails. <audio> can play cross-origin; fetch() can't read bytes
  // without a proxy. Try direct first (some podcasts DO allow CORS), then proxies.
  const tryFetch=async(u,timeout=60000)=>{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),timeout);
    try{
      const r=await fetch(u,{signal:ctrl.signal});
      if(!r.ok)throw new Error("status "+r.status);
      const total=+r.headers.get("content-length")||0;
      if(!r.body){const b=await r.blob();return b;}
      const reader=r.body.getReader();const chunks=[];let got=0;
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        chunks.push(value);got+=value.length;
        if(got>MAX_AUDIO_FETCH_BYTES){try{reader.cancel();}catch{}throw new Error("Episode exceeds the 300 MB cap.");}
        if(onProgress)onProgress(total?Math.round(100*got/total):null,got,total);
      }
      return new Blob(chunks,{type:r.headers.get("content-type")||"audio/mpeg"});
    }finally{clearTimeout(t);}
  };
  try{return await tryFetch(url,15000);}catch{}
  // Direct failed → public-proxy fallback leaves the device (see ISSUES.md C5).
  if(!(await ensureProxyConsent(interactive)))
    throw new Error("Podcast host blocks direct browser fetch and public proxies are off. Enable them when prompted, or drop the MP3 in via the Audio button.");
  for(const mkUrl of BINARY_PROXIES){
    try{return await tryFetch(mkUrl(url),120000);}catch{}
  }
  throw new Error("Podcast host blocks browser fetch and all CORS proxies failed. Try saving the MP3 locally and dropping it in via the Audio button.");
}
