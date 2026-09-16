import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  AlertTriangle, Target, Users, Factory,
  Activity, Zap, Info,
  Loader2, AlertOctagon, CheckCircle2, Gauge
} from "lucide-react";
import {
  analyserEquipement,
  calculerStatsParOperateur,
  calculerStatsParTranche,
  getEfficaciteColor,
  getTranchePuissance,
  isEquipementTermine,
  SEUIL_MIN_EQUIPEMENTS,
  type CoefficientTravail,
  type EquipementAnalyse,
  type SessionAnalyse,
} from "../lib/optimization";
import { calculerTempsTravail, formatDureeMinutes, formatJoursEnHeures } from "../lib/workTime";

interface Operateur { id: string; full_name: string; }
interface Atelier { id: string; name: string; }

type PeriodType = "semaine" | "mois" | "annee" | "tout";

export default function OptimisationPage() {
  const [loading, setLoading] = useState(true);
  const [equipements, setEquipements] = useState<EquipementAnalyse[]>([]);
  const [sessions, setSessions] = useState<SessionAnalyse[]>([]);
  const [coefficients, setCoefficients] = useState<CoefficientTravail[]>([]);
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [period, setPeriod] = useState<PeriodType>("mois");

  const load = async () => {
    setLoading(true);
    const [eqRes, sessRes, coefRes, opRes, atRes] = await Promise.all([
      supabase.from("equipements")
        .select("id, code_faratec, client_name, type_equipement, puissance_kw, nature_travaux, created_at, date_debut_intervention, date_fin_intervention, statut, pourcentage_global")
        .is("deleted_at", null),
      supabase.from("interventions_operateurs")
        .select("id, equipement_id, operateur_id, atelier_id, started_at, ended_at"),
      supabase.from("coefficients_travaux")
        .select("id, type_travail, puissance_min, puissance_max, temps_attendu_jours, tolerance_pourcentage"),
      supabase.from("operateurs").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("ateliers").select("id, name").order("name"),
    ]);
    setEquipements((eqRes.data as EquipementAnalyse[]) || []);
    setSessions((sessRes.data as SessionAnalyse[]) || []);
    setCoefficients((coefRes.data as CoefficientTravail[]) || []);
    setOperateurs((opRes.data as Operateur[]) || []);
    setAteliers((atRes.data as Atelier[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const periodBounds = useMemo(() => {
    const now = new Date();
    if (period === "tout") return { start: new Date("1970-01-01"), end: new Date("2100-01-01"), label: "Tout l'historique" };

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

  const sessionsInPeriod = useMemo(() => {
    return sessions.filter((s) => {
      const d = new Date(s.started_at);
      return d >= periodBounds.start && d <= periodBounds.end;
    });
  }, [sessions, periodBounds]);

  const equipementsInPeriod = useMemo(() => {
    return equipements.filter((e) => {
      const d = new Date(e.created_at);
      return d >= periodBounds.start && d <= periodBounds.end;
    });
  }, [equipements, periodBounds]);

  const operateursMap = useMemo(() => {
    const m = new Map<string, string>();
    operateurs.forEach((o) => m.set(o.id, o.full_name));
    return m;
  }, [operateurs]);

  const equipementsMap = useMemo(() => {
    const m = new Map<string, EquipementAnalyse>();
    equipements.forEach((e) => m.set(e.id, e));
    return m;
  }, [equipements]);

  const sessionsByEquipement = useMemo(() => {
    const m = new Map<string, SessionAnalyse[]>();
    sessions.forEach((s) => {
      if (!m.has(s.equipement_id)) m.set(s.equipement_id, []);
      m.get(s.equipement_id)!.push(s);
    });
    return m;
  }, [sessions]);

  const sessionsInPeriodByEquipement = useMemo(() => {
    const m = new Map<string, SessionAnalyse[]>();
    sessionsInPeriod.forEach((s) => {
      if (!m.has(s.equipement_id)) m.set(s.equipement_id, []);
      m.get(s.equipement_id)!.push(s);
    });
    return m;
  }, [sessionsInPeriod]);

  const equipementsSurDuree = useMemo(() => {
    return equipementsInPeriod
      .map((eq) => {
        const sess = sessionsByEquipement.get(eq.id) || [];
        const analyse = analyserEquipement(eq, sess, coefficients);
        return { eq, analyse };
      })
      .filter((x) => x.analyse.est_sur_duree && x.analyse.temps_reel_jours > 0)
      .sort((a, b) => b.analyse.depassement_pourcentage - a.analyse.depassement_pourcentage);
  }, [equipementsInPeriod, sessionsByEquipement, coefficients]);

  const statsOperateurs = useMemo(() => {
    return calculerStatsParOperateur(sessionsInPeriod, equipementsMap, coefficients, operateursMap);
  }, [sessionsInPeriod, equipementsMap, coefficients, operateursMap]);

  const statsAteliers = useMemo(() => {
    return ateliers.map((a) => {
      const sessAtelier = sessionsInPeriod.filter((s) => s.atelier_id === a.id);
      return {
        atelier: a,
        nb_sessions: sessAtelier.length,
        temps_total_min: sessAtelier.reduce((sum, s) => sum + calculerTempsTravail(s.started_at, s.ended_at), 0),
      };
    }).filter((x) => x.nb_sessions > 0).sort((a, b) => b.temps_total_min - a.temps_total_min);
  }, [ateliers, sessionsInPeriod]);

  const statsTranches = useMemo(() => {
    return calculerStatsParTranche(equipementsInPeriod, sessionsInPeriodByEquipement, coefficients);
  }, [equipementsInPeriod, sessionsInPeriodByEquipement, coefficients]);

  const kpis = useMemo(() => {
    const analyses = equipementsInPeriod
      .filter((eq) => isEquipementTermine(eq))
      .map((eq) => {
        const sess = sessionsByEquipement.get(eq.id) || [];
        const analyse = analyserEquipement(eq, sess, coefficients);
        return { eq, analyse };
      })
      .filter((x) => x.analyse.temps_reel_jours > 0 && x.analyse.efficacite > 0);

    const efficaciteMoyenne = analyses.length > 0
      ? Math.round(analyses.reduce((sum, x) => sum + x.analyse.efficacite, 0) / analyses.length)
      : 0;

    const totalTermines = equipementsInPeriod.filter(isEquipementTermine).length;
    const totalEnCours = equipementsInPeriod.filter((e) => !isEquipementTermine(e)).length;

    return { efficaciteMoyenne, totalTermines, totalEnCours, totalAnalyses: analyses.length };
  }, [equipementsInPeriod, sessionsByEquipement, coefficients]);

  const periodTabs: { key: PeriodType; label: string }[] = [
    { key: "semaine", label: "Cette semaine" },
    { key: "mois", label: "Ce mois" },
    { key: "annee", label: "Cette année" },
    { key: "tout", label: "Tout" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-amber-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Gauge size={20} className="text-amber-600" />
            Zone Optimisation
          </h1>
          <p className="text-sm text-slate-500">
            Analyse des performances — {periodBounds.label}
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          <strong>Note :</strong> Tous les temps sont affichés en <strong>heures</strong> (base 8h/jour). Le classement des opérateurs se base uniquement sur les équipements <strong>terminés</strong> (min {SEUIL_MIN_EQUIPEMENTS}).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {periodTabs.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`text-xs font-medium rounded-lg px-3 py-2 transition ${
              period === p.key ? "bg-amber-500 text-neutral-900 shadow-sm" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emerald-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <Target size={10} /> Efficacité (terminés)
          </p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold text-slate-800">
              {kpis.totalAnalyses > 0 ? `${kpis.efficaciteMoyenne}%` : "—"}
            </p>
            {kpis.totalAnalyses > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${getEfficaciteColor(kpis.efficaciteMoyenne).bg} ${getEfficaciteColor(kpis.efficaciteMoyenne).text}`}>
                {getEfficaciteColor(kpis.efficaciteMoyenne).label}
              </span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <AlertTriangle size={10} /> Sur-durées
          </p>
          <p className="text-2xl font-bold text-slate-800">{equipementsSurDuree.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <CheckCircle2 size={10} /> Terminés
          </p>
          <p className="text-2xl font-bold text-slate-800">{kpis.totalTermines}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <Activity size={10} /> En cours
          </p>
          <p className="text-2xl font-bold text-slate-800">{kpis.totalEnCours}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-red-500">
        <div className="p-4 border-b border-slate-100 bg-red-50/50">
          <h2 className="font-semibold text-red-800 text-sm flex items-center gap-2">
            <AlertOctagon size={16} />
            Détection des sur-durées ({equipementsSurDuree.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Équipements dont le temps réel dépasse le temps attendu (+tolérance)
          </p>
        </div>

        {equipementsSurDuree.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 size={32} className="mx-auto text-green-300 mb-2" />
            <p className="text-sm text-slate-500 font-medium">Aucune sur-durée détectée ✅</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {equipementsSurDuree.slice(0, 10).map(({ eq, analyse }) => {
              const tranche = getTranchePuissance(eq.puissance_kw);
              return (
                <div key={eq.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">{eq.code_faratec || "—"}</span>
                      <span className="text-sm text-slate-600">• {eq.client_name}</span>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
                        +{analyse.depassement_pourcentage}%
                      </span>
                      {analyse.est_termine ? (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">TERMINÉ</span>
                      ) : (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">EN COURS</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {eq.type_equipement} {eq.puissance_kw ? `• ${eq.puissance_kw} kW` : ""} {eq.nature_travaux ? `• ${eq.nature_travaux}` : ""}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Tranche : <strong>{tranche}</strong> • Progression : <strong>{analyse.progression}%</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-4 sm:w-72">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 mb-0.5">Attendu</p>
                      <p className="text-sm font-bold text-slate-700">{formatJoursEnHeures(analyse.temps_attendu_jours)}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 mb-0.5">Réel</p>
                      <p className="text-sm font-bold text-red-600">{formatJoursEnHeures(analyse.temps_reel_jours)}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 mb-0.5">Efficacité</p>
                      <p className={`text-sm font-bold ${analyse.efficacite > 0 ? getEfficaciteColor(analyse.efficacite).text : "text-slate-400"}`}>
                        {analyse.efficacite > 0 ? `${analyse.efficacite}%` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
          <h2 className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
            <Users size={16} />
            Classement des opérateurs ({statsOperateurs.filter((o) => o.a_assez_de_donnees).length} classés)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Uniquement sur équipements terminés · Minimum {SEUIL_MIN_EQUIPEMENTS} équipements
          </p>
        </div>

        {statsOperateurs.length === 0 ? (
          <div className="p-8 text-center">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucune donnée sur cette période.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {statsOperateurs.map((op, i) => {
              const color = getEfficaciteColor(op.efficacite);
              const podium = ["bg-amber-500 text-white", "bg-slate-300 text-slate-800", "bg-amber-700 text-white"];
              if (!op.a_assez_de_donnees) {
                return (
                  <div key={op.operateur_id} className="p-4 flex items-center gap-3 bg-slate-50/50">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-slate-100 text-slate-400">
                      —
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-500 truncate">{op.operateur_nom}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {op.nb_equipements} équipement{op.nb_equipements > 1 ? "s" : ""} terminé{op.nb_equipements > 1 ? "s" : ""} · insuffisant (min {SEUIL_MIN_EQUIPEMENTS})
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400 italic">Non classé</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={op.operateur_id} className="p-4 flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i < 3 ? podium[i] : "bg-slate-100 text-slate-600"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{op.operateur_nom}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {op.nb_equipements} équipement{op.nb_equipements > 1 ? "s" : ""} · {formatJoursEnHeures(op.temps_reel_jours)} réel
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-bold ${color.text}`}>{op.efficacite}%</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>
                      {color.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
          <h2 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
            <Zap size={16} />
            Analyse par tranche de puissance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Uniquement équipements terminés</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="p-3 text-left font-semibold">Tranche</th>
                <th className="p-3 text-center font-semibold">Nb équipements</th>
                <th className="p-3 text-right font-semibold">Temps attendu</th>
                <th className="p-3 text-right font-semibold">Temps réel</th>
                <th className="p-3 text-right font-semibold">Efficacité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statsTranches.map((t) => {
                const color = getEfficaciteColor(t.efficacite);
                return (
                  <tr key={t.tranche} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-700">{t.tranche}</td>
                    <td className="p-3 text-center text-slate-600">{t.nb_equipements}</td>
                    <td className="p-3 text-right text-slate-600">{formatJoursEnHeures(t.temps_attendu_total)}</td>
                    <td className="p-3 text-right text-slate-600">{formatJoursEnHeures(t.temps_reel_total)}</td>
                    <td className="p-3 text-right">
                      {t.nb_equipements > 0 && t.temps_reel_total > 0 ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>
                          {t.efficacite}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-white">
          <h2 className="font-semibold text-purple-800 text-sm flex items-center gap-2">
            <Factory size={16} />
            Temps passé par atelier
          </h2>
        </div>

        {statsAteliers.length === 0 ? (
          <div className="p-8 text-center">
            <Factory size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucune donnée sur cette période.</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {statsAteliers.map((s) => {
              const maxMin = Math.max(...statsAteliers.map((x) => x.temps_total_min), 1);
              return (
                <div key={s.atelier.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">{s.atelier.name}</span>
                    <span className="font-bold text-slate-800">{formatDureeMinutes(s.temps_total_min)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${(s.temps_total_min / maxMin) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">{s.nb_sessions} session{s.nb_sessions > 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {kpis.totalAnalyses === 0 && (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <Gauge size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Pas assez de données pour l'analyse.</p>
          <p className="text-xs text-slate-400 mt-1">
            Terminez au moins {SEUIL_MIN_EQUIPEMENTS} équipements avec des sessions opérateurs pour voir le classement.
          </p>
        </div>
      )}
    </div>
  );
}