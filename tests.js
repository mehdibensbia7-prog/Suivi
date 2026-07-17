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
   CONSO Feuil2 seul + boucle de push (élargissement commission ConsoPilote, 2026-07-16),
   classifyContractRef + AGENT_INCONNU (catégorisation stricte des contrats + Panier Entreprise,
   règle Direction 2026-07-17).
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
// Catégorisation stricte des contrats (règle Direction 2026-07-17) : MINT=18XXXXX/7 chiffres,
// ConsoPilote=2XXXXX/6 chiffres. Un numéro hors des deux formats -> null, jamais de verdict par supposition.
const MINT_CONTRACT_RE = /^18\d{5}$/;
const CONSO_CONTRACT_RE = /^2\d{5}$/;
function classifyContractRef(ref){
  if(MINT_CONTRACT_RE.test(ref)) return 'MINT';
  if(CONSO_CONTRACT_RE.test(ref)) return 'CONSO';
  return null;
}
const AGENT_INCONNU = 'Panier Entreprise';
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
let consoIdentificationAt = null; // miroir du module-scope d'index.html (horodatage, non testé ici)
// COPIE VERBATIM d'index.html (resync 2026-07-16 soir : identité client pour contrats classiques
// absents de Feuil1, contrats Feuil1-seuls (2ter, cas ZENDA/KOLANI), dédup nouveau format vs
// classique, référence = vrai n° ConsoPilote retrouvé, agent retenu aligné sur le moteur).
// SEUL écart autorisé : parseDate(...) -> toDateSafe(...) (les tests passent des objets Date ;
// parseDate est un stub ici — voir STUBS en tête de fichier).
function buildConsoIdentification(aBodies, statusSourcesRaw){
  consoIdentification = [];
  // 1. table Feuil1 : n° contrat ConsoPilote -> {agent, dateVenteStr, contratEnergie, client} (source la plus fiable)
  const f1Map = {};
  // 1bis. tables Feuil1 par téléphone / par nom — nécessaires pour la variante Feuil2 SANS n° de contrat
  // (ex. « Date/Nom/Contact/Signature/SEPA », constatée le 2026-07-16) : seule l'identité du client
  // permet alors de retrouver la vente MINT liée et donc l'agent. Téléphone = signal fort (quasi jamais
  // de collision) ; nom = signal plus faible (homonymes, fautes de frappe), utilisé en repli.
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
      // n° ConsoPilote extrait AVANT l'entrée identité : un appariement téléphone/nom (2bis) doit
      // connaître le contrat ConsoPilote de la vente MINT retrouvée pour référencer la ligne sous son
      // VRAI n° de contrat (cas ZENDA/KOLANI du 2026-07-16 : contrat 236103 présent dans Feuil1 seule),
      // et non sous le n° énergie — sinon la même vente apparaît deux fois sous deux références.
      const refConso = (cA.contratConso!==-1 && !isEmptyConso(row[cA.contratConso])) ? normalizeRef(row[cA.contratConso]) : '';
      const entry = { agent, dateVenteStr: dateVente ? fmtDate(dateVente) : '', contratEnergie, client, contratConso: refConso };
      if(cA.telClient!==-1){
        const phone = extractPhoneDigits(row[cA.telClient]);
        if(phone) f1ByPhone[phone] = f1ByPhone[phone] || entry; // 1re occurrence gagne (ordre d'import)
      }
      if(nomC || prenomC){
        f1ByNameList.push({
          nameA: normalizeName([nomC,prenomC].filter(Boolean).join(' ')),
          nameB: normalizeName([prenomC,nomC].filter(Boolean).join(' ')),
          entry
        });
      }
      // table par contrat ConsoPilote (format classique, inchangée)
      if(refConso){
        const existing = f1Map[refConso] || {agent:'', dateVenteStr:'', contratEnergie:'', client:''};
        f1Map[refConso] = {
          agent: mergeStringField(existing.agent, agent),
          dateVenteStr: existing.dateVenteStr || (dateVente ? fmtDate(dateVente) : ''),
          contratEnergie: mergeStringField(existing.contratEnergie, contratEnergie),
          client: mergeStringField(existing.client, client)
        };
      }
    });
  });
  // recherche du meilleur nom approchant (Levenshtein) dans une liste de candidats {nameA, nameB, entry}
  // — seuil strict (≥90%), plus exigeant que le seuil de dédoublonnage d'agents (80%) car une mauvaise
  // attribution ici a un impact financier direct sur un client/agent précis, pas sur une simple fusion
  // de graphies. Réutilisée pour matcher contre Feuil1 ET contre l'ancien format Feuil2 (voir plus bas).
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
  // Recoupement d'identité client contre Feuil1 : téléphone (signal fort) puis nom (exact/approché).
  // Ignore les lignes Feuil1 SANS agent (rien à confirmer — évite un « Confirmé » avec agent vide).
  // Utilisé par 2bis (variante sans n° de contrat) ET par l'étape 3 pour les contrats classiques
  // absents de Feuil1 : l'information existe souvent dans Feuil1 même quand le n° de contrat n'y est
  // pas (cas relevé par la Direction le 2026-07-16 : client identifiable en quelques secondes par
  // téléphone/nom alors que l'onglet affichait « non recoupé »).
  function findF1ByIdentity(telRaw, clientRaw){
    const phone = extractPhoneDigits(telRaw);
    if(phone && f1ByPhone[phone] && f1ByPhone[phone].agent) return {entry:f1ByPhone[phone], via:'téléphone', exact:true};
    const nm = bestNameMatchIn(f1ByNameList, normalizeName(clientRaw));
    if(nm && nm.entry.agent) return {entry:nm.entry, via:'nom', exact:nm.exact};
    return null;
  }

  // 2. toutes les ventes ConsoPilote (Feuil2), qu'une ligne Feuil1 existe ou non
  const seen = {};
  // Registre nom -> agent tiré des feuilles ConsoPilote « ancien format » (avec colonne agent) déjà
  // chargées dans le même import — sert de 3e filet pour la variante « nouveau format » (2bis, plus
  // bas) : constat du 2026-07-16, les deux formats désignent en pratique le MÊME client (recoupement
  // vérifié à 100% sur un échantillon réel), le nouveau ayant juste perdu la colonne agent au passage.
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
      if(!client && !agentF2) return; // ligne vide en fin de feuille
      if(!seen[ref]) seen[ref] = {ref, client, tel, statut, prelev, agentF2, methode:'contrat'}; // 1re occurrence gagne (même règle que le moteur de commissionnement)
      if(client && agentF2){
        f2ByNameList.push({ nameA: normalizeName(client), nameB: normalizeName(client.split(' ').reverse().join(' ')), entry:{agent:agentF2, contratEnergie:'', dateVenteStr:'', client} });
      }
    });
  });

  // Clients déjà couverts par une feuille ConsoPilote CLASSIQUE : le nouveau format (export plus
  // récent du même portefeuille) re-liste les mêmes ventes (recoupement vérifié à 100% sur données
  // réelles le 2026-07-16). Pour ne pas compter DEUX fois la même vente, une ligne du nouveau format
  // dont le client est STRICTEMENT identique (nom normalisé, ordre nom/prénom indifférent) à une ligne
  // classique est ignorée : la ligne classique, plus riche (n° de contrat ConsoPilote + agent déclaré
  // + croisement Feuil1), fait foi. Égalité stricte volontaire (pas ≥90%) : un doublon d'affichage
  // résiduel est bénin, masquer une vraie vente distincte ne le serait pas.
  const classicClientNames = {};
  Object.values(seen).forEach(r=>{
    if(!r.client) return;
    const a = normalizeName(r.client), b = normalizeName(r.client.split(' ').reverse().join(' '));
    if(a) classicClientNames[a] = true;
    if(b) classicClientNames[b] = true;
  });

  // 2bis. variante SANS n° de contrat (Date/Nom/Contact/Signature/SEPA[/Agent]) : deux sous-variantes
  // constatées — sans colonne Agent (2026-07-16, fichier « (5) », l'identité client sert alors SEULE à
  // retrouver l'agent) et AVEC colonne Agent (constatée le 2026-07-17, fichier « (3) » — l'export porte
  // désormais l'agent directement, valeur « Inconnu » = non renseigné par la source). Objectif : ne
  // JAMAIS laisser l'agent vide si une source quelconque le fournit — toutes les évidences disponibles
  // (déclaration directe ET recoupement d'identité) sont conservées et confrontées en étape 3.
  let altIdx = 0;
  (statusSourcesRaw||[]).filter(s=>s.type==='feuil2alt').forEach(src=>{
    const header = src.header;
    const cAlt = {
      client: colIndexByNames(header, ['nom']),
      contact: colIndexByNames(header, ['contact']),
      etat: colIndexByNames(header, ['signature']),
      prelev: colIndexByNames(header, ['sepa']),
      agent: colIndexByNames(header, ['agent'])
    };
    if(cAlt.client===-1) return;
    const hasAgentCol = cAlt.agent!==-1;
    (src.rows||[]).slice(src.idx+1).forEach(row=>{
      if(!row) return;
      const client = (row[cAlt.client]||'').toString().trim();
      const contact = cAlt.contact!==-1 ? (row[cAlt.contact]||'').toString().trim() : '';
      const statut = cAlt.etat!==-1 ? (row[cAlt.etat]||'').toString().trim() : '';
      const prelev = cAlt.prelev!==-1 ? (row[cAlt.prelev]||'').toString().trim() : '';
      if(!client) return;
      const nClient = normalizeName(client);
      const nClientRev = normalizeName(client.split(' ').reverse().join(' '));
      if(classicClientNames[nClient] || classicClientNames[nClientRev]) return; // même vente déjà auditée via une feuille classique — pas de doublon
      // déclaration directe (nouvelle colonne Agent) — « Inconnu » = source elle-même sans réponse,
      // traité comme absent (pas comme un nom d'agent réel) pour laisser jouer le recoupement d'identité.
      const agentDeclareRaw = hasAgentCol ? (row[cAlt.agent]||'').toString().trim() : '';
      const agentDeclare = (agentDeclareRaw && norm(agentDeclareRaw)!=='inconnu') ? agentDeclareRaw : '';
      let match = null, methode = 'non_trouve';
      const idM = findF1ByIdentity(contact, client);
      if(idM && idM.via==='téléphone'){ match = idM.entry; methode = 'telephone'; }
      else if(idM){ match = idM.entry; methode = idM.exact ? 'nom_exact' : 'nom_approche'; }
      else {
        // 3e filet : même client déjà déclaré (avec son agent) dans une feuille ConsoPilote « ancien
        // format » importée en même temps — voir f2ByNameList ci-dessus.
        const nameMatch2 = bestNameMatchIn(f2ByNameList, nClient);
        if(nameMatch2 && nameMatch2.entry.agent){ match = nameMatch2.entry; methode = nameMatch2.exact ? 'nom_exact_ancien_feuil2' : 'nom_approche_ancien_feuil2'; }
      }
      altIdx++;
      // référence affichée : le VRAI n° de contrat ConsoPilote si la vente MINT retrouvée en porte un
      // (fusionne avec la vue Feuil1 du même contrat — cas ZENDA 236103), sinon le n° de contrat
      // énergie retrouvé, sinon un repère interne clairement identifiable comme non contractuel.
      const ref = (match && match.contratConso) ? match.contratConso : ((match && match.contratEnergie) ? match.contratEnergie : `SANS-N°-${altIdx}`);
      if(seen[ref]) return; // déjà couverte (feuille classique ou autre ligne du nouveau format) — pas de doublon
      seen[ref] = {
        ref, client, tel: contact, statut, prelev,
        agentF2: match ? match.agent : '', methode,
        agentDeclare, hasAgentCol, agentDeclareRaw,
        contratEnergieLie: match ? (match.contratEnergie || '') : '',
        dateVenteLiee: match ? (match.dateVenteStr || '') : ''
      };
    });
  });

  // 2ter. contrats ConsoPilote présents UNIQUEMENT dans Feuil1 (constat Direction du 2026-07-16, cas
  // « ZENDA / KOLANI » contrat 236103 : la vente est commissionnée depuis toujours par le moteur via
  // consoGroups — moteur inchangé ici — mais n'apparaissait dans AUCUNE feuille ConsoPilote, donc pas
  // non plus dans cet onglet qui promettait pourtant « 100% des ventes »). Ajoutés EN DERNIER : une
  // ligne classique (2) ou nouveau format (2bis, référencée sous son n° ConsoPilote retrouvé) a
  // toujours priorité — aucun doublon possible (dictionnaire `seen` clé = n° de contrat).
  Object.keys(f1Map).forEach(ref=>{
    if(seen[ref]) return; // déjà couverte par une feuille ConsoPilote (classique ou nouveau format)
    const f1 = f1Map[ref];
    seen[ref] = { ref, client: f1.client, tel:'', statut:'', prelev:'', agentF2:'', methode:'feuil1_seul' };
  });

  // 3. croisement + verdict de fiabilité
  Object.values(seen).forEach(row=>{
    let fiabilite, commentaire, agentRetenu, agentFeuil1Aff, contratEnergieAff='—', dateVenteAff='—';

    if(row.methode==='contrat'){
      // format classique : croisement par n° de contrat ConsoPilote d'abord (audit du 2026-07-16),
      // puis — nouveauté du même jour — par IDENTITÉ CLIENT (téléphone/nom vs Feuil1) quand le contrat
      // est inconnu de Feuil1 : l'information y existe souvent quand même (constat Direction, cas
      // retrouvable « en quelques secondes » à la main — voir findF1ByIdentity).
      const f1 = f1Map[row.ref];
      const nF2 = normalizeName(row.agentF2);
      if(f1 && f1.agent){
        const nF1 = normalizeName(f1.agent);
        if(nF1 && nF1===nF2){
          fiabilite = 'Confirmé (Feuil1 + Feuil2 concordants)'; commentaire = ''; agentRetenu = f1.agent;
        } else {
          fiabilite = `Conflit (Feuil1="${f1.agent}" vs Feuil2="${row.agentF2}")`;
          // agent retenu = agent Feuil1 : pour un contrat lié Feuil1, c'est LUI que le moteur de
          // commissionnement paie (priorité à la source de la vente d'origine) — la colonne doit
          // refléter ce qui est réellement commissionné, pas l'autre déclaration.
          commentaire = 'agent propriétaire non identifié'; agentRetenu = f1.agent || row.agentF2;
        }
        agentFeuil1Aff = f1.agent;
        contratEnergieAff = f1.contratEnergie || '—'; dateVenteAff = f1.dateVenteStr || '—';
      } else {
        const idM = findF1ByIdentity(row.tel, row.client);
        if(idM && idM.exact){
          const concordant = nF2 && normalizeName(idM.entry.agent)===nF2;
          if(concordant){
            fiabilite = `Confirmé (client recoupé par ${idM.via} — contrat absent de Feuil1)`;
            commentaire = ''; agentRetenu = row.agentF2;
          } else {
            fiabilite = `Conflit (client recoupé par ${idM.via} : Feuil1="${idM.entry.agent}" vs ConsoPilote="${row.agentF2}")`;
            // contrat absent de Feuil1 -> le moteur commissionne via le fallback Feuil2 : agent Feuil2.
            commentaire = 'agent propriétaire non identifié'; agentRetenu = row.agentF2 || idM.entry.agent;
          }
          agentFeuil1Aff = idM.entry.agent || '—';
          contratEnergieAff = idM.entry.contratEnergie || '—'; dateVenteAff = idM.entry.dateVenteStr || '—';
        } else if(idM){
          fiabilite = `Correspondance approchée (client ~ Feuil1 « ${idM.entry.client} », nom ≥90% — à valider manuellement)`;
          commentaire = 'correspondance approchée à valider'; agentRetenu = row.agentF2 || '(agent non renseigné)';
          agentFeuil1Aff = idM.entry.agent || '—';
          contratEnergieAff = idM.entry.contratEnergie || '—'; dateVenteAff = idM.entry.dateVenteStr || '—';
        } else {
          fiabilite = 'Non recoupé (source unique ConsoPilote)';
          commentaire = 'agent propriétaire non identifié'; agentRetenu = row.agentF2 || '(agent non renseigné)';
          agentFeuil1Aff = '—';
          if(f1){ contratEnergieAff = f1.contratEnergie || '—'; dateVenteAff = f1.dateVenteStr || '—'; }
        }
      }
    } else if(row.methode==='feuil1_seul'){
      // vente ConsoPilote connue de Feuil1 SEULE (n° de contrat ConsoPilote renseigné dans le suivi
      // MINT, absente de toutes les feuilles ConsoPilote importées) — cas ZENDA/KOLANI 236103 :
      // commissionnée par le moteur (consoGroups, date réelle) mais statut Signé/prélèvement inconnus
      // tant qu'aucune feuille ConsoPilote ne la mentionne.
      const f1 = f1Map[row.ref];
      fiabilite = 'Source unique Feuil1 (absente des feuilles ConsoPilote)';
      commentaire = 'statut ConsoPilote (signé/prélèvement) à confirmer';
      agentRetenu = f1.agent || '(agent non renseigné)';
      agentFeuil1Aff = f1.agent || '—';
      contratEnergieAff = f1.contratEnergie || '—'; dateVenteAff = f1.dateVenteStr || '—';
    } else {
      // format sans n° de contrat (Date/Nom/Contact/Signature/SEPA[/Agent]) : DEUX évidences possibles,
      // confrontées ici pour ne jamais laisser l'agent vide quand au moins une est disponible —
      // (a) déclaration DIRECTE (colonne Agent, constatée le 2026-07-17, absente si ancien export type
      //     fichier « (5) ») — équivalent du « nom du commercial » des autres formats ConsoPilote ;
      // (b) recoupement d'IDENTITÉ client (téléphone > nom exact > nom approché) contre Feuil1, puis à
      //     défaut contre une feuille ConsoPilote « ancien format » du même import (constat 2026-07-16 :
      //     100% de recouvrement sur échantillon réel). Seuil de similarité nom strict (≥90%).
      // Quand les deux existent et concordent : confirmation la plus forte de tout l'audit. Quand elles
      // divergent : priorité à l'identité EXACTE (téléphone/nom exact) — même règle que partout ailleurs
      // dans cette fonction (« priorité à la source liée à la vente d'origine ») ; à une correspondance
      // approchée (incertaine), priorité à la déclaration directe.
      const declare = row.agentDeclare || '';
      const nDecl = normalizeName(declare);
      const idExact = row.methode==='telephone' || row.methode==='nom_exact' || row.methode==='nom_exact_ancien_feuil2';
      const idApprox = row.methode==='nom_approche' || row.methode==='nom_approche_ancien_feuil2';
      const idLabel = row.methode==='telephone' ? 'téléphone'
        : (row.methode==='nom_exact' ? 'nom exact Feuil1' : (row.methode==='nom_approche' ? 'nom ≥90% Feuil1'
        : (row.methode==='nom_exact_ancien_feuil2' ? 'nom exact, ancienne Feuil2' : 'nom ≥90%, ancienne Feuil2')));

      if(declare && idExact){
        if(nDecl && nDecl===normalizeName(row.agentF2)){
          fiabilite = `Confirmé (agent déclaré + ${idLabel} concordants)`; commentaire = ''; agentRetenu = declare;
        } else {
          fiabilite = `Conflit (agent déclaré="${declare}" vs ${idLabel}="${row.agentF2}")`;
          commentaire = 'agent propriétaire non identifié'; agentRetenu = row.agentF2 || declare;
        }
      } else if(declare && idApprox){
        if(nDecl && nDecl===normalizeName(row.agentF2)){
          fiabilite = `Confirmé (agent déclaré + ${idLabel})`; commentaire = ''; agentRetenu = declare;
        } else {
          fiabilite = `Correspondance approchée (agent déclaré="${declare}", ${idLabel}="${row.agentF2}" — à valider)`;
          commentaire = 'correspondance approchée à valider'; agentRetenu = declare;
        }
      } else if(declare){
        // agent déclaré directement, aucune corroboration Feuil1/ancienne Feuil2 possible — reste
        // affiché (jamais « agent non renseigné » quand une déclaration existe), simplement non recoupé.
        fiabilite = 'Non recoupé (agent déclaré — source ConsoPilote unique, nouveau format)';
        commentaire = 'agent propriétaire non identifié'; agentRetenu = declare;
      } else if(idExact){
        fiabilite = `Confirmé (${idLabel} — nouveau format sans agent déclaré)`; commentaire = ''; agentRetenu = row.agentF2;
      } else if(idApprox){
        fiabilite = `Correspondance approchée (${idLabel} — à valider manuellement)`;
        commentaire = 'correspondance approchée à valider'; agentRetenu = row.agentF2;
      } else {
        fiabilite = row.hasAgentCol
          ? 'Non identifié (agent marqué « Inconnu » par la source, aucune correspondance client)'
          : 'Non identifié (nouveau format sans n° de contrat, aucune correspondance client)';
        commentaire = 'agent propriétaire non identifié'; agentRetenu = '(agent non renseigné)';
      }
      agentFeuil1Aff = row.agentF2 || '—';
      contratEnergieAff = row.contratEnergieLie || '—'; dateVenteAff = row.dateVenteLiee || '—';
    }

    consoIdentification.push({
      contrat: row.ref, client: row.client, telephone: row.tel, statut: row.statut, prelevement: row.prelev,
      agentFeuil2: row.methode==='contrat' ? (row.agentF2 || '—')
        : (row.methode==='feuil1_seul' ? '— (absente des feuilles ConsoPilote)'
        : (row.hasAgentCol ? (row.agentDeclareRaw || '(vide)') : '— (format sans colonne agent)')),
      agentFeuil1: agentFeuil1Aff,
      agentRetenu, fiabilite, commentaire,
      contratEnergieLie: contratEnergieAff,
      dateVenteLiee: dateVenteAff
    });
  });
  consoIdentification.sort((a,b)=> (a.contrat||'').localeCompare(b.contrat||''));
  consoIdentificationAt = new Date().toISOString(); // horodatage affiché dans l'onglet (audit recalculé à l'import uniquement)
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

  const rUmar = consoIdentification.find(r=>r.client==='Umar Khan');
  eq('S10a téléphone -> Feuil1 (Mouad ELBRAHMI)', {a:rUmar.agentRetenu, f:rUmar.fiabilite.startsWith('Confirmé (téléphone')}, {a:'Mouad ELBRAHMI', f:true});
  eq('S10b téléphone -> commentaire vide', rUmar.commentaire, '');

  const rPatrik = consoIdentification.find(r=>r.client==='Patrik Leveque');
  eq('S10c nom approché (typo) -> Patrick Leveque retrouvé', rPatrik.agentRetenu, 'Mouad ELBRAHMI');
  eq('S10d nom approché -> commentaire de validation manuelle', rPatrik.commentaire, 'correspondance approchée à valider');

  // Dédup (règle du 2026-07-16 soir) : « Mamoudou Diallo » apparaît dans l'ancienne Feuil2 (contrat
  // 227267) ET dans le nouveau format — c'est la MÊME vente (le nouveau format re-liste le même
  // portefeuille). Une seule ligne d'audit doit subsister : la classique, plus riche (n° de contrat
  // + agent déclaré + croisement Feuil1). L'ancien comportement (deux lignes) gonflait le total.
  const rMamoudou = consoIdentification.filter(r=>normalizeName(r.client)==='mamoudou diallo');
  eq('S10e même client classique + nouveau format -> UNE seule ligne (dédup stricte)', rMamoudou.length, 1);
  eq('S10f la ligne conservée est la classique (contrat + agent déclaré)', {c:rMamoudou[0].contrat, a:rMamoudou[0].agentRetenu}, {c:'227267', a:'Cécile Koly'});

  const rInconnu = consoIdentification.find(r=>r.client==='Personne Totalement Inconnue');
  eq('S10g aucune correspondance -> non identifié + commentaire exact', {a:rInconnu.agentRetenu, c:rInconnu.commentaire}, {a:'(agent non renseigné)', c:'agent propriétaire non identifié'});

  eq('S10h total : 1 classique (Mamoudou) + 3 nouveau format (doublon Mamoudou dédupliqué) = 4', consoIdentification.length, 4);
  eq('S10i réf nouveau format = contrat énergie retrouvé + traçabilité date MINT', {c:rUmar.contrat, dv:rUmar.dateVenteLiee}, {c:'1900001', dv:'01/06/2026'});
})();

