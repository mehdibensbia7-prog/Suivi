// compare_expected.js
// Usage: charger ce script dans la console du navigateur après avoir importé les fichiers dans l'app,
// puis exécuter `compareWithExpected()` pour générer un rapport JSON téléchargeable.

async function compareWithExpected(){
  try{
    if(typeof window.rawLignes === 'undefined'){
      alert('rawLignes introuvable : importez d\'abord les fichiers depuis l\'interface SIPP.');
      return;
    }
    const resp = await fetch('expected_mapping.json');
    if(!resp.ok) throw new Error('Impossible de charger expected_mapping.json ('+resp.status+')');
    const expected = await resp.json();
    const mappings = expected.mappings || [];
    const details = mappings.map(m=>{
      const found = (window.rawLignes||[]).find(l => String(l.contrat) === String(m.contract));
      let actual = null;
      if(found){
        // prefer CRM status for MINT, otherwise payment status
        if(found.type === 'MINT') actual = found.statutCRM || found.statutPaiementBrut || '—';
        else if(found.type === 'CONSO') actual = found.statutPaiement || '—';
        else actual = found.statutCRM || found.statutPaiementBrut || '—';
      }
      const normalizedActual = normalizeText(actual||'Introuvable');
      const normalizedExpected = normalizeText(m.expectedStatus||'');
      const match = (normalizedExpected !== '' && normalizedActual.includes(normalizedExpected)) || (m.expectedStatus==='Introuvable (CRM)' && !found);
      return { contract: m.contract, expected: m.expectedStatus, actual: actual||'Introuvable', match };
    });

    const summary = {
      generatedAt: new Date().toISOString(),
      total: details.length,
      matches: details.filter(d=>d.match).length,
      details
    };

    const blob = new Blob([JSON.stringify(summary,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'compare_expected_report_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    console.log('Rapport de comparaison généré :', summary);
    return summary;
  }catch(err){
    console.error('Erreur compareWithExpected:', err);
    alert('Erreur lors de la comparaison : ' + err.message);
    throw err;
  }
}

// Expose globally
window.compareWithExpected = compareWithExpected;
// ----- Normalisation et correction orthographique des noms d'agent -----
function normalizeName(s){
  if(s==null) return '';
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s\-\.']/g,'').replace(/\s+/g,' ').trim();
}
function normalizeText(s){
  if(s==null) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'').trim();
}
function levenshtein(a,b){
  if(a===b) return 0;
  const m=a.length, n=b.length;
  if(m===0) return n; if(n===0) return m;
  const v0 = new Array(n+1), v1 = new Array(n+1);
  for(let j=0;j<=n;j++) v0[j]=j;
  for(let i=0;i<m;i++){
    v1[0]=i+1;
    for(let j=0;j<n;j++){
      const cost = a[i]===b[j] ? 0 : 1;
      v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
    }
    for(let j=0;j<=n;j++) v0[j]=v1[j];
  }
  return v1[n];
}

function buildCanonicalAgentList(){
  // build list that prefers persisted canonical mappings and frequent exact names
  const counts = {};
  (window.rawLignes||[]).forEach(l=>{
    const name = (l.agent||'').toString().trim();
    if(!name) return;
    counts[name] = (counts[name]||0) + 1;
  });
  const stored = loadCanonicalMap();
  const mapped = new Set(Object.values(stored||{}));
  // include mapped canonicals first
  const items = Object.keys(counts).map(k=>({name:k,count:counts[k]})).sort((a,b)=>b.count-a.count);
  const result = [];
  mapped.forEach(m=> result.push(m));
  items.forEach(it=>{ if(!result.includes(it.name)) result.push(it.name); });
  return result;
}

function loadCanonicalMap(){
  try{ const raw = localStorage.getItem('sipp.agentCanonicalMap'); return raw? JSON.parse(raw): {}; }catch(e){ return {}; }
}
function saveCanonicalMap(m){ try{ localStorage.setItem('sipp.agentCanonicalMap', JSON.stringify(m||{})); }catch(e){ console.warn('Impossible de sauver canonical map',e); } }

function findBestMatchAgainstList(name, list, thresholdRatio){
  const n = normalizeName(name);
  if(!n) return null;
  let best=null; let bestScore=1e9; let bestNorm=null;
  list.forEach(candidate=>{
    const cn = normalizeName(candidate);
    if(cn===n){ best = candidate; bestScore=0; bestNorm=cn; return; }
    const d = levenshtein(n,cn);
    const ratio = d / Math.max(n.length, cn.length);
    if(ratio < bestScore){ bestScore = ratio; best = candidate; bestNorm = cn; }
  });
  if(best===null) return null;
  return bestScore <= (thresholdRatio||0.34) ? {candidate:best,ratio:bestScore} : null;
}

async function applyAgentOrthographyCorrection(options){
  options = options || {};
  const threshold = typeof options.threshold === 'number' ? options.threshold : 0.34;
  if(typeof window.rawLignes === 'undefined' || !(window.rawLignes||[]).length){
    alert('rawLignes introuvable ou vide : importez d\'abord les fichiers.');
    return {applied:0, suggestions:[]};
  }
  const canonical = buildCanonicalAgentList();
  if(canonical.length<=1) return {applied:0, suggestions:[]};
  const suggestions = [];
  let applied = 0;
  (window.rawLignes||[]).forEach(l=>{
    const cur = (l.agent||'').toString();
    if(!cur) return;
    // if exact canonical exists, skip
    if(canonical.includes(cur)) return;
    const match = findBestMatchAgainstList(cur, canonical, threshold);
    if(match){
      suggestions.push({contract:l.contrat, from:cur, to:match.candidate, ratio:match.ratio});
      if(options.apply){ l.agent = match.candidate; applied++; }
    } else {
      // no good match found — add suggestion without applying; UI should handle providing canonical forms
      suggestions.push({contract:l.contrat, from:cur, to:null, ratio:null});
    }
  });
  // if applied and we updated mapping, ensure persistence
  // already saved in prompt flow
  return {applied, suggestions};
}

window.applyAgentOrthographyCorrection = applyAgentOrthographyCorrection;
// return suggestions only (preview mode)
async function suggestAgentCorrections(options){
  options = options || {}; options.apply = false; return await applyAgentOrthographyCorrection(options);
}
window.suggestAgentCorrections = suggestAgentCorrections;
// Validation des règles métier côté client
async function validateBusinessRules(){
  if(typeof window.rawLignes === 'undefined'){
    alert('rawLignes introuvable : importez d\'abord les fichiers depuis l\'interface SIPP.');
    return null;
  }
  const issues = [];
  const checked = {mint:0, conso:0};
  const today = new Date();
  (window.rawLignes||[]).forEach(l=>{
    if(l.type==='MINT'){
      checked.mint++;
      const mois = l.moisEcoules;
      const etat = (l.statutCRM||'').toString().toLowerCase();
      const isChute = /annul|resil|retract|refus/.test(etat);
      const withinClawback = (mois!==null && mois!==undefined) && mois<=3;
      const wasBrutPaid = (l.statutPaiementBrut||'').toString().toLowerCase().includes('pay');
      const wasActivPaid = (l.statutPaiementActivation||'').toString().toLowerCase().includes('pay');
      const decommissionManuel = !!l.decommissionManuel;
      const autoClawbackExpected = isChute && withinClawback && !wasBrutPaid && !wasActivPaid;
      if(autoClawbackExpected && !l.decommissionne){
        issues.push({contract:l.contrat, issue:'Auto-clawback attendu mais non appliqué', detail:{etat:l.statutCRM, moisEcoules:l.moisEcoules}});
      }
      if(isChute && (wasBrutPaid || wasActivPaid) && !l.needsQualityReview && !decommissionManuel){
        issues.push({contract:l.contrat, issue:'Annulation après paiement sans revue qualité indiquée', detail:{etat:l.statutCRM, brutPaid:wasBrutPaid, activPaid:wasActivPaid}});
      }
    } else if(l.type==='CONSO'){
      checked.conso++;
    }
  });
  const report = {generatedAt:new Date().toISOString(), checked, issues, totalIssues:issues.length};
  return report;
}

window.validateBusinessRules = validateBusinessRules;

// utilitaire combiné : compare + rules
async function runAllChecks(){
  const cmp = await compareWithExpected();
  const rules = await validateBusinessRules();
  return {compare:cmp, rules};
}
window.runAllChecks = runAllChecks;
