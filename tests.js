/* ============================================================================================
   SIPP — SUITE DE TESTS DE NON-RÉGRESSION DU MOTEUR FINANCIER
   ============================================================================================
   POURQUOI CE FICHIER : l'application manipule des paies réelles. Le protocole du projet interdit
   de casser une fonctionnalité existante, mais sans tests il n'y avait aucun moyen automatique de
   le vérifier. Ouvrez tests.html dans un navigateur après CHAQUE modification du moteur financier :
   tout doit être vert (0 FAIL) avant de livrer.

   RÈGLE DE SYNCHRONISATION : les fonctions de la section « COPIES VERBATIM » sont des copies
   exactes d'index.html (synchronisées le 2026-07-16). Si vous modifiez l'une d'elles dans
   index.html, RÉPERCUTEZ la modification ici à l'identique — un écart entre les deux rend les
   tests mensongers. Les fonctions de la section « RÉPLIQUES DE CONTRAT » réencodent la logique
   métier attendue des fonctions de rendu (non copiables telles quelles car liées au DOM) : elles
   définissent le comportement que les rendus DOIVENT respecter.

   Fonctions sources dans index.html : norm, parsePaymentFlag, computeMintClawback,
   paymentWindow1520, computeAvanceCompensation, isBrutBlockedByAvance, brutAffecteAvance,
   acterCompensation (cœur décisionnel), renderPayroll / renderDuParAgent / renderFinanceSummary
   (agrégations cash), validation de restauration caisse.
   ============================================================================================ */