/* ===================== S11 — Ventes Feuil1-seules (ZENDA/KOLANI) + identité client sur format classique ===================== */
sec('S11 · buildConsoIdentification — contrats Feuil1-seuls visibles, fusion par n° ConsoPilote, agent retenu = agent commissionné');
(function(){
  const headerA = ['Date de Vente','Numéro Contrat Energie','Nom du Client','Prénom du Client','Téléphone du Client','Nom du Commercial','Numéro Contrat ConsoPilote'];
  const rowsA = [
    // vente ConsoPilote connue de Feuil1 SEULE (cas réel ZENDA/KOLANI : contrat 236103, tel 645804250)
    [new Date(2026,6,10), '1820940','ZENDA','Rabah','645804250','KOLANI','236103'],
    // vente ConsoPilote Feuil1-seule dont le client n'apparaît dans AUCUNE feuille ConsoPilote (cas réel DIABY)
    [new Date(2026,6,1), '1816386','DIABY','Mamadou','611111111','Amine Jennane','229199'],
    // client MINT sans n° ConsoPilote -> sert au recoupement identité de la feuille classique (concordant)
    [new Date(2026,6,3), '1808942','SEKRANE','Werrad','607099534','Oussama Hmamou',''],
    // client MINT sans n° ConsoPilote, agent DIFFÉRENT de la déclaration ConsoPilote -> conflit identité
    [new Date(2026,6,4), '1808836','LAKHAL','Mbarka','622222222','Agent Feuil1 Different',''],
    // contrat lié Feuil1 avec agent discordant vs Feuil2 -> conflit par contrat, agent retenu = Feuil1
    [new Date(2026,6,5), '1805322','KHAN','Umar','633333333','Agent Officiel Feuil1','213145']
  ];
  const aBodies = [{ header: headerA, rows: rowsA, fileName:'tableau statut brut (5).xlsx', sheetName:'Feuil1' }];

  const headerF2 = ['nom ','telephone','numero contract','statut','prelevement','nom du c omercial'];
  const rowsF2 = [
    ['Umar Khan','06 33 33 33 33','213145','signé','actif','Autre Agent Feuil2'],
    ['Werrad Sekrane','06 07 09 95 34','213815','signé','actif','Oussama Hmamou'],
    ['Mbarka Lakhal','06 22 22 22 22','218185','signé','actif','Salah eddine Elghazzawy']
  ];
  const f2Source = { type:'feuil2', fileName:'old.xlsx', sheetName:'Feuil2', idx:0, rows:[headerF2,...rowsF2], header:headerF2 };

  // nouveau format : Zenda présent -> doit fusionner sous le n° ConsoPilote retrouvé (236103), PAS sous 1820940
  const headerAlt = ['Date','Nom','Contact','Signature','SEPA'];
  const rowsAlt = [ ['10/07/2026','Rabah Zenda','dz.col35@gmail.com06 45 80 42 50','Signé','Actif'] ];
  const altSource = { type:'feuil2alt', fileName:'tableau statut brut (5).xlsx', sheetName:'Feuil2', idx:0, rows:[headerAlt,...rowsAlt], header:headerAlt };

  buildConsoIdentification(aBodies, [f2Source, altSource]);

  const zenda = consoIdentification.filter(r=>normalizeName(r.client||'').indexOf('zenda')!==-1);
  eq('S11a ZENDA -> une seule ligne (fusion nouveau format / Feuil1 par n° ConsoPilote)', zenda.length, 1);
  eq('S11b ZENDA -> réf = vrai n° ConsoPilote + agent KOLANI par téléphone', {c:zenda[0].contrat, a:zenda[0].agentRetenu, f:zenda[0].fiabilite.startsWith('Confirmé (téléphone')}, {c:'236103', a:'KOLANI', f:true});
  eq('S11c ZENDA -> traçabilité MINT (contrat énergie + date de vente)', {ce:zenda[0].contratEnergieLie, dv:zenda[0].dateVenteLiee}, {ce:'1820940', dv:'10/07/2026'});

  const diaby = consoIdentification.find(r=>r.contrat==='229199');
  eq('S11d Feuil1-seule (aucune feuille Conso) -> visible « Source unique Feuil1 » + agent Feuil1', {ok:!!diaby, f:diaby?diaby.fiabilite.startsWith('Source unique Feuil1'):false, a:diaby?diaby.agentRetenu:''}, {ok:true, f:true, a:'Amine Jennane'});

  const khan = consoIdentification.find(r=>r.contrat==='213145');
  eq('S11e conflit par contrat -> agent retenu = agent Feuil1 (celui que le moteur paie)', {f:khan.fiabilite.startsWith('Conflit'), a:khan.agentRetenu}, {f:true, a:'Agent Officiel Feuil1'});

  const sekrane = consoIdentification.find(r=>r.contrat==='213815');
  eq('S11f contrat absent de Feuil1, identité téléphone concordante -> Confirmé, commentaire vide', {f:sekrane.fiabilite.startsWith('Confirmé (client recoupé par téléphone'), c:sekrane.commentaire}, {f:true, c:''});

  const lakhal = consoIdentification.find(r=>r.contrat==='218185');
  eq('S11g identité discordante -> Conflit, agent retenu = déclaration ConsoPilote (fallback moteur)', {f:lakhal.fiabilite.startsWith('Conflit (client recoupé'), a:lakhal.agentRetenu, c:lakhal.commentaire}, {f:true, a:'Salah eddine Elghazzawy', c:'agent propriétaire non identifié'});

  eq('S11h total : 3 classiques + ZENDA fusionnée (236103) + DIABY Feuil1-seule = 5', consoIdentification.length, 5);
})();

