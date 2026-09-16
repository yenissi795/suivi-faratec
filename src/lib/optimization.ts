// =========================================================
// MODULE OPTIMIZATION - Analyse des performances
// =========================================================

import { calculerTempsTravail } from "./workTime";

// --- TYPES DE BASE ---
export interface CoefficientTravail {
  id: string;
  type_travail: string;
  puissance_min: number;
  puissance_max: number;
  temps_attendu_jours: number;
  tolerance_pourcentage: number;
}

export interface EquipementAnalyse {
  id: string;
  code_faratec: string | null;
  client_name: string;
  type_equipement: string;
  puissance_kw: number | null;
  nature_travaux: string | null;
  created_at: string;
  date_debut_intervention: string | null;
  date_fin_intervention: string | null;
  statut: string;
  pourcentage_global: number;
}

export interface SessionAnalyse {
  id: string;
  equipement_id: string;
  operateur_id: string;
  atelier_id?: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface AnalyseResult {
  temps_attendu_jours: number;
  temps_reel_jours: number;
  progression: number;
  efficacite: number;
  depassement_pourcentage: number;
  est_sur_duree: boolean;
  coefficient_utilise: CoefficientTravail | null;
  est_termine: boolean;
}

// --- INTERFACE DETAILS EQUIPEMENT (pour les stats opérateur) ---
export interface DetailsEquipement {
  equipement_id: string;
  code_faratec: string;
  temps_operateur_jours: number;
  temps_total_equipement_jours: number;
  efficacite_equipement: number;
}

// --- INTERFACE STATS OPERATEUR ---
export interface StatsOperateur {
  operateur_id: string;
  operateur_nom: string;
  nb_equipements: number;
  temps_reel_jours: number;
  temps_attendu_jours: number;
  efficacite: number;
  nb_sur_duree: number;
  a_assez_de_donnees: boolean;
  details_equipements: DetailsEquipement[];
}

export const SEUIL_MIN_EQUIPEMENTS = 3;

// --- UTILITAIRE : Un équipement est-il terminé ? ---
export function isEquipementTermine(eq: EquipementAnalyse): boolean {
  const pct = eq.pourcentage_global ?? 0;
  return pct >= 100 && (eq.statut === "termine" || eq.statut === "livre");
}

// --- TRADUCTION nature_travaux -> type_travail interne ---
export function mapperNatureVersType(nature: string | null): string {
  if (!nature) return "revision";
  const n = nature.toLowerCase();
  if (n.includes("rebobinage") || n.includes("bobinage")) return "rebobinage";
  if (n.includes("mecanique") || n.includes("mécanique")) return "mecanique";
  if (n.includes("equilibrage") || n.includes("équilibrage")) return "equilibrage";
  if (n.includes("peinture")) return "peinture";
  if (n.includes("revision") || n.includes("révision")) return "revision";
  return "revision";
}

// --- TROUVER LE COEFFICIENT ---
export function getCoefficient(
  coefficients: CoefficientTravail[],
  nature_travaux: string | null,
  puissance_kw: number | null
): CoefficientTravail | null {
  const typeTravail = mapperNatureVersType(nature_travaux);
  const puissance = puissance_kw || 0;

  return coefficients.find(
    (c) =>
      c.type_travail === typeTravail &&
      puissance >= Number(c.puissance_min) &&
      puissance < Number(c.puissance_max)
  ) || null;
}

// --- TRANCHES DE PUISSANCE ---
export function getTranchePuissance(puissance_kw: number | null): string {
  const p = puissance_kw || 0;
  if (p < 5) return "0-5 kW";
  if (p < 30) return "5-30 kW";
  if (p < 75) return "30-75 kW";
  if (p < 150) return "75-150 kW";
  return "150+ kW";
}

// --- CALCUL DE L'ANALYSE D'UN ÉQUIPEMENT ---
export function analyserEquipement(
  equipement: EquipementAnalyse,
  sessionsEquipement: SessionAnalyse[],
  coefficients: CoefficientTravail[]
): AnalyseResult {
  const coefficient = getCoefficient(coefficients, equipement.nature_travaux, equipement.puissance_kw);
  const tempsAttenduJours = coefficient ? Number(coefficient.temps_attendu_jours) : 0;

  let tempsReelMinutes = 0;
  sessionsEquipement.forEach((s) => {
    tempsReelMinutes += calculerTempsTravail(s.started_at, s.ended_at);
  });
  const tempsReelJours = tempsReelMinutes / (8 * 60);

  const progression = (equipement.pourcentage_global ?? 0) / 100;
  const estTermine = isEquipementTermine(equipement);

  let efficacite = 0;
  if (estTermine && tempsReelJours > 0 && tempsAttenduJours > 0) {
    efficacite = Math.round((tempsAttenduJours / tempsReelJours) * 100);
  }

  const tempsAttenduPartiel = tempsAttenduJours * progression;
  const depassement = tempsAttenduPartiel > 0
    ? Math.round(((tempsReelJours - tempsAttenduPartiel) / tempsAttenduPartiel) * 100)
    : 0;

  const tolerance = coefficient ? Number(coefficient.tolerance_pourcentage) : 20;
  const estSurDuree = tempsAttenduPartiel > 0 && tempsReelJours > tempsAttenduPartiel * (1 + tolerance / 100);

  return {
    temps_attendu_jours: Math.round(tempsAttenduJours * 10) / 10,
    temps_reel_jours: Math.round(tempsReelJours * 10) / 10,
    progression: Math.round(progression * 100),
    efficacite,
    depassement_pourcentage: depassement,
    est_sur_duree: estSurDuree,
    coefficient_utilise: coefficient,
    est_termine: estTermine,
  };
}

// =========================================================
// STATS PAR OPÉRATEUR
// =========================================================
export function calculerStatsParOperateur(
  sessions: SessionAnalyse[],
  equipementsMap: Map<string, EquipementAnalyse>,
  coefficients: CoefficientTravail[],
  operateursMap: Map<string, string>
): StatsOperateur[] {
  // 1. Filtrer sessions sur équipements terminés
  const sessionsTerminees = sessions.filter((s) => {
    const eq = equipementsMap.get(s.equipement_id);
    return eq && isEquipementTermine(eq);
  });

  // 2. Efficacité par équipement
  const efficaciteParEquipement = new Map<string, { efficacite: number; tempsTotalJours: number }>();
  const equipementsTermines = new Set(sessionsTerminees.map((s) => s.equipement_id));
  equipementsTermines.forEach((eqId) => {
    const eq = equipementsMap.get(eqId);
    if (!eq) return;
    const sessEq = sessionsTerminees.filter((s) => s.equipement_id === eqId);
    const analyse = analyserEquipement(eq, sessEq, coefficients);
    efficaciteParEquipement.set(eqId, {
      efficacite: analyse.efficacite,
      tempsTotalJours: analyse.temps_reel_jours,
    });
  });

  // 3. Regrouper par opérateur
  const parOperateur = new Map<string, {
    equipementsContribues: Map<string, number>;
    tempsReelJours: number;
  }>();

  sessionsTerminees.forEach((s) => {
    const opId = s.operateur_id;
    if (!parOperateur.has(opId)) {
      parOperateur.set(opId, {
        equipementsContribues: new Map(),
        tempsReelJours: 0,
      });
    }
    const entry = parOperateur.get(opId)!;
    const tempsMin = calculerTempsTravail(s.started_at, s.ended_at);
    const tempsJours = tempsMin / (8 * 60);
    entry.tempsReelJours += tempsJours;
    entry.equipementsContribues.set(
      s.equipement_id,
      (entry.equipementsContribues.get(s.equipement_id) || 0) + tempsJours
    );
  });

  // 4. Calculer l'efficacité pondérée
  const results: StatsOperateur[] = [];
  parOperateur.forEach((data, opId) => {
    const nbEq = data.equipementsContribues.size;
    const aAssez = nbEq >= SEUIL_MIN_EQUIPEMENTS;

    let sommeEfficacitePonderee = 0;
    let sommePoids = 0;
    const details: DetailsEquipement[] = [];

    data.equipementsContribues.forEach((tempsOperateurJours, eqId) => {
      const eqInfo = efficaciteParEquipement.get(eqId);
      if (!eqInfo || eqInfo.tempsTotalJours <= 0) return;

      const poids = tempsOperateurJours / eqInfo.tempsTotalJours;
      sommeEfficacitePonderee += eqInfo.efficacite * poids;
      sommePoids += poids;

      const eq = equipementsMap.get(eqId);
      details.push({
        equipement_id: eqId,
        code_faratec: eq?.code_faratec || "—",
        temps_operateur_jours: Math.round(tempsOperateurJours * 10) / 10,
        temps_total_equipement_jours: Math.round(eqInfo.tempsTotalJours * 10) / 10,
        efficacite_equipement: eqInfo.efficacite,
      });
    });

    const efficacite = aAssez && sommePoids > 0
      ? Math.round(sommeEfficacitePonderee / sommePoids)
      : 0;

    const tempsAttenduJours = data.tempsReelJours * (efficacite / 100);

    results.push({
      operateur_id: opId,
      operateur_nom: operateursMap.get(opId) || "Inconnu",
      nb_equipements: nbEq,
      temps_reel_jours: Math.round(data.tempsReelJours * 10) / 10,
      temps_attendu_jours: Math.round(tempsAttenduJours * 10) / 10,
      efficacite,
      nb_sur_duree: 0,
      a_assez_de_donnees: aAssez,
      details_equipements: details.sort((a, b) => b.temps_operateur_jours - a.temps_operateur_jours),
    });
  });

  return results.sort((a, b) => {
    if (a.a_assez_de_donnees && !b.a_assez_de_donnees) return -1;
    if (!a.a_assez_de_donnees && b.a_assez_de_donnees) return 1;
    return b.efficacite - a.efficacite;
  });
}

// =========================================================
// STATS PAR TRANCHE DE PUISSANCE
// =========================================================
export interface StatsTranche {
  tranche: string;
  nb_equipements: number;
  temps_attendu_total: number;
  temps_reel_total: number;
  efficacite: number;
}

export function calculerStatsParTranche(
  equipements: EquipementAnalyse[],
  sessionsByEquipement: Map<string, SessionAnalyse[]>,
  coefficients: CoefficientTravail[]
): StatsTranche[] {
  const tranches = ["0-5 kW", "5-30 kW", "30-75 kW", "75-150 kW", "150+ kW"];
  const map = new Map<string, { nb_eq: number; temps_attendu: number; temps_reel: number }>();

  tranches.forEach((t) => map.set(t, { nb_eq: 0, temps_attendu: 0, temps_reel: 0 }));

  equipements.filter((e) => isEquipementTermine(e)).forEach((e) => {
    const tranche = getTranchePuissance(e.puissance_kw);
    const entry = map.get(tranche);
    if (!entry) return;

    entry.nb_eq += 1;
    const coef = getCoefficient(coefficients, e.nature_travaux, e.puissance_kw);
    if (coef) entry.temps_attendu += Number(coef.temps_attendu_jours);

    const sessions = sessionsByEquipement.get(e.id) || [];
    let minutes = 0;
    sessions.forEach((s) => { minutes += calculerTempsTravail(s.started_at, s.ended_at); });
    entry.temps_reel += minutes / (8 * 60);
  });

  return tranches.map((t) => {
    const data = map.get(t)!;
    const efficacite = data.temps_reel > 0 && data.temps_attendu > 0
      ? Math.round((data.temps_attendu / data.temps_reel) * 100)
      : 0;
    return {
      tranche: t,
      nb_equipements: data.nb_eq,
      temps_attendu_total: Math.round(data.temps_attendu * 10) / 10,
      temps_reel_total: Math.round(data.temps_reel * 10) / 10,
      efficacite,
    };
  });
}

// =========================================================
// COULEUR D'EFFICACITÉ
// =========================================================
export function getEfficaciteColor(efficacite: number): { bg: string; text: string; label: string } {
  if (efficacite >= 120) return { bg: "bg-emerald-100", text: "text-emerald-700", label: "Excellent" };
  if (efficacite >= 100) return { bg: "bg-green-100", text: "text-green-700", label: "Bon" };
  if (efficacite >= 80) return { bg: "bg-amber-100", text: "text-amber-700", label: "Correct" };
  if (efficacite >= 50) return { bg: "bg-orange-100", text: "text-orange-700", label: "Lent" };
  if (efficacite > 0) return { bg: "bg-red-100", text: "text-red-700", label: "Problème" };
  return { bg: "bg-slate-100", text: "text-slate-500", label: "Insuffisant" };
}