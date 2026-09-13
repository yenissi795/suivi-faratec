// =========================================================
// MODULE WORK TIME - Calcul du temps de travail effectif
// selon les horaires de l'usine FARATEC
// =========================================================

// Plages horaires par jour de la semaine
// 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
// Format : minutes depuis minuit (8h = 480, 12h30 = 750)
export const HORAIRES_PAR_JOUR: Record<number, { debut: number; fin: number }[]> = {
  0: [], // Dimanche : repos
  1: [ // Lundi
    { debut: 8 * 60, fin: 12 * 60 + 30 },      // 8h00 → 12h30
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 }, // 13h30 → 17h30
  ],
  2: [ // Mardi
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  3: [ // Mercredi
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  4: [ // Jeudi
    { debut: 8 * 60, fin: 12 * 60 + 30 },
    { debut: 13 * 60 + 30, fin: 17 * 60 + 30 },
  ],
  5: [ // Vendredi (spécial)
    { debut: 8 * 60, fin: 13 * 60 },             // 8h00 → 13h00
    { debut: 14 * 60 + 30, fin: 17 * 60 + 30 },  // 14h30 → 17h30
  ],
  6: [ // Samedi (spécial)
    { debut: 8 * 60, fin: 12 * 60 },             // 8h00 → 12h00
  ],
};

// Seuil en heures pour considérer une session "orpheline"
export const SEUIL_ORPHELINE_HEURES = 8;

/**
 * Calcule le temps de travail effectif en MINUTES entre 2 dates.
 * Exclut : heures hors travail, pauses, dimanches.
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

/**
 * Formate une durée en minutes au format "Xh YY" ou "Ymin".
 */
export function formatDureeMinutes(minutes: number): string {
  if (minutes < 1) return "0min";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 24) {
    const j = Math.floor(h / 24);
    const reste = h % 24;
    return `${j}j ${reste}h`;
  }
  return `${h}h${m.toString().padStart(2, "0")}`;
}

/**
 * Formate une durée en millisecondes (pour compatibilité).
 */
export function formatDureeMs(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  return formatDureeMinutes(minutes);
}

/**
 * Vérifie si une session est "orpheline" (démarrée depuis plus de X heures).
 * Si oui, retourne la date de fin logique (fin de journée où elle a démarré).
 */
export function getSessionAutoCloseDate(startIso: string, seuilHeures: number = SEUIL_ORPHELINE_HEURES): string | null {
  const start = new Date(startIso);
  const now = new Date();
  const diffHeures = (now.getTime() - start.getTime()) / 3600000;

  if (diffHeures < seuilHeures) return null;

  const dayOfWeek = start.getDay();
  const plages = HORAIRES_PAR_JOUR[dayOfWeek] || [];
  if (plages.length === 0) return null;

  const dernierePlage = plages[plages.length - 1];
  const autoClose = new Date(start);
  autoClose.setHours(Math.floor(dernierePlage.fin / 60), dernierePlage.fin % 60, 0, 0);

  return autoClose.toISOString();
}

/**
 * Calcule le temps de travail en MINUTES pour une session,
 * en tenant compte des horaires d'usine.
 */
export function getSessionTempsTravail(session: { started_at: string; ended_at: string | null }): number {
  return calculerTempsTravail(session.started_at, session.ended_at);
}

/**
 * Utilitaire : formate une durée en minutes en texte court pour affichage.
 */
export function formatDureeCourte(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 24) {
    const j = Math.floor(h / 24);
    const reste = h % 24;
    return `${j}j${reste}h`;
  }
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}