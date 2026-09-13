// =========================================================
// MODULE OPTIMIZATION - Analyse des performances
// Basé sur les coefficients officiels (IEEE 1068, normes russes)
// =========================================================

import { calculerTempsTravail } from "./workTime";

// --- TYPES ---
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
// Efficacité = (progression × temps_attendu) / temps_réel × 100
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

  // Efficacité seulement si terminé
  let efficacite = 0;
  if (estTermine && tempsReelJours > 0 && tempsAttenduJours > 0) {
    efficacite = Math.round((tempsAttenduJours / tempsReelJours) * 100);
  }

  // Dépassement basé sur le temps attendu × progression
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

// --- STATS PAR OPÉRATEUR ---
// Ne compte QUE les équipements terminés (min 3)
export interface StatsOperateur {
  operateur_id: string;
  operateur_nom: string;
  nb_equipements: number;
  temps_reel_jours: number;
  temps_attendu_jours: number;
  efficacite: number;
  nb_sur_duree: number;
  a_assez_de_donnees: boolean;
}

export const SEUIL_MIN_EQUIPEMENTS = 3;

export function calculerStatsParOperateur(
  sessions: SessionAnalyse[],
  equipementsMap: Map<string, EquipementAnalyse>,
  coefficients: CoefficientTravail[],
  operateursMap: Map<string, string>
): StatsOperateur[] {
  // 1. Filtrer uniquement les sessions sur équipements TERMINÉS
  const sessionsTerminees = sessions.filter((s) => {
    const eq = equipementsMap.get(s.equipement_id);
    return eq && isEquipementTermine(eq);
  });

  // 2. Grouper par opérateur
  const parOperateur = new Map<string, {
    equipementsTouches: Set<string>;
    tempsReelMinutes: number;
    tempsAttenduTotal: number;
    nbSurDuree: number;
  }>();

  sessionsTerminees.forEach((s) => {
    const opId = s.operateur_id;
    if (!parOperateur.has(opId)) {
      parOperateur.set(opId, {
        equipementsTouches: new Set(),
        tempsReelMinutes: 0,
        tempsAttenduTotal: 0,
        nbSurDuree: 0,
      });
    }
    const entry = parOperateur.get(opId)!;
    entry.tempsReelMinutes += calculerTempsTravail(s.started_at, s.ended_at);

    if (!entry.equipementsTouches.has(s.equipement_id)) {
      entry.equipementsTouches.add(s.equipement_id);
      const eq = equipementsMap.get(s.equipement_id);
      if (eq) {
        const coef = getCoefficient(coefficients, eq.nature_travaux, eq.puissance_kw);
        if (coef) {
          entry.tempsAttenduTotal += Number(coef.temps_attendu_jours);
        }
      }
    }
  });

  // 3. Calculer l'efficacité
  const results: StatsOperateur[] = [];
  parOperateur.forEach((data, opId) => {
    const tempsReelJours = data.tempsReelMinutes / (8 * 60);
    const nbEq = data.equipementsTouches.size;
    const aAssez = nbEq >= SEUIL_MIN_EQUIPEMENTS;

    const efficacite = aAssez && tempsReelJours > 0 && data.tempsAttenduTotal > 0
      ? Math.round((data.tempsAttenduTotal / tempsReelJours) * 100)
      : 0;

    results.push({
      operateur_id: opId,
      operateur_nom: operateursMap.get(opId) || "Inconnu",
      nb_equipements: nbEq,
      temps_reel_jours: Math.round(tempsReelJours * 10) / 10,
      temps_attendu_jours: Math.round(data.tempsAttenduTotal * 10) / 10,
      efficacite,
      nb_sur_duree: data.nbSurDuree,
      a_assez_de_donnees: aAssez,
    });
  });

  // Trier : ceux avec assez de données d'abord, puis par efficacité
  return results.sort((a, b) => {
    if (a.a_assez_de_donnees && !b.a_assez_de_donnees) return -1;
    if (!a.a_assez_de_donnees && b.a_assez_de_donnees) return 1;
    return b.efficacite - a.efficacite;
  });
}

// --- STATS PAR TRANCHE DE PUISSANCE ---
// Uniquement équipements terminés
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

  // On ne compte QUE les équipements terminés
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

// --- COULEUR D'EFFICACITÉ ---
export function getEfficaciteColor(efficacite: number): { bg: string; text: string; label: string } {
  if (efficacite >= 120) return { bg: "bg-emerald-100", text: "text-emerald-700", label: "Excellent" };
  if (efficacite >= 100) return { bg: "bg-green-100", text: "text-green-700", label: "Bon" };
  if (efficacite >= 80) return { bg: "bg-amber-100", text: "text-amber-700", label: "Correct" };
  if (efficacite >= 50) return { bg: "bg-orange-100", text: "text-orange-700", label: "Lent" };
  if (efficacite > 0) return { bg: "bg-red-100", text: "text-red-700", label: "Problème" };
  return { bg: "bg-slate-100", text: "text-slate-500", label: "Insuffisant" };
}