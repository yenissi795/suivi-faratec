// =========================================================
// MODULE WORK TIME - Calcul du temps de travail effectif
// =========================================================

export const HORAIRES_PAR_JOUR: Record<number, { debut: number; fin: number }[]> = {
  0: [],
  1: [
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  2: [
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  3: [
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  4: [
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  5: [
    { debut: 8 * 60, fin: 13 * 60 },
    { debut: 14 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  6: [
    { debut: 8 * 60, fin: 12 * 60 },
  ],
};

export const SEUIL_ORPHELINE_HEURES = 8;

/**
 * Calcule le temps de travail effectif en MINUTES entre 2 dates.
 */
export function calculerTempsTravail(startIso: string, endIso: string | null): number {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  if (end <= start) return 0;

  let totalMinutes = 0;
  let current = new Date(start);
  current.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);

  while (current <= endDay) {
    const dayOfWeek = current.getDay();
    const plages = HORAIRES_PAR_JOUR[dayOfWeek] || [];

    plages.forEach(({ debut, fin }) => {
      const plageDebut = new Date(current);
      plageDebut.setHours(Math.floor(debut / 60), debut % 60, 0, 0);

      const plageFin = new Date(current);
      plageFin.setHours(Math.floor(fin / 60), fin % 60, 0, 0);

      const interStart = new Date(Math.max(start.getTime(), plageDebut.getTime()));
      const interEnd = new Date(Math.min(end.getTime(), plageFin.getTime()));

      if (interEnd > interStart) {
        totalMinutes += (interEnd.getTime() - interStart.getTime()) / 60000;
      }
    });

    current.setDate(current.getDate() + 1);
  }

  return Math.round(totalMinutes);
}

// =========================================================
// FORMATS D'AFFICHAGE — TOUT EN HEURES
// =========================================================

/**
 * Format heures principales (ex: "3h", "3h30", "12h", "120h")
 */
export function formatDureeMinutes(minutes: number): string {
  if (minutes < 1) return "0h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

/**
 * Convertit des jours (base 8h/jour) en heures formatées.
 * Ex: 3.5j → "28h"
 */
export function formatJoursEnHeures(jours: number): string {
  const minutes = jours * 8 * 60;
  return formatDureeMinutes(minutes);
}

/**
 * Format court (badges)
 */
export function formatDureeCourte(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function formatDureeMs(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  return formatDureeMinutes(minutes);
}

export function getSessionTempsTravail(session: { started_at: string; ended_at: string | null }): number {
  return calculerTempsTravail(session.started_at, session.ended_at);
}

/**
 * Format pour l'affichage des jours en heures (délais calendaires)
 */
export function formatDelaiEnHeures(jours: number): string {
  const minutes = jours * 8 * 60;
  return formatDureeMinutes(minutes);
}