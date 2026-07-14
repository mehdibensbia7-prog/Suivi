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
      const normalizedActual = (actual||'Introuvable').toString().toLowerCase();
      const normalizedExpected = (m.expectedStatus||'').toString().toLowerCase();
      const match = normalizedActual.includes(normalizedExpected) || (m.expectedStatus==='Introuvable (CRM)' && !found);
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
