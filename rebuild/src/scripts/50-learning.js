/* ohPrimer learning — SM-2 spaced repetition + review stats
   Ported verbatim from index.html (see rebuild/README.md). Pure scheduling/aggregation (uses Date). The review UI (enterReview/renderReview)
   stays in index.html until the UI module is ported. */

function sm2(rec,grade){
  let EF=rec.EF||2.5,reps=rec.reps||0,interval=rec.interval||0;
  if(grade>=3){
    if(reps===0)interval=1;
    else if(reps===1)interval=6;
    else interval=Math.round(interval*EF);
    reps++;
  }else{
    reps=0;interval=1;
  }
  EF=Math.max(1.3,EF+(0.1-(5-grade)*(0.08+(5-grade)*0.02)));
  return{EF,reps,interval,nextReview:Date.now()+interval*86400000};
}

function computeReviewStats(extracts){
  let total=extracts.length;
  const allGrades=[];
  const days=new Set();
  for(const r of extracts){
    if(!Array.isArray(r.history))continue;
    for(const h of r.history){
      allGrades.push(h.g);
      days.add(new Date(h.t).toDateString());
    }
  }
  let retention=null;
  if(allGrades.length){
    const good=allGrades.filter(g=>g>=3).length;
    retention=Math.round(100*good/allGrades.length);
  }
  // Streak: consecutive days ending today (or yesterday, to be lenient)
  let streak=0;
  const today=new Date();today.setHours(0,0,0,0);
  let cursor=today.getTime();
  const hasToday=days.has(new Date(cursor).toDateString());
  const hasYesterday=days.has(new Date(cursor-86400000).toDateString());
  if(!hasToday&&hasYesterday)cursor-=86400000;
  while(days.has(new Date(cursor).toDateString())){streak++;cursor-=86400000;}
  return{total,retention,streak};
}
