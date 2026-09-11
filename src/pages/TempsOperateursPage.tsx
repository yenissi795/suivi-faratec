import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Users, Clock, Award, TrendingUp, Loader2, Timer, Calendar } from "lucide-react";

interface Operateur {
  id: string;
  full_name: string;
  is_active: boolean;
}

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

type PeriodType = "semaine" | "mois" | "annee" | "tout";

export default function TempsOperateursPage() {
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("mois");
  const [selectedOperateurId, setSelectedOperateurId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [opRes, sessRes] = await Promise.all([
      supabase.from("operateurs").select("id, full_name, is_active").order("full_name"),
      supabase.from("interventions_operateurs")
        .select("id, equipement_id, operateur_id, atelier_id, started_at, ended_at, equipements(code_faratec, client_name), ateliers(name)")
        .order("started_at", { ascending: false })
        .limit(2000),
    ]);
    setOperateurs((opRes.data as Operateur[]) || []);
    setSessions((sessRes.data as unknown as Session[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // --- BORNES DE LA PÉRIODE ---
  const periodBounds = useMemo(() => {
    const now = new Date();
    if (period === "tout") return { start: new Date("1970-01-01"), end: new Date("2100-01-01") };

    if (period === "semaine") {
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday };
    }

    if (period === "mois") {
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    }

    // annee
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    };
  }, [period]);

  // --- FILTRAGE DES SESSIONS ---
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const d = new Date(s.started_at);
      return d >= periodBounds.start && d <= periodBounds.end;
    });
  }, [sessions, periodBounds]);

  // --- CALCUL DU TEMPS PAR OPÉRATEUR ---
  const statsParOperateur = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      isActive: boolean;
      totalMs: number;
      nbSessions: number;
      nbEquipements: Set<string>;
      derniereActivite: string | null;
    }>();

    filteredSessions.forEach((s) => {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      const duration = Math.max(0, end - start);
      const op = operateurs.find((o) => o.id === s.operateur_id);
      if (!op) return;

      if (!map.has(s.operateur_id)) {
        map.set(s.operateur_id, {
          id: s.operateur_id,
          name: op.full_name,
          isActive: op.is_active,
          totalMs: 0,
          nbSessions: 0,
          nbEquipements: new Set(),
          derniereActivite: null,
        });
      }

      const entry = map.get(s.operateur_id)!;
      entry.totalMs += duration;
      entry.nbSessions += 1;
      entry.nbEquipements.add(s.equipement_id);
      if (!entry.derniereActivite || s.started_at > entry.derniereActivite) {
        entry.derniereActivite = s.started_at;
      }
    });

    return Array.from(map.values())
      .map((e) => ({ ...e, nbEquipements: e.nbEquipements.size }))
      .sort((a, b) => b.totalMs - a.totalMs);
  }, [filteredSessions, operateurs]);

  // --- STATS GLOBALES ---
  const statsGlobales = useMemo(() => {
    const totalMs = statsParOperateur.reduce((sum, s) => sum + s.totalMs, 0);
    const totalSessions = filteredSessions.length;
    const operateursActifs = statsParOperateur.filter((s) => s.totalMs > 0).length;
    const meilleurOperateur = statsParOperateur[0];
    return { totalMs, totalSessions, operateursActifs, meilleurOperateur };
  }, [statsParOperateur, filteredSessions]);

  // --- SESSIONS DE L'OPÉRATEUR SÉLECTIONNÉ ---
  const sessionsDuSelected = useMemo(() => {
    if (!selectedOperateurId) return [];
    return filteredSessions.filter((s) => s.operateur_id === selectedOperateurId);
  }, [selectedOperateurId, filteredSessions]);

  const formatDureeMs = (ms: number): string => {
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours === 0) return `${mins}min`;
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}j ${remainingHours}h`;
    }
    return `${hours}h${mins.toString().padStart(2, "0")}`;
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const periodTabs: { key: PeriodType; label: string }[] = [
    { key: "semaine", label: "Cette semaine" },
    { key: "mois", label: "Ce mois" },
    { key: "annee", label: "Cette année" },
    { key: "tout", label: "Tout" },
  ];

  const podiumColors = [
    "bg-amber-500 text-white",
    "bg-slate-300 text-slate-800",
    "bg-amber-700 text-white",
  ];

  return (
    <div className="space-y-6">
      {/* --- EN-TÊTE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-amber-600" />
            Temps des opérateurs
          </h1>
          <p className="text-sm text-slate-500">Suivi du temps passé par opérateur sur les équipements.</p>
        </div>
      </div>

      {/* --- FILTRES PÉRIODE --- */}
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
          {/* --- KPIs GLOBAUX --- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Timer size={10} /> Temps total
              </p>
              <p className="text-2xl font-bold text-slate-800">{formatDureeMs(statsGlobales.totalMs)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Clock size={10} /> Sessions
              </p>
              <p className="text-2xl font-bold text-slate-800">{statsGlobales.totalSessions}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Users size={10} /> Opérateurs actifs
              </p>
              <p className="text-2xl font-bold text-slate-800">{statsGlobales.operateursActifs}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-violet-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Award size={10} /> Top opérateur
              </p>
              <p className="text-sm font-bold text-slate-800 truncate">
                {statsGlobales.meilleurOperateur?.name || "—"}
              </p>
              <p className="text-[10px] text-amber-600 font-semibold">
                {statsGlobales.meilleurOperateur ? formatDureeMs(statsGlobales.meilleurOperateur.totalMs) : ""}
              </p>
            </div>
          </div>

          {/* --- CLASSEMENT --- */}
          {statsParOperateur.length === 0 ? (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <Users size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 font-medium">Aucune session enregistrée sur cette période.</p>
              <p className="text-xs text-slate-400 mt-1">
                Les sessions se créent automatiquement quand un opérateur est sélectionné dans une observation.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-amber-600" />
                  Classement des opérateurs ({statsParOperateur.length})
                </h2>
                {selectedOperateurId && (
                  <button
                    onClick={() => setSelectedOperateurId("")}
                    className="text-xs text-amber-600 hover:underline font-semibold"
                  >
                    Voir tous
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {statsParOperateur.map((s, i) => {
                  const isSelected = selectedOperateurId === s.id;
                  const isActiveSession = sessions.some((ses) => ses.operateur_id === s.id && !ses.ended_at);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedOperateurId(isSelected ? "" : s.id)}
                      className={`w-full p-4 flex items-center gap-3 text-left transition ${
                        isSelected ? "bg-amber-50" : "hover:bg-slate-50/60"
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i < 3 ? podiumColors[i] : "bg-slate-100 text-slate-600"
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 text-sm truncate">{s.name}</span>
                          {isActiveSession && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                              ACTIF
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {s.nbSessions} session{s.nbSessions > 1 ? "s" : ""} · {s.nbEquipements} équipement{s.nbEquipements > 1 ? "s" : ""}
                          {s.derniereActivite && ` · Dernière : ${formatDate(s.derniereActivite)}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-amber-700">{formatDureeMs(s.totalMs)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- DÉTAIL DES SESSIONS DE L'OPÉRATEUR SÉLECTIONNÉ --- */}
          {selectedOperateurId && sessionsDuSelected.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white">
                <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                  <Clock size={16} className="text-amber-600" />
                  Détail des sessions — {operateurs.find((o) => o.id === selectedOperateurId)?.full_name}
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                    {sessionsDuSelected.length}
                  </span>
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {sessionsDuSelected.map((s) => {
                  const startMs = new Date(s.started_at).getTime();
                  const endMs = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
                  const duration = Math.max(0, endMs - startMs);
                  return (
                    <div key={s.id} className="p-4 flex items-center justify-between gap-3">
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
                        <p className="text-sm font-bold text-amber-700">{formatDureeMs(duration)}</p>
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
          )}
        </>
      )}
    </div>
  );
}