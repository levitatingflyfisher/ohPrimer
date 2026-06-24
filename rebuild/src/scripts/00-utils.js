/* ohPrimer core utilities (pure, dependency-free)
   Ported verbatim from index.html (see rebuild/README.md). No DOM/state deps — load first; unit-tested in isolation. */

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}

function bytesToHex(b){return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");}

function hexToBytes(h){
  if(typeof h!=="string"||h.length%2||!/^[0-9a-f]*$/i.test(h))throw new Error("Invalid hex string");
  const out=new Uint8Array(h.length/2);
  for(let i=0;i<out.length;i++)out[i]=parseInt(h.substr(i*2,2),16);
  return out;
}

function bytesToBase64(b){let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s);}

function base64ToBytes(s){const b=atob(s);const out=new Uint8Array(b.length);for(let i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out;}

function isLocalEndpoint(u){
  try{
    const h=new URL(u).hostname.toLowerCase().replace(/^\[|\]$/g,"");
    return h==="localhost"||h==="127.0.0.1"||h==="::1"||h.endsWith(".local")
      ||/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }catch{return false;}
}

function assertSafeFetchUrl(raw){
  let u;
  try{u=new URL(raw);}catch{throw new Error("That doesn't look like a valid web address.");}
  if(u.protocol!=="http:"&&u.protocol!=="https:")
    throw new Error("Only http(s) addresses can be loaded.");
  const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(isLocalEndpoint(raw)||/^169\.254\./.test(h)||h==="0.0.0.0"||h===""||h==="::"
     ||/^fe80:/i.test(h)||/^f[cd][0-9a-f]{2}:/i.test(h))
    throw new Error("Local and private-network addresses can't be loaded.");
  return u.href;
}

function sanitizeImported(v,depth=0){
  if(depth>30||v===null||typeof v!=="object")return v;
  if(v instanceof Blob||v instanceof ArrayBuffer||ArrayBuffer.isView(v))return v;
  if(Array.isArray(v))return v.map(x=>sanitizeImported(x,depth+1));
  const out={};
  for(const k of Object.keys(v)){
    if(k==="__proto__"||k==="constructor"||k==="prototype")continue;
    out[k]=sanitizeImported(v[k],depth+1);
  }
  return out;
}

function decodeResponseBytes(bytes,contentType){
  const ascii=new TextDecoder("ascii",{fatal:false}).decode(bytes.slice(0,4096));
  let charset=null;
  let m=ascii.match(/<meta[^>]+charset\s*=\s*["']?([a-z0-9_-]+)/i);
  if(m)charset=m[1];
  if(!charset){
    m=ascii.match(/<\?xml[^>]+encoding\s*=\s*["']([a-z0-9_-]+)/i);
    if(m)charset=m[1];
  }
  if(!charset&&contentType){
    m=contentType.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i);
    if(m)charset=m[1];
  }
  if(charset&&/^iso-?8859-?1$/i.test(charset))charset="windows-1252";
  if(charset){
    try{return new TextDecoder(charset.toLowerCase()).decode(bytes);}catch{}
  }
  const u8=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
  const bad=(u8.match(/\uFFFD/g)||[]).length;
  if(bad>3){
    try{return new TextDecoder("windows-1252").decode(bytes);}catch{}
  }
  return u8;
}

function resolveHref(href,navDir){
  if(!href)return "";
  const [path,frag]=href.split("#");
  if(!path)return href;
  const parts=(navDir+path).split("/");
  const resolved=[];
  for(const seg of parts){
    if(seg===""||seg===".")continue;
    if(seg===".."){resolved.pop();continue;}
    resolved.push(seg);
  }
  return resolved.join("/")+(frag?"#"+frag:"");
}

function findZipImage(zip,src){
  if(!src)return null;
  const dec=(s)=>{try{return decodeURIComponent(s);}catch{return s;}};
  const variants=[src,dec(src),src.replace(/^\//,""),dec(src).replace(/^\//,"")];
  for(const v of variants){const f=zip.file(v);if(f)return f;}
  const base=dec(src.split("/").pop()||"").toLowerCase();
  if(base){
    const hit=Object.values(zip.files).find(f=>!f.dir&&f.name.split("/").pop().toLowerCase()===base);
    if(hit)return hit;
  }
  return null;
}

async function pinDigest(pin,saltHex){
  const data=new TextEncoder().encode(saltHex+":"+pin);
  const buf=await crypto.subtle.digest("SHA-256",data);
  return bytesToHex(new Uint8Array(buf));
}