(function(){
'use strict';

/* ===================== STUBS DE TEST (documentés) ===================== */
// parseDate réel non copié : les tests passent toujours des objets Date.
function parseDate(){ return null; }
// Agenda des règles : valeur par défaut du projet (fenêtre clawback 3 mois).
function getRegles(){ return { brutStartDate:'2026-07-01', clawbackMois:3, consoJourT1:45, consoMoisClos:2 }; }

/* ===================== COPIES VERBATIM d'index.html (sync 2026-07-16) ===================== */
const norm = s => (s==null?'':String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

function toDateSafe(v){ if(!v) return null; return v instanceof Date ? v : parseDate(v); }

function parsePaymentFlag(val){
  if(val===null||val===undefined) return false;
  const s = norm(val);
  if(!s) return false;
  if(/(^|[\s_-])(non|no|pas|impaye|impayee|false)([\s_-]|$)/.test(s) || /non[\s_-]?paye/.test(s) || /pas[\s_-]?paye/.test(s)) return false;
  if(s==='0' || s==='en attente' || s==='a payer' || s==='attente') return false;
  return /^(oui|yes|paye|payee|paid|true|1|regle|reglee|verse|versee)$/.test(s) || /\bpaye(e)?\b/.test(s);
}

function computeMintClawback(statutCRM, moisEcoules, decommissionManuel, wasBrutPaid){
  const etatN = norm(statutCRM);
  const isChute = /annul|resil|retract|refus/.test(etatN);
  const withinClawbackWindow = moisEcoules!==null && moisEcoules!==undefined && moisEcoules <= getRegles().clawbackMois;
  const decommissionActivationAuto = isChute && withinClawbackWindow;
  const brutAnnule = !!decommissionManuel;
  const activationAnnule = decommissionActivationAuto || !!decommissionManuel;
  const needsQualityReview = isChute && withinClawbackWindow && !!wasBrutPaid && !decommissionManuel;
  return { isChute, withinClawbackWindow, decommissionActivationAuto, brutAnnule, activationAnnule, needsQualityReview };
}

function paymentWindow1520(refDate){
  const d = toDateSafe(refDate);
  if(!d) return null;
  const shift = d.getDate() > 20 ? 1 : 0;
  const y = d.getFullYear(), m = d.getMonth() + shift;
  const start = new Date(y, m, 15), end = new Date(y, m, 20);
  const monthLabel = start.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
  return { key: `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`,
           label: `15-20 ${monthLabel}`, start, end };
}

let caisseCache = null, compensationMap = {}, compensationByAgent = {}, rawLignes = [];
function computeAvanceCompensation(){
  compensationMap = {};
  compensationByAgent = {};
  const avances = (caisseCache && caisseCache.avances) ? caisseCache.avances : {};
  const parAgent = {};
  rawLignes.forEach(l=>{
    if(l.type!=='MINT' || !(l.brut>0) || l.brutAnnule || l.tempPerdue || l.statutPaiementBrut==='Payé') return;
    (parAgent[l.agent] = parAgent[l.agent] || []).push(l);
  });
  Object.keys(avances).forEach(agent=>{
    const dette = avances[agent] || 0;
    if(dette<=0) return;
    const lignes = (parAgent[agent]||[]).slice()
      .sort((a,b)=>((+toDateSafe(a.dateVente))||0)-((+toDateSafe(b.dateVente))||0));
    let remaining = dette;
    const contrats = [];
    lignes.forEach(l=>{
      if(remaining<=0) return;
      const applied = Math.min(l.brut, remaining);
      remaining -= applied;
      compensationMap[l.id] = { applied, agent };
      contrats.push({ lineId:l.id, contrat:l.contrat, dateVenteStr:l.dateVenteStr, echeanceStr:l.vendrediPaiementStr||l.dateVenteStr, montant:applied, detteApres:remaining });
    });
    compensationByAgent[agent] = { dette, compensation:dette-remaining, detteRestante:remaining, contrats };
  });
}
function isBrutBlockedByAvance(id){ return !!(compensationMap[id] && compensationMap[id].applied > 0); }
function brutAffecteAvance(l){ const c = compensationMap[l.id]; return c ? c.applied : 0; }

/* ===================== RÉPLIQUES DE CONTRAT (logique attendue des rendus/actions) ===================== */
// Cœur décisionnel d'acterCompensation() : sélection des bruts entièrement affectés, arithmétique
// de la dette, registre permanent — sans confirm() ni IndexedDB.
function acterCore(agent, state){
  const info = compensationByAgent[agent];
  if(!info || info.compensation<=0) return {err:'rien à acter'};
  const full = info.contrats.filter(c=>{
    const l = rawLignes.find(x=>x.id===c.lineId);
    return l && c.montant === l.brut;
  });
  if(!full.length) return {err:'partiel seulement'};
  const total = full.reduce((s,c)=>s+c.montant,0);
  state.compensations = state.compensations || [];
  full.forEach(c=>{
    const l = rawLignes.find(x=>x.id===c.lineId);
    l.statutPaiementBrut='Payé'; l.payeParCompensation=true;
    state.compensations.push({date:'test', agent, lineId:c.lineId, contrat:c.contrat, montant:c.montant});
  });
  const ancien = state.avances[agent]||0;
  const nouveau = Math.max(0, ancien - total);
  if(nouveau<=0) delete state.avances[agent]; else state.avances[agent]=nouveau;
  return {total, ancien, nouveau, nActed:full.length};
}
// Gardes caisse : un brut compensé ne sort JAMAIS de cash (debitCaisseMint + reconcileCaisseDebits).
function debitGuard(line){ if(!line||line.type!=='MINT'||line.brut<=0) return 'skip'; if(line.payeParCompensation) return 'skip-compensation'; return 'debit'; }
function reconcileWould(l, state){ return l.type==='MINT' && l.brut>0 && l.statutPaiementBrut==='Payé' && !l.payeParCompensation && !state.mintDebits.some(m=>m.lineId===l.id); }
// Agrégation cash de l'échéancier vendredi (renderPayroll).
function payrollAgg(lignes){
  const byVendredi={};
  lignes.filter(l=>l.type==='MINT' && !l.brutAnnule && !l.tempPerdue && l.brut>0).forEach(l=>{
    const key=l.vendrediPaiementStr||'—';
    if(!byVendredi[key]) byVendredi[key]={Vendredi:key,Contrats:0,Brut_a_payer:0,Brut_paye:0,Par_compensation:0};
    byVendredi[key].Contrats++;
    if(l.statutPaiementBrut==='Payé') byVendredi[key].Brut_paye+=l.brut;
    else { const aff=brutAffecteAvance(l); byVendredi[key].Brut_a_payer+=l.brut-aff; byVendredi[key].Par_compensation+=aff; }
  });
  return byVendredi;
}
// Agrégation cash du « Reste à payer par agent » (renderDuParAgent).
function duAgentAgg(lignes, todayMid){
  const byAgent={};
  lignes.forEach(l=>{
    if(!byAgent[l.agent]) byAgent[l.agent]={Agent:l.agent,Brut_du:0,Affecte:0,Retard:0};
    const a=byAgent[l.agent];
    if(l.type==='MINT'){
      if(l.tempPerdue) return;
      if(!l.brutAnnule && l.brut>0 && l.statutPaiementBrut!=='Payé'){
        const aff=brutAffecteAvance(l); const cash=l.brut-aff;
        a.Brut_du+=cash; a.Affecte+=aff;
        const vp=toDateSafe(l.vendrediPaiement);
        if(vp && vp.getTime()<todayMid.getTime() && cash>0) a.Retard+=cash;
      }
    }
  });
  return byAgent;
}
// Agrégation cash des cartes Trésorerie (renderFinanceSummary — partie brut).
function summaryAgg(lignes, todayMid){
  let brutDu=0, brutAffecte=0, retardDH=0, retardN=0;
  lignes.forEach(l=>{
    if(l.type!=='MINT'||l.tempPerdue||l.brutAnnule) return;
    if(l.statutPaiementBrut!=='Payé' && l.brut>0){
      const aff=brutAffecteAvance(l); const cash=l.brut-aff;
      brutAffecte+=aff; brutDu+=cash;
      const vp=toDateSafe(l.vendrediPaiement);
      if(vp && vp.getTime()<todayMid.getTime() && cash>0){ retardDH+=cash; retardN++; }
    }
  });
  return {brutDu,brutAffecte,retardDH,retardN};
}
// Validation du schéma d'une sauvegarde caisse (handler de restauration).
function isValidCaisseBackup(obj){
  return !!(obj && obj.id==='main' && Array.isArray(obj.injections) && Array.isArray(obj.mintDebits)
    && typeof obj.avances==='object' && !Array.isArray(obj.avances));
}

/* ===================== CADRE DE TEST ===================== */
let pass=0, fail=0; const log=[];
let section='';
function sec(name){ section=name; log.push('\n── '+name+' ──'); }
function eq(name, got, exp){
  const g=JSON.stringify(got), e=JSON.stringify(exp);
  if(g===e){ pass++; log.push('PASS '+name); }
  else { fail++; log.push('FAIL '+name+'\n     attendu: '+e+'\n     obtenu : '+g); }
}
function mint(id, agent, dv, opts){
  opts=opts||{};
  const vp = opts.vendrediPaiement || null;
  return Object.assign({id, type:'MINT', agent, brut:50, dateVente:dv,
    dateVenteStr:'x', vendrediPaiement:vp, vendrediPaiementStr: vp?vp.toLocaleDateString('fr-FR'):'V'+id,
    contrat:'C'+id, brutAnnule:false, tempPerdue:false, statutPaiementBrut:'Non Payé', payeParCompensation:false}, opts);
}

/* ===================== S1 — Fenêtre de paiement 15-20 (Net + Conso) ===================== */
sec('S1 · paymentWindow1520 — fenêtre mensuelle 15-20');
(function(){
  const w1 = paymentWindow1520(new Date(2026,6,10));
  eq('10 juil (≤20) → fenêtre 15-20 juillet', {key:w1.key,d15:w1.start.getDate(),d20:w1.end.getDate()}, {key:'2026-07',d15:15,d20:20});
  eq('25 juil (>20) → fenêtre août', paymentWindow1520(new Date(2026,6,25)).key, '2026-08');
  eq('20 juil (borne incluse) → juillet', paymentWindow1520(new Date(2026,6,20)).key, '2026-07');
  eq('21 juil (borne exclue) → août', paymentWindow1520(new Date(2026,6,21)).key, '2026-08');
  eq('28 déc → janvier année suivante', paymentWindow1520(new Date(2026,11,28)).key, '2027-01');
  eq('date nulle → null', paymentWindow1520(null), null);
})();

/* ===================== S2 — Compensation avance ↔ brut (affectation dérivée) ===================== */
sec('S2 · computeAvanceCompensation — affectation des bruts à la dette');
(function(){
  caisseCache = { avances: { Alice: 120 } };
  rawLignes = [
    mint('a3','Alice',new Date(2026,6,3)),
    mint('a1','Alice',new Date(2026,6,1)),
    mint('a2','Alice',new Date(2026,6,2)),
  ];
  computeAvanceCompensation();
  const c = compensationByAgent.Alice;
  eq('dette 120 / 3×50 : totaux', {dette:c.dette,comp:c.compensation,reste:c.detteRestante}, {dette:120,comp:120,reste:0});
  eq('ordre chronologique + montants + dette dégressive', c.contrats.map(x=>[x.contrat,x.montant,x.detteApres]), [['Ca1',50,70],['Ca2',50,20],['Ca3',20,0]]);
  eq('brut entièrement affecté bloqué', isBrutBlockedByAvance('a1'), true);
  eq('brut partiellement affecté bloqué aussi', isBrutBlockedByAvance('a3'), true);

  caisseCache = { avances: { Bob: 200 } };
  rawLignes = [ mint('b1','Bob',new Date(2026,6,1)), mint('b2','Bob',new Date(2026,6,2)) ];
  computeAvanceCompensation();
  eq('dette 200 > bruts 100 : compensé 100, reste 100', {comp:compensationByAgent.Bob.compensation,reste:compensationByAgent.Bob.detteRestante}, {comp:100,reste:100});

  caisseCache = { avances: { Eve: 500 } };
  rawLignes = [
    mint('e1','Eve',new Date(2026,6,1),{statutPaiementBrut:'Payé'}),
    mint('e2','Eve',new Date(2026,6,2),{brutAnnule:true}),
    mint('e3','Eve',new Date(2026,6,3),{tempPerdue:true}),
    mint('e4','Eve',new Date(2026,6,4)),
  ];
  computeAvanceCompensation();
  eq('exclusions payé/annulé/introuvable : seul e4 affecté', compensationByAgent.Eve.contrats.map(x=>x.contrat), ['Ce4']);
  eq('ligne déjà payée cash jamais bloquée', isBrutBlockedByAvance('e1'), false);

  caisseCache = { avances: {} };
  rawLignes = [ mint('z1','Zoe',new Date(2026,6,1)) ];
  computeAvanceCompensation();
  eq('agent sans dette : aucun blocage', {n:Object.keys(compensationByAgent).length,b:isBrutBlockedByAvance('z1')}, {n:0,b:false});

  caisseCache = { avances: { Max: 100 } };
  rawLignes = [ mint('m1','Max',new Date(2026,5,1),{brut:0}), mint('m2','Max',new Date(2026,6,1)) ];
  computeAvanceCompensation();
  eq('brut 0 (vente pré-agenda) exclu de l\'affectation', compensationByAgent.Max.contrats.map(x=>x.contrat), ['Cm2']);
})();

/* ===================== S3 — Acter la compensation (anti double paiement) ===================== */
sec('S3 · acterCompensation — consommation définitive, dette réduite, zéro double paiement');
(function(){
  let state={avances:{Alice:120}, mintDebits:[], compensations:[]};
  caisseCache=state;
  rawLignes=[mint('a1','Alice',new Date(2026,6,1)),mint('a2','Alice',new Date(2026,6,2)),mint('a3','Alice',new Date(2026,6,3))];
  computeAvanceCompensation();
  const r=acterCore('Alice',state);
  eq('dette 120 : 2 bruts entiers actés (100), reliquat 20', {t:r.total,a:r.ancien,n:r.nouveau,c:r.nActed}, {t:100,a:120,n:20,c:2});
  eq('registre permanent alimenté', state.compensations.map(c=>[c.contrat,c.montant]), [['Ca1',50],['Ca2',50]]);
  computeAvanceCompensation();
  eq('après acte : reliquat 20 bloque la 3e vente', {b:isBrutBlockedByAvance('a3'),m:compensationByAgent.Alice.contrats[0].montant}, {b:true,m:20});
  eq('lignes actées débloquées (Payé exclu du calcul)', [isBrutBlockedByAvance('a1'),isBrutBlockedByAvance('a2')], [false,false]);
  eq('re-acter un reliquat partiel : refusé', acterCore('Alice',state).err, 'partiel seulement');
  eq('brut compensé : jamais de sortie de caisse', debitGuard(rawLignes[0]), 'skip-compensation');
  eq('reconcile n\'ajoute pas de débit pour un compensé', reconcileWould(rawLignes[0],state), false);

  state={avances:{Bob:100}, mintDebits:[], compensations:[]};
  caisseCache=state;
  rawLignes=[mint('b1','Bob',new Date(2026,6,1)),mint('b2','Bob',new Date(2026,6,2))];
  computeAvanceCompensation();
  const r2=acterCore('Bob',state);
  eq('dette exacte 100 : avance supprimée', {n:r2.nouveau,has:('Bob' in state.avances)}, {n:0,has:false});
  computeAvanceCompensation();
  eq('après solde complet : plus aucun blocage', Object.keys(compensationByAgent).length, 0);
  eq('rien à acter → refus propre', acterCore('Bob',state).err, 'rien à acter');
  eq('brut payé CASH normal : débité de la caisse', debitGuard(mint('n1','Nora',new Date(2026,6,1),{statutPaiementBrut:'Payé'})), 'debit');
  eq('reconcile inclut un payé cash non débité', reconcileWould(Object.assign(mint('n2','Nora',new Date(2026,6,2)),{statutPaiementBrut:'Payé'}),{mintDebits:[]}), true);
})();

/* ===================== S4 — Projections de cash (net des compensations) ===================== */
sec('S4 · projections de cash — la part affectée ne gonfle jamais le « à payer »');
(function(){
  const past=new Date(2026,6,3), todayMid=new Date(2026,6,16);
  caisseCache={avances:{Ali:70}};
  rawLignes=[
    mint('v1','Ali',new Date(2026,6,1),{vendrediPaiement:past}),
    mint('v2','Ali',new Date(2026,6,2),{vendrediPaiement:past}),
    mint('v3','Sam',new Date(2026,6,2),{vendrediPaiement:past}),
    mint('v4','Ali',new Date(2026,6,3),{vendrediPaiement:past, statutPaiementBrut:'Payé'})
  ];
  computeAvanceCompensation();
  eq('affectations : v1=50, v2=20 (partiel), autres 0', [brutAffecteAvance(rawLignes[0]),brutAffecteAvance(rawLignes[1]),brutAffecteAvance(rawLignes[2]),brutAffecteAvance(rawLignes[3])], [50,20,0,0]);
  const p=payrollAgg(rawLignes)[past.toLocaleDateString('fr-FR')];
  eq('échéancier vendredi : cash 80, compensation 70, payé 50', {c:p.Brut_a_payer,comp:p.Par_compensation,paye:p.Brut_paye}, {c:80,comp:70,paye:50});
  const d=duAgentAgg(rawLignes,todayMid);
  eq('reste à payer Ali : cash 30, affecté 70, retard 30', {du:d.Ali.Brut_du,aff:d.Ali.Affecte,ret:d.Ali.Retard}, {du:30,aff:70,ret:30});
  eq('reste à payer Sam (sans dette) : cash 50', {du:d.Sam.Brut_du,aff:d.Sam.Affecte}, {du:50,aff:0});
  const s=summaryAgg(rawLignes,todayMid);
  eq('cartes Trésorerie : dû cash 80, affecté 70, retard 80/2cts', {du:s.brutDu,aff:s.brutAffecte,r:s.retardDH,n:s.retardN}, {du:80,aff:70,r:80,n:2});
  caisseCache={avances:{Ali:50}};
  rawLignes=[mint('w1','Ali',new Date(2026,6,1),{vendrediPaiement:past})];
  computeAvanceCompensation();
  const s2=summaryAgg(rawLignes,todayMid);
  eq('vente 100% affectée et échue : retard 0 (rien à décaisser)', {r:s2.retardDH,n:s2.retardN}, {r:0,n:0});
  eq('INVARIANT : cash + affecté = brut total dû', s2.brutDu+s2.brutAffecte, 50);
})();

/* ===================== S5 — Validation de restauration caisse ===================== */
sec('S5 · restauration caisse — validation stricte du schéma');
(function(){
  eq('sauvegarde valide acceptée', isValidCaisseBackup({id:'main',injections:[],mintDebits:[],avances:{}}), true);
  eq('rejet : mauvais id', isValidCaisseBackup({id:'x',injections:[],mintDebits:[],avances:{}}), false);
  eq('rejet : avances en tableau', isValidCaisseBackup({id:'main',injections:[],mintDebits:[],avances:[]}), false);
  eq('rejet : fichier overrides SIPP', isValidCaisseBackup({'MINT-123':{statutPaiementBrut:'Payé'}}), false);
  eq('rejet : null', isValidCaisseBackup(null), false);
})();

/* ===================== S6 — Clawback MINT (règle Direction 2026-07-16) ===================== */
sec('S6 · computeMintClawback — brut protégé / activation récupérable');
(function(){
  const ok = computeMintClawback('Activé', 1, false, false);
  eq('Activé : aucune reprise, aucune revue', {b:ok.brutAnnule,a:ok.activationAnnule,q:ok.needsQualityReview}, {b:false,a:false,q:false});
  const ch = computeMintClawback('Annulée', 2, false, false);
  eq('Annulée <3 mois non payée : activation reprise, brut intact', {b:ch.brutAnnule,a:ch.activationAnnule,auto:ch.decommissionActivationAuto}, {b:false,a:true,auto:true});
  eq('Annulée <3 mois brut PAYÉ : revue Qualité exigée', computeMintClawback('Annulée', 2, false, true).needsQualityReview, true);
  const out = computeMintClawback('Annulée', 4, false, true);
  eq('Annulée >3 mois : hors fenêtre, rien d\'automatique', {a:out.activationAnnule,q:out.needsQualityReview,w:out.withinClawbackWindow}, {a:false,q:false,w:false});
  eq('Rétractée mois 0 : chute dans la fenêtre', computeMintClawback('Rétractée', 0, false, false).decommissionActivationAuto, true);
  const man = computeMintClawback('Activé', 1, true, false);
  eq('Refus Qualité : annule brut ET activation même sans chute', {b:man.brutAnnule,a:man.activationAnnule}, {b:true,a:true});
  eq('Refus Qualité déjà posé : pas de revue en plus', computeMintClawback('Annulée', 2, true, true).needsQualityReview, false);
  eq('mois écoulés null : fenêtre inapplicable', computeMintClawback('Annulée', null, false, true).needsQualityReview, false);
})();

/* ===================== S7 — parsePaymentFlag (bug historique « Non Payé » ≠ payé) ===================== */
sec('S7 · parsePaymentFlag — négation explicite toujours prioritaire');
(function(){
  eq('« Payé » → payé', parsePaymentFlag('Payé'), true);
  eq('« Non Payé » → NON payé (bug historique)', parsePaymentFlag('Non Payé'), false);
  eq('« NON  PAYE » (majuscules, double espace) → NON payé', parsePaymentFlag('NON  PAYE'), false);
  eq('« impayé » → NON payé', parsePaymentFlag('impayé'), false);
  eq('« oui » → payé', parsePaymentFlag('oui'), true);
  eq('« en attente » → NON payé', parsePaymentFlag('en attente'), false);
  eq('« Réglée » → payé', parsePaymentFlag('Réglée'), true);
  eq('« 1 » → payé / « 0 » → non', [parsePaymentFlag('1'),parsePaymentFlag('0')], [true,false]);
  eq('null / vide → NON payé', [parsePaymentFlag(null),parsePaymentFlag('')], [false,false]);
})();

/* ===================== RÉSULTAT ===================== */
const summary = `RÉSULTAT : ${pass} PASS / ${fail} FAIL ${fail===0?'✓ — moteur financier conforme':'✗ — RÉGRESSION DÉTECTÉE, ne pas livrer'}`;
if(typeof window!=='undefined') window.__testResult = {pass, fail, summary, log};
if(typeof document!=='undefined' && document.getElementById('out')){
  document.getElementById('out').textContent = log.join('\n');
  const b = document.getElementById('badge');
  if(b){ b.textContent = summary; b.className = fail===0 ? 'ok' : 'ko'; }
}
})();
