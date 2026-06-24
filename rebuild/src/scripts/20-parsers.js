/* ohPrimer parsers — text ingestion (-> Document {blocks} for the tokenizer)
   Ported verbatim from index.html (see rebuild/README.md). parseTextFile is pure. EPUB (parseEpubFile, DOMParser) and PDF (parsePdfFile,
   pdf.js) still live in index.html and are TODO here — they carry deferred H1/H8. */

function parseTextFile(text,title){
  const blocks=[];
  const lines=text.replace(/[\uFEFF\u200B\u200C\u200D\u2060\u00AD]/g,"").split(/\r?\n/);
  let i=0;
  let proseBuffer=[];

  const flushProse=()=>{
    if(proseBuffer.length){
      blocks.push({type:"text",text:proseBuffer.join(" ").replace(/\s+/g," ").trim()});
      proseBuffer=[];
    }
  };

  while(i<lines.length){
    const line=lines[i];
    const trim=line.trim();

    // Chapter heading heuristic
    if(/^\s*(chapter|part|book)\s+[ivxlcdm\d]+/i.test(trim)&&trim.length<80){
      flushProse();
      blocks.push({type:"chapter",title:trim});
      i++;
      continue;
    }

    // Divider / ASCII art run (high ratio of =/-/_)
    if(trim.length>3&&trim.replace(/[=\-_*~]/g,"").length<=Math.max(2,trim.length*0.2)){
      // A divider separates paragraphs — flush the current one so the prose on
      // either side doesn't get glued together (M9), then drop the divider itself.
      flushProse();
      i++;
      continue;
    }

    // Indented code block (3+ consecutive lines with 4+ leading spaces or tab)
    if(/^(    |\t)/.test(line)){
      let end=i;
      while(end<lines.length&&(/^(    |\t)/.test(lines[end])||lines[end].trim()==="")){
        end++;
      }
      const codeLines=lines.slice(i,end).filter(l=>l.length>0);
      if(codeLines.length>=3){
        flushProse();
        blocks.push({type:"segment",kind:"code",content:codeLines.map(l=>l.replace(/^(    |\t)/,"")).join("\n")});
        i=end;
        continue;
      }
    }

    // Table heuristic: 3+ consecutive lines each with 2+ | chars in similar positions
    if((trim.match(/\|/g)||[]).length>=2){
      let end=i;
      while(end<lines.length&&(lines[end].match(/\|/g)||[]).length>=2)end++;
      if(end-i>=3){
        flushProse();
        blocks.push({type:"segment",kind:"table",content:lines.slice(i,end).join("\n")});
        i=end;
        continue;
      }
    }

    // Blank line → paragraph break
    if(trim===""){
      flushProse();
      i++;
      continue;
    }

    proseBuffer.push(trim);
    i++;
  }
  flushProse();

  return {title:title||"Text",blocks};
}