/* ===================== S12 — Colonne Agent directe (nouveau format constaté le 2026-07-17) ===================== */
sec('S12 · buildConsoIdentification — déclaration directe (colonne Agent) confrontée à l\'identité, agent jamais masqué');
(function(){
  const headerA = ['Date de Vente','Numéro Contrat Energie','Nom du Client','Prénom du Client','Téléphone du Client','Nom du Commercial','Numéro Contrat ConsoPilote'];
  const rowsA = [
    [new Date(2026,6,10), '1900201','Zenda','Rabah','645804250','KOLANI',''],
    [new Date(2026,6,11), '1900202','Nom','Faux','611111111','Agent Feuil1',''],
    [new Date(2026,6,12), '1900203','Client','Approx','','Agent Approx Feuil1','']
  ];
  const aBodies = [{ header: headerA, rows: rowsA, fileName:'tableau statut brut (3).xlsx', sheetName:'Feuil1' }];

  // en-tête réel constaté (fichier « (3) », Feuil3) : Date/Nom/Contact/Signature/SEPA/[colonne vide]/Agent
  const headerAlt = ['Date','Nom','Contact','Signature','SEPA','','Agent'];
  const rowsAlt = [
    ['17/07/2026','Rabah Zenda','dz.col35@gmail.com06 45 80 42 50','Signé','Actif','','KOLANI'],            // téléphone Feuil1 + agent déclaré concordants (cas réel)
    ['17/07/2026','Faux Nom','contact@x.com06 11 11 11 11','Signé','Actif','','Autre Agent Declare'],       // téléphone Feuil1 discordant vs agent déclaré
    ['17/07/2026','Approx Clientt','noone@x.com','Signé','Actif','','Agent Approx Declare'],                // nom ≥90% Feuil1 (pas de tél exploitable) discordant vs agent déclaré
    ['17/07/2026','Jalila Client Sans Lien','noone2@x.com','Signé','Actif','','Jalila Gounain'],            // aucun lien Feuil1 -> agent déclaré seul, jamais masqué
    ['17/07/2026','Personne Inconnue Colonne','noone3@x.com','Signé','Actif','','Inconnu']                  // « Inconnu » -> traité comme non renseigné, pas comme un nom d'agent
  ];
  const altSource = { type:'feuil2alt', fileName:'tableau statut brut (3).xlsx', sheetName:'Feuil3', idx:0, rows:[headerAlt,...rowsAlt], header:headerAlt };

  buildConsoIdentification(aBodies, [altSource]);

  const rZenda = consoIdentification.find(r=>r.client==='Rabah Zenda');
  eq('S12a téléphone + agent déclaré concordants -> Confirmé, commentaire vide', {f:rZenda.fiabilite.startsWith('Confirmé (agent déclaré'), a:rZenda.agentRetenu, c:rZenda.commentaire}, {f:true, a:'KOLANI', c:''});

  const rFaux = consoIdentification.find(r=>r.client==='Faux Nom');
  eq('S12b téléphone Feuil1 discordant vs agent déclaré -> Conflit, agent retenu = Feuil1 (identité exacte prioritaire)', {f:rFaux.fiabilite.startsWith('Conflit (agent déclaré'), a:rFaux.agentRetenu, c:rFaux.commentaire}, {f:true, a:'Agent Feuil1', c:'agent propriétaire non identifié'});

  const rApprox = consoIdentification.find(r=>r.client==='Approx Clientt');
  eq('S12c nom approché discordant vs agent déclaré -> Correspondance approchée, agent retenu = déclaration directe (identité incertaine)', {f:rApprox.fiabilite.startsWith('Correspondance approchée (agent déclaré'), a:rApprox.agentRetenu, c:rApprox.commentaire}, {f:true, a:'Agent Approx Declare', c:'correspondance approchée à valider'});

  const rJalila = consoIdentification.find(r=>r.client==='Jalila Client Sans Lien');
  eq('S12d agent déclaré sans corroboration possible -> jamais masqué, Non recoupé', {f:rJalila.fiabilite.startsWith('Non recoupé (agent déclaré'), a:rJalila.agentRetenu, c:rJalila.commentaire}, {f:true, a:'Jalila Gounain', c:'agent propriétaire non identifié'});

  const rInconnu = consoIdentification.find(r=>r.client==='Personne Inconnue Colonne');
  eq('S12e "Inconnu" traité comme non renseigné, aucune corroboration -> Non identifié explicite', {f:rInconnu.fiabilite.startsWith('Non identifié (agent marqué'), a:rInconnu.agentRetenu, c:rInconnu.commentaire}, {f:true, a:'(agent non renseigné)', c:'agent propriétaire non identifié'});

  eq('S12f colonne Agent affichée telle quelle (agentFeuil2), y compris la valeur littérale "Inconnu"', {z:rZenda.agentFeuil2, i:rInconnu.agentFeuil2}, {z:'KOLANI', i:'Inconnu'});
  eq('S12g total : 5 lignes (une par client, aucune perdue)', consoIdentification.length, 5);
})();

