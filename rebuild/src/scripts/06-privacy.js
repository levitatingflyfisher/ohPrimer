/* ohPrimer privacy — egress consent gate
   Ported verbatim from index.html (see rebuild/README.md). Sticky per-profile consent (PRIVACY.md). Depends on 05-state (activeProfile,
   persist) and confirmAction (UI, not yet ported; stubbed in tests). */

async function confirmEgress(key,message){
  const p=activeProfile();
  p.prefs.egressConsent=p.prefs.egressConsent||{};
  if(p.prefs.egressConsent[key])return true;
  const ok=await confirmAction({title:"Send data off your device?",message,okLabel:"Send & remember",danger:true});
  if(ok){p.prefs.egressConsent[key]=Date.now();persist();}
  return ok;
}
