import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Users, Clock, Award, Timer, Calendar, Loader2, Info, Package } from "lucide-react";
import { calculerStatsParOperateur, getEfficaciteColor, SEUIL_MIN_EQUIPEMENTS } from "../lib/optimization";
import { calculerTempsTravail } from "../lib/workTime";

interface Operateur { id: string; full_name: string; is_active: boolean; }

interface Session {
  id: string;
  equipement_id: string;
  operateur_id: string;
  atelier_id: string | null;
  started_at: string;
  ended_at: string | null;
  equipements: { code_faratec: string | null; client_name: string } | null;
  ateliers: { name: string } | null;
}

interface Equipement {
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

interface Coefficient {
  id: string;
  type_travail: string;
  puissance_min: number;
  puissance_max: number;
  temps_attendu_jours: number;
  tolerance_pourcentage: number;
}

type PeriodType = "jour" | "semaine" | "mois" | "annee" | "tout";

export default function TempsOperateursPage() {
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [coefficients, setCoefficients] = useState<Coefficient[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("mois");
  const [selectedOperateurId, setSelectedOperateurId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [opRes, sessRes, eqRes, coefRes] = await Promise.all([
      supabase.from("operateurs").select("id, full_name, is_active").order("full_name"),
      supabase.from("interventions_operateurs")
        .select("id, equipement_id, operateur_id, atelier_id, started_at, ended_at, equipements(code_faratec, client_name), ateliers(name)")
        .order("started_at", { ascending: false })
        .limit(2000),
      supabase.from("equipements")
        .select("id, code_faratec, client_name, type_equipement, puissance_kw, nature_travaux, created_at, date_debut_intervention, date_fin_intervention, statut, pourcentage_global")
        .is("deleted_at", null),
      supabase.from("coefficients_travaux")
        .select("id, type_travail, puissance_min, puissance_max, temps_attendu_jours, tolerance_pourcentage"),
    ]);
    setOperateurs((opRes.data as Operateur[]) || []);
    setSessions((sessRes.data as unknown as Session[]) || []);
    setEquipements((eqRes.data as Equipement[]) || []);
    setCoefficients((coefRes.data as Coefficient[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // --- BORNES DE PÉRIODE ---
  const periodBounds = useMemo(() => {
    const now = new Date();
    if (period === "tout") return { start: new Date("1970-01-01"), end: new Date("2100-01-01"), label: "Tout l'historique" };

    if (period === "jour") {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      return { start, end, label: "Aujourd'hui" };
    }

    if (period === "semaine") {
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday, label: "Cette semaine" };
    }

    if (period === "mois") {
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        label: "Ce mois"
      };
    }

    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
      label: "Cette année"
    };
  }, [period]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const d = new Date(s.started_at);
      return d >= periodBounds.start && d <= periodBounds.end;
    });
  }, [sessions, periodBounds]);

  const operateursMap = useMemo(() => {
    const m = new Map<string, string>();
    operateurs.forEach((o) => m.set(o.id, o.full_name));
    return m;
  }, [operateurs]);

  const equipementsMap = useMemo(() => {
    const m = new Map<string, any>();
    equipements.forEach((e) => m.set(e.id, e));
    return m;
  }, [equipements]);

  const statsAvecEfficacite = useMemo(() => {
    return calculerStatsParOperateur(filteredSessions, equipementsMap, coefficients, operateursMap);
  }, [filteredSessions, equipementsMap, coefficients, operateursMap]);

  // --- STATS DÉTAILLÉES PAR OPÉRATEUR (nb équipements distincts + nb sessions) ---
  const statsDetaillees = useMemo(() => {
    const parOperateur = new Map<string, {
      equipementsDistincts: Set<string>;
      nbSessions: number;
      tempsTotalMin: number;
      equipementsDetails: Map<string, { code: string; client: string; sessions: number; tempsMin: number }>;
    }>();

    filteredSessions.forEach((s) => {
      const opId = s.operateur_id;
      if (!parOperateur.has(opId)) {
        parOperateur.set(opId, {
          equipementsDistincts: new Set(),
          nbSessions: 0,
          tempsTotalMin: 0,
          equipementsDetails: new Map(),
        });
      }
      const entry = parOperateur.get(opId)!;
      entry.nbSessions += 1;
      entry.equipementsDistincts.add(s.equipement_id);

      const minutes = calculerTempsTravail(s.started_at, s.ended_at);
      entry.tempsTotalMin += minutes;

      // Détails par équipement
      if (!entry.equipementsDetails.has(s.equipement_id)) {
        entry.equipementsDetails.set(s.equipement_id, {
          code: s.equipements?.code_faratec || "—",
          client: s.equipements?.client_name || "—",
          sessions: 0,
          tempsMin: 0,
        });
      }
      const eqEntry = entry.equipementsDetails.get(s.equipement_id)!;
      eqEntry.sessions += 1;
      eqEntry.tempsMin += minutes;
    });

    return Array.from(parOperateur.entries()).map(([opId, data]) => ({
      operateur_id: opId,
      operateur_nom: operateursMap.get(opId) || "Inconnu",
      nb_equipements_distincts: data.equipementsDistincts.size,
      nb_sessions: data.nbSessions,
      temps_total_min: data.tempsTotalMin,
      equipements_details: Array.from(data.equipementsDetails.entries()).map(([eqId, eq]) => ({
        equipement_id: eqId,
        ...eq,
      })),
    })).sort((a, b) => b.nb_equipements_distincts - a.nb_equipements_distincts);
  }, [filteredSessions, operateursMap]);