/* ===================== S13 — Catégorisation stricte des contrats + Panier Entreprise (règle Direction 2026-07-17) ===================== */
sec('S13 · classifyContractRef — MINT=18XXXXX/7 chiffres, ConsoPilote=2XXXXX/6 chiffres, jamais de verdict par supposition');
(function(){
  // -- numéros MINT réels (vérifiés sur les données du projet) --
  eq('S13a MINT réel (1811957) -> MINT', classifyContractRef('1811957'), 'MINT');
  eq('S13b MINT réel ZENDA (1820940) -> MINT', classifyContractRef('1820940'), 'MINT');
  eq('S13c MINT limite basse (1800000) -> MINT', classifyContractRef('1800000'), 'MINT');

  // -- numéros ConsoPilote réels --
  eq('S13d ConsoPilote réel (223453) -> CONSO', classifyContractRef('223453'), 'CONSO');
  eq('S13e ConsoPilote réel ZENDA (236103) -> CONSO', classifyContractRef('236103'), 'CONSO');
  eq('S13f ConsoPilote limite basse (200000) -> CONSO', classifyContractRef('200000'), 'CONSO');
  eq('S13g ConsoPilote 6 chiffres, 2e chiffre 9 (299999) -> CONSO', classifyContractRef('299999'), 'CONSO');

  // -- anomalie réelle constatée dans les données du projet (ligne NDIAYE, fichier téléchargé le 2026-07-17) --
  eq('S13h anomalie réelle "7917962" (7 chiffres, ne commence pas par 18) -> null (jamais de supposition)', classifyContractRef('7917962'), null);
  eq('S13i anomalie réelle "166641" (6 chiffres, ne commence pas par 2) -> null', classifyContractRef('166641'), null);

  // -- cas limites de format --
  eq('S13j 6 chiffres commençant par "18" (trop court pour MINT, ne commence pas par "2") -> null', classifyContractRef('180001'), null);
  eq('S13k 8 chiffres commençant par "18" (trop long pour MINT) -> null', classifyContractRef('18055512'), null);
  eq('S13l vide -> null', classifyContractRef(''), null);

  // -- les deux formats sont mutuellement exclusifs par construction (aucun numéro ne peut matcher les deux) --
  const sample = ['1811957','1820940','223453','236103','7917962','166641','180001','299999'];
  eq('S13m formats mutuellement exclusifs (aucun numéro classé à la fois MINT et CONSO)', sample.every(r=>!(MINT_CONTRACT_RE.test(r) && CONSO_CONTRACT_RE.test(r))), true);

  eq('S13n AGENT_INCONNU = "Panier Entreprise" (identité système, règle Direction 2026-07-17)', AGENT_INCONNU, 'Panier Entreprise');
})();

