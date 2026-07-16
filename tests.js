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
   (agrégations cash), validation de restauration caisse, buildConsoIdentification (audit
   fiabilité agent ConsoPilote, onglet Identification ConsoPilote), buildLignes — bloc fallback
   CONSO Feuil2 seul + boucle de push (élargissement commission ConsoPilote, 2026-07-16).
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
function monthsBetween(d1, d2){ if(!d1||!d2) return null; return (d2.getFullYear()-d1.getFullYear())*12 + (d2.getMonth()-d1.getMonth()) - (d2.getDate()<d1.getDate()?1:0); }

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
// normalizeName : source compare_expected.js (chargé sur la même page qu'index.html), réutilisé
// pour la comparaison des noms d'agent — gère espaces insécables (nbsp), casse, accents.
function normalizeName(s){
  if(s==null) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s\-\.']/g,'').replace(/\s+/g,' ').trim();
}
// levenshtein : source compare_expected.js, réutilisée pour l'appariement de noms par similarité.
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
function colIndexByNames(header, names){
  for(const name of names){ const target = norm(name); for(let i=0;i<header.length;i++){ if(norm(header[i]) === target) return i; } }
  for(const name of names){ const target = norm(name); for(let i=0;i<header.length;i++){ const h = norm(header[i]); if(h && target && (h.startsWith(target) || target.startsWith(h))) return i; } }
  return -1;
}
function normalizeRef(ref){ if(ref===null||ref===undefined) return ''; const s = String(ref).replace(/\D/g,''); return s || ''; }
function isEmptyConso(v){ if(v===null||v===undefined) return true; const s=String(v).trim(); return s==='' || s==='0' || s==='*'; }
function extractContractNumbers(val){ if(val===null||val===undefined) return []; return String(val).split(/[\/,;]/).map(s=>s.replace(/\D/g,'')).filter(Boolean); }
function fmtDate(d){ return d ? d.toLocaleDateString('fr-FR') : ''; }
function mergeStringField(existing, candidate){
  if(!existing) return candidate || '';
  if(!candidate) return existing;
  if(existing === candidate) return existing;
  if(existing.includes(candidate)) return existing;
  if(candidate.includes(existing)) return candidate;
  return `${existing} / ${candidate}`;
}
// buildConsoIdentification : audit fiabilité agent ConsoPilote (onglet Identification ConsoPilote).
// Étendu le 2026-07-16 : variante Feuil2 sans n° de contrat ni colonne agent (Date/Nom/Contact/
// Signature/SEPA) — appariement client par téléphone (extractPhoneDigits) puis nom (Feuil1, puis
// repli sur une ancienne Feuil2 avec colonne agent chargée dans le même import).
function extractPhoneDigits(raw){
  if(!raw) return '';
  const digits = String(raw).replace(/\D/g,'');
  return digits.length>=9 ? digits.slice(-9) : '';
}
let consoIdentification = [];
function buildConsoIdentification(aBodies, statusSourcesRaw){
  consoIdentification = [];
  const f1Map = {};
  const f1ByPhone = {};
  const f1ByNameList = [];
  (aBodies||[]).forEach(src=>{
    const cA = {
      dateVente: colIndexByNames(src.header, ['Date de Vente']),
      contratEnergie: colIndexByNames(src.header, ['Numéro Contrat Energie','Numero Contrat Energie','Numero contrat Energie']),
      nomClient: colIndexByNames(src.header, ['Nom du Client']),
      prenomClient: colIndexByNames(src.header, ['Prénom du Client','Prenom du Client']),
      telClient: colIndexByNames(src.header, ['Téléphone du Client','Telephone du Client']),
      commercial: colIndexByNames(src.header, ['Nom du Commercial','Nom du commercial']),
      contratConso: colIndexByNames(src.header, ['Numéro Contrat ConsoPilote','Numero Contrat ConsoPilote'])
    };
    (src.rows||[]).forEach(row=>{
      if(!row) return;
      const agent = (row[cA.commercial]||'').toString().trim();
      const dateVente = cA.dateVente!==-1 ? toDateSafe(row[cA.dateVente]) : null;
      const nomC = cA.nomClient!==-1 ? (row[cA.nomClient]||'').toString().trim() : '';
      const prenomC = cA.prenomClient!==-1 ? (row[cA.prenomClient]||'').toString().trim() : '';
      const client = [nomC, prenomC].filter(Boolean).join(' ').trim();
      const contratEnergie = cA.contratEnergie!==-1 ? extractContractNumbers(row[cA.contratEnergie]).join(' / ') : '';
      if(!agent && !client) return;
      const entry = { agent, dateVenteStr: dateVente ? fmtDate(dateVente) : '', contratEnergie, client };
      if(cA.telClient!==-1){ const phone = extractPhoneDigits(row[cA.telClient]); if(phone) f1ByPhone[phone] = f1ByPhone[phone] || entry; }
      if(nomC || prenomC){ f1ByNameList.push({ nameA: normalizeName([nomC,prenomC].filter(Boolean).join(' ')), nameB: normalizeName([prenomC,nomC].filter(Boolean).join(' ')), entry }); }
      if(cA.contratConso!==-1 && !isEmptyConso(row[cA.contratConso])){
        const refConso = normalizeRef(row[cA.contratConso]);
        if(refConso){
          const existing = f1Map[refConso] || {agent:'', dateVenteStr:'', contratEnergie:'', client:''};
          f1Map[refConso] = {
            agent: mergeStringField(existing.agent, agent),
            dateVenteStr: existing.dateVenteStr || (dateVente ? fmtDate(dateVente) : ''),
            contratEnergie: mergeStringField(existing.contratEnergie, contratEnergie),
            client: mergeStringField(existing.client, client)
          };
        }
      }
    });
  });
  function bestNameMatchIn(list, normTarget){
    if(!normTarget) return null;
    let best = null, bestSim = 0;
    list.forEach(cand=>{
      [cand.nameA, cand.nameB].forEach(n=>{
        if(!n) return;
        const dist = levenshtein(normTarget, n);
        const sim = 1 - dist/Math.max(normTarget.length, n.length);
        if(sim > bestSim){ bestSim = sim; best = cand.entry; }
      });
    });
    return (best && bestSim >= 0.90) ? {entry:best, exact:bestSim>=0.999} : null;
  }
  const seen = {};
  const f2ByNameList = [];
  (statusSourcesRaw||[]).filter(s=>s.type==='feuil2').forEach(src=>{
    const header = src.header;
    const cB = {
      ref: colIndexByNames(header, ['numero contract','numero de contrat','numéro contract','numéro de contrat']),
      client: colIndexByNames(header, ['nom']),
      tel: colIndexByNames(header, ['telephone','téléphone']),
      etat: colIndexByNames(header, ['statut','statut de vente','etat']),
      prelev: colIndexByNames(header, ['prelevement','prelevment','prélèvement']),
      commercial: colIndexByNames(header, ['nom du commercial','nom du c omercial','nom commercial'])
    };
    if(cB.ref===-1) return;
    (src.rows||[]).slice(src.idx+1).forEach(row=>{
      if(!row) return;
      const ref = normalizeRef(row[cB.ref]);
      if(!ref) return;
      const client = cB.client!==-1 ? (row[cB.client]||'').toString().trim() : '';
      const tel = cB.tel!==-1 ? (row[cB.tel]||'').toString().trim() : '';
      const statut = cB.etat!==-1 ? (row[cB.etat]||'').toString().trim() : '';
      const prelev = cB.prelev!==-1 ? (row[cB.prelev]||'').toString().trim() : '';
      const agentF2 = cB.commercial!==-1 ? (row[cB.commercial]||'').toString().trim() : '';
      if(!client && !agentF2) return;
      seen[ref] = {ref, client, tel, statut, prelev, agentF2, methode:'contrat'};
      if(client && agentF2){ f2ByNameList.push({ nameA: normalizeName(client), nameB: normalizeName(client.split(' ').reverse().join(' ')), entry:{agent:agentF2, contratEnergie:'', dateVenteStr:'', client} }); }
    });
  });
  let altIdx = 0;
  (statusSourcesRaw||[]).filter(s=>s.type==='feuil2alt').forEach(src=>{
    const header = src.header;
    const cAlt = { client: colIndexByNames(header, ['nom']), contact: colIndexByNames(header, ['contact']), etat: colIndexByNames(header, ['signature']), prelev: colIndexByNames(header, ['sepa']) };
    if(cAlt.client===-1) return;
    (src.rows||[]).slice(src.idx+1).forEach(row=>{
      if(!row) return;
      const client = (row[cAlt.client]||'').toString().trim();
      const contact = cAlt.contact!==-1 ? (row[cAlt.contact]||'').toString().trim() : '';
      const statut = cAlt.etat!==-1 ? (row[cAlt.etat]||'').toString().trim() : '';
      const prelev = cAlt.prelev!==-1 ? (row[cAlt.prelev]||'').toString().trim() : '';
      if(!client) return;
      const phone = extractPhoneDigits(contact);
      const byPhone = phone ? f1ByPhone[phone] : null;
      let match = null, methode = 'non_trouve';
      if(byPhone){ match = byPhone; methode = 'telephone'; }
      else {
        const nameMatch = bestNameMatchIn(f1ByNameList, normalizeName(client));
        if(nameMatch){ match = nameMatch.entry; methode = nameMatch.exact ? 'nom_exact' : 'nom_approche'; }
        else {
          const nameMatch2 = bestNameMatchIn(f2ByNameList, normalizeName(client));
          if(nameMatch2){ match = nameMatch2.entry; methode = nameMatch2.exact ? 'nom_exact_ancien_feuil2' : 'nom_approche_ancien_feuil2'; }
        }
      }
      altIdx++;
      const ref = (match && match.contratEnergie) ? match.contratEnergie : `SANS-N°-${altIdx}`;
      seen[ref] = { ref, client, tel: contact, statut, prelev, agentF2: match ? match.agent : '', methode };
    });
  });
  Object.values(seen).forEach(row=>{
    let fiabilite, commentaire, agentRetenu, agentFeuil1Aff, contratEnergieAff='—', dateVenteAff='—';
    if(row.methode==='contrat'){
      const f1 = f1Map[row.ref];
      const nF2 = normalizeName(row.agentF2);
      if(f1 && f1.agent){
        const nF1 = normalizeName(f1.agent);
        if(nF1 && nF1===nF2){ fiabilite = 'Confirmé (Feuil1 + Feuil2 concordants)'; commentaire = ''; agentRetenu = f1.agent; }
        else { fiabilite = `Conflit (Feuil1="${f1.agent}" vs Feuil2="${row.agentF2}")`; commentaire = 'agent propriétaire non identifié'; agentRetenu = row.agentF2 || f1.agent; }
      } else {
        fiabilite = 'Non recoupé (source unique ConsoPilote)'; commentaire = 'agent propriétaire non identifié'; agentRetenu = row.agentF2 || '(agent non renseigné)';
      }
      agentFeuil1Aff = (f1 && f1.agent) ? f1.agent : '—';
      if(f1){ contratEnergieAff = f1.contratEnergie || '—'; dateVenteAff = f1.dateVenteStr || '—'; }
    } else {
      if(row.methode==='telephone'){ fiabilite = 'Confirmé (téléphone — nouveau format sans n° de contrat)'; commentaire = ''; agentRetenu = row.agentF2; }
      else if(row.methode==='nom_exact'){ fiabilite = 'Confirmé (nom exact Feuil1 — nouveau format sans n° de contrat)'; commentaire = ''; agentRetenu = row.agentF2; }
      else if(row.methode==='nom_approche'){ fiabilite = 'Correspondance approchée (nom ≥90% vs Feuil1 — à valider manuellement)'; commentaire = 'correspondance approchée à valider'; agentRetenu = row.agentF2; }
      else if(row.methode==='nom_exact_ancien_feuil2'){ fiabilite = 'Confirmé (nom exact, ancienne Feuil2 du même import)'; commentaire = ''; agentRetenu = row.agentF2; }
      else if(row.methode==='nom_approche_ancien_feuil2'){ fiabilite = 'Correspondance approchée (nom ≥90% vs ancienne Feuil2 — à valider manuellement)'; commentaire = 'correspondance approchée à valider'; agentRetenu = row.agentF2; }
      else { fiabilite = 'Non identifié (nouveau format sans n° de contrat, aucune correspondance client)'; commentaire = 'agent propriétaire non identifié'; agentRetenu = '(agent non renseigné)'; }
      agentFeuil1Aff = row.agentF2 || '—';
    }
    consoIdentification.push({
      contrat: row.ref, client: row.client, telephone: row.tel, statut: row.statut, prelevement: row.prelev,
      agentFeuil2: row.methode==='contrat' ? (row.agentF2 || '—') : '— (format sans colonne agent)',
      agentFeuil1: agentFeuil1Aff, agentRetenu, fiabilite, commentaire,
      contratEnergieLie: contratEnergieAff, dateVenteLiee: dateVenteAff
    });
  });
  consoIdentification.sort((a,b)=> (a.contrat||'').localeCompare(b.contrat||''));
}
// overrides : simule le module-scope `overrides` d'index.html (paiements manuels par ligne).
let overrides = {};
// computeConsoFields : règle ConsoPilote (100 DH en 2 tranches conditionnées Signé+prélèvement actif).
function computeConsoFields(lineId, dateVente, etatRaw, prelevRaw, legacy){
  const r = getRegles();
  const today = new Date(2026,6,16); // date fixe -> tests déterministes
  const o = overrides[lineId] || {};
  legacy = legacy || {};
  const etatN = norm(etatRaw||'');
  const prelevActif = /actif|active|oui|ok|yes|^1$/.test(norm(prelevRaw||''));
  const isChute = /annul|resil|retract|refus/.test(etatN);
  const isSigned = /sign|activ/.test(etatN);
  const conditionsOK = isSigned && prelevActif && !isChute;
  const dv = toDateSafe(dateVente);
  const jours = dv ? Math.floor((today - dv)/86400000) : null;
  const moisEcoules = dv ? monthsBetween(dv, today) : null;
  const t1Date = dv ? new Date(dv.getFullYear(), dv.getMonth(), dv.getDate() + r.consoJourT1) : null;
  const t2Date = dv ? new Date(dv.getFullYear(), dv.getMonth() + r.consoMoisClos, dv.getDate()) : null;
  const t1Echue = jours!==null && jours >= r.consoJourT1;
  const t2Echue = moisEcoules!==null && moisEcoules >= r.consoMoisClos;
  const t1Paye = o.statutPaiementT1==='Payé' || o.statutPaiement==='Payé' || !!legacy.t1;
  const t2Paye = o.statutPaiementT2==='Payé' || o.statutPaiement==='Payé' || !!legacy.t2;
  const t1Due = t1Paye || (t1Echue && conditionsOK);
  const t2Due = t2Paye || (t2Echue && conditionsOK);
  const t2Perdue = t2Echue && !conditionsOK && !t2Paye;
  const t1Perdue = isChute && !t1Due;
  return {
    statutCRM: etatRaw || 'Introuvable (CRM)',
    prelevement: prelevRaw ? (prelevActif ? 'Actif' : String(prelevRaw)) : '—',
    conditionsOK, enAttente: !conditionsOK, isChute,
    total: 100, t1: 50, t2: 50,
    t1Date, t1DateStr: fmtDate(t1Date), t2Date, t2DateStr: fmtDate(t2Date),
    t1Echue, t2Echue, t1Due, t2Due, t1Perdue, t2Perdue,
    statutPaiementT1: t1Paye ? 'Payé' : 'Non Payé',
    statutPaiementT2: t2Paye ? 'Payé' : 'Non Payé',
    net: (t1Due ? 50 : 0) + (t2Due ? 50 : 0),
    moisEcoules
  };
}
// runConsoPipeline : réplique le bloc fallback CONSO Feuil2 seul + la boucle de push de buildLignes
// (élargissement commission ConsoPilote 2026-07-16) — garde anti-double-paiement structurelle
// (consoGroups est un dict clé=n° contrat, au plus une entrée par contrat).
function runConsoPipeline(consoGroups, statusMap, statusSourcesRaw){
  const rawLignes = [];
  let refSeen = {};
  function stableId(prefix, ref){
    refSeen[prefix+ref] = (refSeen[prefix+ref]||0) + 1;
    const n = refSeen[prefix+ref];
    return n===1 ? (prefix+'-'+ref) : (prefix+'-'+ref+'-dup'+n);
  }
  const seenConsoFeuil2 = {};
  (statusSourcesRaw||[]).filter(s=>s.type==='feuil2').forEach(src=>{
    const header = src.header;
    const cB = {
      ref: colIndexByNames(header, ['numero contract','numero de contrat','numéro contract','numéro de contrat']),
      client: colIndexByNames(header, ['nom']),
      commercial: colIndexByNames(header, ['nom du commercial','nom du c omercial','nom commercial'])
    };
    if(cB.ref===-1) return;
    (src.rows||[]).slice(src.idx+1).forEach(row=>{
      if(!row) return;
      const ref = normalizeRef(row[cB.ref]);
      if(!ref) return;
      if(consoGroups[ref]) return;
      if(seenConsoFeuil2[ref]) return;
      const client = cB.client!==-1 ? (row[cB.client]||'').toString().trim() : '';
      const agent = cB.commercial!==-1 ? (row[cB.commercial]||'').toString().trim() : '';
      if(!client && !agent) return;
      seenConsoFeuil2[ref] = true;
      consoGroups[ref] = { ref, agent, client, dateVente:null, sources:[`${src.fileName}:${src.sheetName}`], agentNonConfirme:true };
    });
  });
  Object.values(consoGroups).forEach(item=>{
    const lineId = stableId('CONSO', item.ref);
    const st = statusMap[item.ref] || null;
    const fields = computeConsoFields(lineId, item.dateVente, st ? st.etat : null, st ? st.prelev : null);
    rawLignes.push(Object.assign({
      id: lineId, type:'CONSO', agent:item.agent || '(agent non renseigné)',
      dateVente:item.dateVente, dateVenteStr: fmtDate(item.dateVente),
      contrat:item.ref, client:item.client, produit:'ConsoPilote',
      agentSourceConfirme: !item.agentNonConfirme,
      sourceInfo: item.sources.join(' ; ')
    }, fields));
  });
  return rawLignes;
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

/* ===================== S8 — Identification ConsoPilote (audit fiabilité agent) ===================== */
sec('S8 · buildConsoIdentification — 100% des ventes ConsoPilote, fiabilité par recoupement Feuil1↔Feuil2');
(function(){
  const NBSP = String.fromCharCode(160);
  const headerA = ['Date de Vente','Numéro Contrat Energie','Nom du Client','Prénom du Client','Nom du Commercial','Numéro Contrat ConsoPilote'];
  const rowsA = [
    [new Date(2026,5,11), '1805322','Khan','Umar','Mouad'+NBSP+'ELBRAHMI','213145'],
    [new Date(2026,5,23), '1810989','bassoung','julienne','Yassir Bouhdadi','220711'],
    [new Date(2026,5,20), '1899999','SansLien','Client','Quelqu Un','0'] // contrat conso='0' -> isEmptyConso, doit être ignoré
  ];
  const aBodies = [{ header: headerA, rows: rowsA, fileName:'tableau statut brut (2).xlsx', sheetName:'Feuil1' }];

  const headerF2 = ['nom ','telephone','numero contract','statut','prelevement','nom du c omercial'];
  const rowsF2 = [
    ['Umar Khan','06 28 07 99 38','213145','signé','actif','Mouad'+NBSP+'ELBRAHMI'], // nbsp des 2 côtés -> doit rester Confirmé
    ['Werrad Sekrane','06 07 09 95 34','213815','signé','actif','Oussama Hmamou'],    // aucun lien Feuil1 -> Non recoupé
    ['Julienne Mbaibassoug','06 02 93 93 82','220711','signé','actif','Yassir Bouhdadi'] // Confirmé + traçabilité liée
  ];
  const statusSourcesRaw = [{ type:'feuil2', fileName:'tableau statut brut.xlsx', sheetName:'Feuil2', idx:0, rows:[headerF2,...rowsF2], header:headerF2 }];

  buildConsoIdentification(aBodies, statusSourcesRaw);

  eq('3 ventes ConsoPilote capturées (même sans ligne Feuil1)', consoIdentification.length, 3);
  const r213145 = consoIdentification.find(r=>r.contrat==='213145');
  eq('nbsp des 2 côtés -> Confirmé (pas de faux conflit)', r213145.fiabilite.startsWith('Confirmé'), true);
  eq('confirmée -> commentaire vide', r213145.commentaire, '');
  const r213815 = consoIdentification.find(r=>r.contrat==='213815');
  eq('aucun lien Feuil1 -> Non recoupé + commentaire exact', {f:r213815.fiabilite.startsWith('Non recoupé'), c:r213815.commentaire}, {f:true, c:'agent propriétaire non identifié'});
  eq('agent retenu = meilleure estimation (Feuil2)', r213815.agentRetenu, 'Oussama Hmamou');
  const r220711 = consoIdentification.find(r=>r.contrat==='220711');
  eq('traçabilité liée (contrat énergie + date vente)', {ce:r220711.contratEnergieLie, dv:r220711.dateVenteLiee}, {ce:'1810989', dv:'23/06/2026'});
  eq('vente Feuil1 avec contrat conso="0" ignorée (isEmptyConso)', consoIdentification.some(r=>r.client==='SansLien Client'), false);
})();

/* ===================== S9 — Élargissement commission ConsoPilote (fallback Feuil2 seul) ===================== */
sec('S9 · runConsoPipeline — 100% des ventes commissionnées, ZÉRO double paiement');
(function(){
  overrides = {};
  // 9 contrats liés Feuil1 (comme sur les données réelles du projet)
  const consoGroups = {};
  const liees = [['213145','Mouad ELBRAHMI'],['215213','Amine Jennane'],['220711','Yassir Bouhdadi']];
  liees.forEach(([ref,agent])=>{ consoGroups[ref] = { ref, agent, client:'Client '+ref, dateVente:new Date(2026,5,15), sources:['Feuil1.xlsx:Feuil1'] }; });
  const statusMap = {
    '213145':{etat:'Signé',prelev:'actif'}, '215213':{etat:'Signé',prelev:'actif'}, '220711':{etat:'Signé',prelev:'actif'},
    '213815':{etat:'Signé',prelev:'actif'}, '218185':{etat:'Signé',prelev:'actif'}
  };
  const headerF2 = ['nom ','telephone','numero contract','statut','prelevement','nom du c omercial'];
  const rowsF2 = [
    ['Umar Khan','x','213145','signé','actif','Mouad ELBRAHMI'],
    ['Paul Nogues','x','215213','signé','actif','Amine Jennane'],
    ['Julienne M','x','220711','signé','actif','Yassir Bouhdadi'],
    ['Werrad Sekrane','x','213815','signé','actif','Oussama Hmamou'], // sans lien Feuil1 -> fallback
    ['Mbarka Lakhal','x','218185','signé','actif','Salah eddine Elghazzawy'] // sans lien Feuil1 -> fallback
  ];
  const fullRowsF2 = [headerF2, ...rowsF2];
  // DEUX sources Feuil2 IDENTIQUES (simule 2 fichiers réels partageant la même feuille ConsoPilote)
  // -> vérifie que la dédup empêche tout double paiement même en cas d'import multi-fichiers.
  const statusSourcesRaw = [
    { type:'feuil2', fileName:'A.xlsx', sheetName:'Feuil2', idx:0, rows:fullRowsF2, header:headerF2 },
    { type:'feuil2', fileName:'B.xlsx', sheetName:'Consopilote Juin', idx:0, rows:fullRowsF2, header:headerF2 }
  ];

  const result = runConsoPipeline(consoGroups, statusMap, statusSourcesRaw);
  eq('5 lignes au total (3 liées + 2 fallback), aucun doublon malgré 2 fichiers Feuil2 identiques', result.length, 5);
  eq('5 contrats uniques', new Set(result.map(r=>r.contrat)).size, 5);

  const r213145 = result.find(r=>r.contrat==='213145');
  eq('contrat lié Feuil1 : agent Feuil1, date réelle, confirmé', {a:r213145.agent, dv:!!r213145.dateVente, conf:r213145.agentSourceConfirme}, {a:'Mouad ELBRAHMI', dv:true, conf:true});

  const r213815 = result.find(r=>r.contrat==='213815');
  eq('fallback : agent Feuil2, date NULLE, non confirmé', {a:r213815.agent, dv:r213815.dateVente, conf:r213815.agentSourceConfirme}, {a:'Oussama Hmamou', dv:null, conf:false});
  eq('fallback : conditions calculées normalement (statut/prélèvement réels connus)', r213815.conditionsOK, true);
  eq('fallback : net=0 par défaut (rien exigible sans date connue)', r213815.net, 0);
  eq('fallback : aucune échéance calculable (t1Date/t2Date null)', {t1:r213815.t1Date, t2:r213815.t2Date}, {t1:null, t2:null});

  // override manuel "Payé" sur un fallback (sans date) doit rester honoré (décision manager explicite)
  overrides['CONSO-218185'] = { statutPaiementT1:'Payé', statutPaiementT2:'Non Payé' };
  const result2 = runConsoPipeline(
    { '213145':{ref:'213145',agent:'Mouad ELBRAHMI',client:'C',dateVente:new Date(2026,5,15),sources:['x']} },
    { '218185':{etat:'Signé',prelev:'actif'} },
    [{ type:'feuil2', fileName:'A.xlsx', sheetName:'Feuil2', idx:0, rows:fullRowsF2, header:headerF2 }]
  );
  const r218185 = result2.find(r=>r.contrat==='218185');
  eq('override manuel T1=Payé sur fallback -> honoré malgré l\'absence de date', {t1:r218185.statutPaiementT1, net:r218185.net}, {t1:'Payé', net:50});

  // régression : un contrat Feuil1 SANS Feuil2 correspondante reste inchangé (comportement historique)
  overrides = {};
  const resultSolo = runConsoPipeline({ '555555':{ref:'555555',agent:'Agent Solo',client:'C',dateVente:new Date(2026,5,1),sources:['x']} }, {}, []);
  eq('contrat Feuil1 sans Feuil2 : toujours créé, confirmé (régression)', {n:resultSolo.length, conf:resultSolo[0].agentSourceConfirme}, {n:1, conf:true});

  // aucune source du tout -> aucune ligne fantôme
  eq('aucune source -> aucune ligne créée', runConsoPipeline({}, {}, []).length, 0);
})();

/* ===================== S10 — Identification par nom/téléphone (Feuil2 sans n° de contrat) ===================== */
sec('S10 · buildConsoIdentification — variante Date/Nom/Contact/Signature/SEPA (constat 2026-07-16)');
(function(){
  const headerA = ['Date de Vente','Numéro Contrat Energie','Nom du Client','Prénom du Client','Téléphone du Client','Nom du Commercial','Numéro Contrat ConsoPilote'];
  const rowsA = [
    // index téléphone : 4 (0-based) ; contrat conso volontairement absent (colonne 6 vide) pour forcer l'appariement client
    [new Date(2026,5,1), '1900001','Khan','Umar','628079938','Mouad ELBRAHMI',''],
    [new Date(2026,5,2), '1900002','Leveque','Patrick','749596131','Mouad ELBRAHMI','']
  ];
  const aBodies = [{ header: headerA, rows: rowsA, fileName:'tableau statut brut (5).xlsx', sheetName:'Feuil1' }];

  // ancienne Feuil2 (avec colonne agent) chargée dans le même import : sert de repli nom pour les
  // clients absents de Feuil1 (ex. Mamoudou Diallo, jamais vu comme client MINT).
  const headerOldF2 = ['nom ','telephone','numero contract','statut','prelevement','nom du c omercial'];
  const rowsOldF2 = [ ['Mamoudou Diallo','780120637','227267','signé','actif','Cécile Koly'] ];
  const oldF2Source = { type:'feuil2', fileName:'tableau statut brut.xlsx', sheetName:'Feuil2', idx:0, rows:[headerOldF2,...rowsOldF2], header:headerOldF2 };

  // nouvelle Feuil2 sans n° de contrat ni colonne agent
  const headerAlt = ['Date','Nom','Contact','Signature','SEPA'];
  const rowsAlt = [
    ['15/07/2026','Umar Khan','uk563333@gmail.com06 28 07 99 38','Signé','Actif'],           // téléphone -> Feuil1 (Mouad ELBRAHMI)
    ['15/07/2026','Patrik Leveque','patofil@outlook.fr00 00 00 00 00','Signé','Actif'],       // pas de tel exploitable -> nom approché vs Feuil1 (typo "Patrik")
    ['15/07/2026','Mamoudou Diallo','diallomamoudou@gmail.com07 80 12 06 37','Signé','Actif'],// pas dans Feuil1 -> repli ancienne Feuil2 (Cécile Koly)
    ['15/07/2026','Personne Totalement Inconnue','x@x.com00 00 00 00 01','Signé','Actif']     // aucune correspondance nulle part
  ];
  const altSource = { type:'feuil2alt', fileName:'tableau statut brut (5).xlsx', sheetName:'Feuil2', idx:0, rows:[headerAlt,...rowsAlt], header:headerAlt };

  buildConsoIdentification(aBodies, [oldF2Source, altSource]);
  const alt = consoIdentification.filter(r=>r.contrat.startsWith('SANS-N°') || /^\d{7}/.test(r.contrat));

  const rUmar = consoIdentification.find(r=>r.client==='Umar Khan');
  eq('S10a téléphone -> Feuil1 (Mouad ELBRAHMI)', {a:rUmar.agentRetenu, f:rUmar.fiabilite.startsWith('Confirmé (téléphone')}, {a:'Mouad ELBRAHMI', f:true});
  eq('S10b téléphone -> commentaire vide', rUmar.commentaire, '');

  const rPatrik = consoIdentification.find(r=>r.client==='Patrik Leveque');
  eq('S10c nom approché (typo) -> Patrick Leveque retrouvé', rPatrik.agentRetenu, 'Mouad ELBRAHMI');
  eq('S10d nom approché -> commentaire de validation manuelle', rPatrik.commentaire, 'correspondance approchée à valider');

  // Note : « Mamoudou Diallo » apparaît DEUX fois dans consoIdentification (l'ancienne Feuil2 contrat
  // 227267 non recoupée côté Feuil1, ET la nouvelle Feuil2 sans contrat retrouvée via le 3e filet) —
  // comportement voulu (deux exports, deux lignes d'audit) ; on désambiguïse ici par le préfixe de
  // référence synthétique propre au nouveau format pour cibler la bonne entrée.
  const rMamoudou = consoIdentification.find(r=>r.client==='Mamoudou Diallo' && r.contrat.startsWith('SANS-N°'));
  eq('S10e absent de Feuil1 -> repli ancienne Feuil2 (Cécile Koly)', rMamoudou.agentRetenu, 'Cécile Koly');
  eq('S10f repli ancienne Feuil2 -> commentaire vide (confirmé)', rMamoudou.commentaire, '');

  const rInconnu = consoIdentification.find(r=>r.client==='Personne Totalement Inconnue');
  eq('S10g aucune correspondance -> non identifié + commentaire exact', {a:rInconnu.agentRetenu, c:rInconnu.commentaire}, {a:'(agent non renseigné)', c:'agent propriétaire non identifié'});

  eq('S10h total : 1 (ancienne Feuil2, Mamoudou Diallo) + 4 (nouveau format) = 5', consoIdentification.length, 5);
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