  const sessionsDuSelected = useMemo(() => {
    if (!selectedOperateurId) return [];
    return filteredSessions.filter((s) => s.operateur_id === selectedOperateurId);
  }, [selectedOperateurId, filteredSessions]);

  const statsDetailleesSelected = useMemo(() => {
    if (!selectedOperateurId) return null;
    return statsDetaillees.find((s) => s.operateur_id === selectedOperateurId);
  }, [selectedOperateurId, statsDetaillees]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const periodTabs: { key: PeriodType; label: string }[] = [
    { key: "jour", label: "Aujourd'hui" },
    { key: "semaine", label: "Cette semaine" },
    { key: "mois", label: "Ce mois" },
    { key: "annee", label: "Cette année" },
    { key: "tout", label: "Tout" },
  ];

  const statsGlobales = useMemo(() => {
    const totalMin = filteredSessions.reduce((sum, s) => sum + calculerTempsTravail(s.started_at, s.ended_at), 0);
    const totalSessions = filteredSessions.length;
    const operateursActifs = new Set(filteredSessions.map((s) => s.operateur_id)).size;
    // Nombre total d'équipements distincts touchés par TOUS les opérateurs
    const tousEquipementsDistincts = new Set(filteredSessions.map((s) => s.equipement_id)).size;
    const best = statsAvecEfficacite.find((s) => s.a_assez_de_donnees);
    return { totalMin, totalSessions, operateursActifs, tousEquipementsDistincts, best };
  }, [filteredSessions, statsAvecEfficacite]);

  const formatDureeMin = (min: number): string => {
    if (min < 60) return `${Math.round(min)}min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h > 24) {
      const j = Math.floor(h / 24);
      const reste = h % 24;
      return `${j}j ${reste}h`;
    }
    return `${h}h${m.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-amber-600" />
            Temps des opérateurs
          </h1>
          <p className="text-sm text-slate-500">Suivi du temps passé et des équipements touchés par opérateur.</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          <strong>Note :</strong> Le nombre d'équipements affiché correspond aux équipements <strong>distincts</strong> touchés (si un opérateur travaille 3 fois sur le même équipement, il compte pour 1). L'efficacité n'est calculée que sur les équipements terminés (min {SEUIL_MIN_EQUIPEMENTS}).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {periodTabs.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 transition ${
              period === p.key ? "bg-amber-500 text-neutral-900 shadow-sm" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            <Calendar size={14} />
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-amber-500" size={24} />
        </div>
      ) : (
        <>
          {/* KPIs GLOBAUX */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Timer size={10} /> Temps total
              </p>
              <p className="text-2xl font-bold text-slate-800">{formatDureeMin(statsGlobales.totalMin)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Clock size={10} /> Sessions
              </p>
              <p className="text-2xl font-bold text-slate-800">{statsGlobales.totalSessions}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Package size={10} /> Équipements distincts
              </p>
              <p className="text-2xl font-bold text-slate-800">{statsGlobales.tousEquipementsDistincts}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-violet-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Award size={10} /> Top efficacité
              </p>
              <p className="text-sm font-bold text-slate-800 truncate">
                {statsGlobales.best?.operateur_nom || "—"}
              </p>
              <p className="text-[10px] text-emerald-600 font-semibold">
                {statsGlobales.best ? `${statsGlobales.best.efficacite}%` : ""}
              </p>
            </div>
          </div>

          {/* --- CLASSEMENT PAR ÉQUIPEMENTS TOUCHÉS --- */}
          {statsDetaillees.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-white">
                <h2 className="font-semibold text-green-800 text-sm flex items-center gap-2">
                  <Package size={16} />
                  Classement par équipements touchés ({statsDetaillees.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nombre d'équipements <strong>distincts</strong> par opérateur sur la période
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {statsDetaillees.map((s, i) => {
                  const podium = ["bg-amber-500 text-white", "bg-slate-300 text-slate-800", "bg-amber-700 text-white"];
                  const isSelected = selectedOperateurId === s.operateur_id;
                  return (
                    <button
                      key={s.operateur_id}
                      onClick={() => setSelectedOperateurId(isSelected ? "" : s.operateur_id)}
                      className={`w-full p-4 flex items-center gap-3 text-left transition ${
                        isSelected ? "bg-amber-50" : "hover:bg-slate-50/60"
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i < 3 ? podium[i] : "bg-slate-100 text-slate-600"
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.operateur_nom}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {s.nb_sessions} session{s.nb_sessions > 1 ? "s" : ""} · {formatDureeMin(s.temps_total_min)} de travail
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-amber-700">{s.nb_equipements_distincts}</p>
                        <p className="text-[9px] text-slate-500 font-bold uppercase">Équipements</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- CLASSEMENT PAR EFFICACITÉ --- */}
          {statsAvecEfficacite.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
                <h2 className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
                  <Award size={16} />
                  Classement par efficacité
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Basé sur les équipements terminés (min {SEUIL_MIN_EQUIPEMENTS})
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {statsAvecEfficacite.map((s, i) => {
                  const color = getEfficaciteColor(s.efficacite);
                  const podium = ["bg-amber-500 text-white", "bg-slate-300 text-slate-800", "bg-amber-700 text-white"];

                  if (!s.a_assez_de_donnees) {
                    return (
                      <div key={s.operateur_id} className="p-4 flex items-center gap-3 bg-slate-50/50">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-slate-100 text-slate-400">
                          —
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-500 truncate">{s.operateur_nom}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {s.nb_equipements} équipement{s.nb_equipements > 1 ? "s" : ""} terminé{s.nb_equipements > 1 ? "s" : ""} · insuffisant (min {SEUIL_MIN_EQUIPEMENTS})
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-slate-400 italic">Non classé</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={s.operateur_id} className="p-4 flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i < 3 ? podium[i] : "bg-slate-100 text-slate-600"
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.operateur_nom}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {s.nb_equipements} équipement{s.nb_equipements > 1 ? "s" : ""} · {s.temps_reel_jours}j réel / {s.temps_attendu_jours}j attendu
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${color.text}`}>{s.efficacite}%</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>
                          {color.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- DÉTAIL OPÉRATEUR SÉLECTIONNÉ --- */}
          {selectedOperateurId && statsDetailleesSelected && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white">
                <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                  <Package size={16} className="text-amber-600" />
                  Détail — {statsDetailleesSelected.operateur_nom}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {statsDetailleesSelected.nb_equipements_distincts} équipement{statsDetailleesSelected.nb_equipements_distincts > 1 ? "s" : ""} distinct{statsDetailleesSelected.nb_equipements_distincts > 1 ? "s" : ""} · {statsDetailleesSelected.nb_sessions} session{statsDetailleesSelected.nb_sessions > 1 ? "s" : ""} · {formatDureeMin(statsDetailleesSelected.temps_total_min)}
                </p>
              </div>

              {/* Liste des équipements touchés */}
              <div className="divide-y divide-slate-100">
                <div className="p-3 bg-slate-50/50">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Équipements touchés</p>
                </div>
                {statsDetailleesSelected.equipements_details.map((eq) => (
                  <div key={eq.equipement_id} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        <span className="font-bold">{eq.code}</span>
                        <span className="text-slate-500"> · {eq.client}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {eq.sessions} session{eq.sessions > 1 ? "s" : ""} · {formatDureeMin(eq.tempsMin)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sessions détaillées */}
              <div className="border-t border-slate-100">
                <div className="p-3 bg-slate-50/50">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Toutes les sessions</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {sessionsDuSelected.map((s) => {
                    const minutes = calculerTempsTravail(s.started_at, s.ended_at);
                    return (
                      <div key={s.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            <span className="font-bold">{s.equipements?.code_faratec || "—"}</span>
                            <span className="text-slate-500"> · {s.equipements?.client_name}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {s.ateliers?.name || "Atelier non précisé"} · {formatDate(s.started_at)} de {formatTime(s.started_at)}
                            {s.ended_at ? ` à ${formatTime(s.ended_at)}` : " → en cours"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-amber-700">{formatDureeMin(minutes)}</p>
                          {!s.ended_at && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                              EN COURS
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {statsAvecEfficacite.length === 0 && statsDetaillees.length === 0 && (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <Users size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 font-medium">Aucune session enregistrée sur cette période.</p>
              <p className="text-xs text-slate-400 mt-1">
                Les sessions se créent automatiquement quand un opérateur est sélectionné dans une observation.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}