/* ===================== S14 — Réplique : décision d'inversion de catégorie dans buildLignes ===================== */
sec('S14 · réplique — un numéro trouvé dans la mauvaise colonne est redirigé automatiquement, jamais deviné');
(function(){
  // Réplique du bloc de décision ajouté dans buildLignes (aiguillage MINT<->CONSO) : logique non
  // isolable telle quelle (imbriquée dans la boucle d'import, dépendante de mintGroups/consoGroups) —
  // réencodée ici pour figer le COMPORTEMENT attendu, conformément à la convention du fichier (section
  // « RÉPLIQUES DE CONTRAT »). Toute divergence avec index.html doit être répercutée ici.
  function decideColumn(colonneSource, ref){
    const cls = classifyContractRef(ref);
    if(colonneSource==='MINT'){
      if(cls==='CONSO') return { traiteComme:'CONSO', swap:true, anomalie:false };
      if(cls===null)    return { traiteComme:'MINT',  swap:false, anomalie:true };
      return { traiteComme:'MINT', swap:false, anomalie:false };
    }
    // colonneSource==='CONSO'
    if(cls==='MINT')  return { traiteComme:'MINT',  swap:true, anomalie:false };
    if(cls===null)     return { traiteComme:'CONSO', swap:false, anomalie:true };
    return { traiteComme:'CONSO', swap:false, anomalie:false };
  }

  eq('S14a ConsoPilote saisi en colonne MINT (236103) -> redirigé vers CONSO', decideColumn('MINT','236103'), { traiteComme:'CONSO', swap:true, anomalie:false });
  eq('S14b MINT saisi en colonne ConsoPilote (1820940) -> redirigé vers MINT', decideColumn('CONSO','1820940'), { traiteComme:'MINT', swap:true, anomalie:false });
  eq('S14c MINT correctement placé (1811957) -> inchangé, aucune anomalie', decideColumn('MINT','1811957'), { traiteComme:'MINT', swap:false, anomalie:false });
  eq('S14d ConsoPilote correctement placé (223453) -> inchangé, aucune anomalie', decideColumn('CONSO','223453'), { traiteComme:'CONSO', swap:false, anomalie:false });
  eq('S14e numéro hors format en colonne MINT (7917962) -> reste MINT (comportement historique), signalé en anomalie', decideColumn('MINT','7917962'), { traiteComme:'MINT', swap:false, anomalie:true });
  eq('S14f numéro hors format en colonne ConsoPilote -> reste CONSO, signalé en anomalie (jamais de supposition)', decideColumn('CONSO','999999999'), { traiteComme:'CONSO', swap:false, anomalie:true });
})();

/* ===================== S15 — Migration agent inconnu sur session déjà importée (bug réel 2026-07-17) ===================== */
sec('S15 · applyReglesToLignes — une session importée AVANT AGENT_INCONNU doit migrer vers "Panier Entreprise" au rechargement');
(function(){
  // Réplique de la ligne de migration ajoutée dans applyReglesToLignes (index.html) : un rechargement
  // de session depuis IndexedDB ne re-parse jamais les fichiers sources, donc l'ancien texte littéral
  // ne peut être corrigé qu'en le réécrivant explicitement sur les lignes déjà persistées.
  function migrateAgentInconnu(lignes){
    lignes.forEach(l=>{ if(l.agent==='(agent non renseigné)') l.agent = AGENT_INCONNU; });
  }
  const lignes = [
    { id:'MINT-1', type:'MINT', agent:'(agent non renseigné)' },     // ancienne session, agent inconnu -> doit migrer
    { id:'MINT-2', type:'MINT', agent:'Amine Jennane' },              // agent normal -> ne doit JAMAIS être touché
    { id:'CONSO-1', type:'CONSO', agent:'(agent non renseigné)' },    // même migration côté CONSO
    { id:'CONSO-2', type:'CONSO', agent:'Panier Entreprise' }         // déjà migré (import récent) -> inchangé, idempotent
  ];
  migrateAgentInconnu(lignes);
  eq('S15a ancien texte MINT -> migré vers Panier Entreprise', lignes[0].agent, 'Panier Entreprise');
  eq('S15b agent normal jamais altéré', lignes[1].agent, 'Amine Jennane');
  eq('S15c ancien texte CONSO -> migré vers Panier Entreprise', lignes[2].agent, 'Panier Entreprise');
  eq('S15d déjà migré -> idempotent, inchangé', lignes[3].agent, 'Panier Entreprise');
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
