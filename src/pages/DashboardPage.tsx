import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Package, AlertTriangle, RefreshCw,
  Activity, Search, Zap, PlayCircle,
  Calculator, CheckCircle2, Calendar, CalendarDays,
  CalendarRange, TrendingUp, Hourglass, Flag
} from "lucide-react";

interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  code_faratec: string | null;
  statut: string;
  pourcentage_global: number;
  semaine_entree: number | null;
  urgence: string | null;
  created_at: string;
  date_livraison_reelle: string | null;
  date_fin_prevue: string | null;
}
interface Passage {
  equipement_id: string;
  atelier_id: string;
  pourcentage: number;
  passage_date: string;
}

type FilterMode =
  | "all" | "en_cours" | "pret_a_livrer" | "stagnant" | "urgent" | "not_seen_today"
  | "livre_today" | "livre_week" | "livre_month" | "livre_year"
  | "entree_today" | "entree_week" | "entree_month" | "entree_year";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const [eqRes, passRes] = await Promise.all([
      supabase.from("equipements")
        .select("id, client_name, type_equipement, code_faratec, statut, pourcentage_global, semaine_entree, urgence, created_at, date_livraison_reelle, date_fin_prevue")
        .is("deleted_at", null),
      supabase.from("journal_passages")
        .select("equipement_id, atelier_id, pourcentage, passage_date")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false }),
    ]);
    setEquipements((eqRes.data as Equipement[]) || []);
    setPassages((passRes.data as Passage[]) || []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  // --- BORNES DE PERIODES ---
  const periods = useMemo(() => {
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dayOfWeek - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

    return { todayStart, todayEnd, weekStart, weekEnd, monthStart, monthEnd, yearStart, yearEnd };
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = (iso: string) => iso.slice(0, 10) === todayStr;

  const inRange = (iso: string | null, start: Date, end: Date) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= start && d < end;
  };

  // --- STATS ---
  const stats = useMemo(() => {
    const enCoursList = equipements.filter((e) => e.statut !== "livre");
    const enCours = enCoursList.filter((e) => e.pourcentage_global > 0 && e.pourcentage_global < 100);
    const pretALivrer = enCoursList.filter((e) => e.pourcentage_global >= 100);
    const livres = equipements.filter((e) => e.statut === "livre");

    const seenTodayIds = new Set(passages.filter((p) => isToday(p.passage_date)).map((p) => p.equipement_id));
    const notSeenToday = enCoursList.filter((e) => !seenTodayIds.has(e.id));

    const stagnant = enCoursList.filter((e) => {
      const history = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
      return history.length >= 3 && history.every((p) => p.pourcentage === history[0].pourcentage);
    });

    const urgents = enCoursList.filter((e) => e.urgence === "urgent");

    // Livrés par période
    const livresToday = livres.filter((e) => inRange(e.date_livraison_reelle, periods.todayStart, periods.todayEnd));
    const livresWeek = livres.filter((e) => inRange(e.date_livraison_reelle, periods.weekStart, periods.weekEnd));
    const livresMonth = livres.filter((e) => inRange(e.date_livraison_reelle, periods.monthStart, periods.monthEnd));
    const livresYear = livres.filter((e) => inRange(e.date_livraison_reelle, periods.yearStart, periods.yearEnd));

    // Entrées par période
    const entreesToday = equipements.filter((e) => inRange(e.created_at, periods.todayStart, periods.todayEnd));
    const entreesWeek = equipements.filter((e) => inRange(e.created_at, periods.weekStart, periods.weekEnd));
    const entreesMonth = equipements.filter((e) => inRange(e.created_at, periods.monthStart, periods.monthEnd));
    const entreesYear = equipements.filter((e) => inRange(e.created_at, periods.yearStart, periods.yearEnd));

    return {
      total: equipements.length,
      enCours: enCours.length,
      pretALivrer: pretALivrer.length,
      livres: livres.length,
      notSeenToday,
      stagnant,
      urgents,
      livresToday: livresToday.length,
      livresWeek: livresWeek.length,
      livresMonth: livresMonth.length,
      livresYear: livresYear.length,
      entreesToday: entreesToday.length,
      entreesWeek: entreesWeek.length,
      entreesMonth: entreesMonth.length,
      entreesYear: entreesYear.length,
    };
  }, [equipements, passages, periods]);

  const semaineActuelle = useMemo(() => {
    const d = new Date();
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }, []);

  // --- FILTRAGE ---
  const filteredEquipements = useMemo(() => {
    let list = [...equipements];

    if (filterMode === "all") {
      list = equipements.filter((e) => e.statut !== "livre");
    } else if (filterMode === "en_cours") {
      list = equipements.filter((e) => e.statut !== "livre" && e.pourcentage_global > 0 && e.pourcentage_global < 100);
    } else if (filterMode === "pret_a_livrer") {
      list = equipements.filter((e) => e.statut !== "livre" && e.pourcentage_global >= 100);
    } else if (filterMode === "stagnant") {
      list = stats.stagnant;
    } else if (filterMode === "urgent") {
      list = equipements.filter((e) => e.statut !== "livre" && e.urgence === "urgent");
    } else if (filterMode === "not_seen_today") {
      list = stats.notSeenToday;
    } else if (filterMode === "livre_today") {
      list = equipements.filter((e) => e.statut === "livre" && inRange(e.date_livraison_reelle, periods.todayStart, periods.todayEnd));
    } else if (filterMode === "livre_week") {
      list = equipements.filter((e) => e.statut === "livre" && inRange(e.date_livraison_reelle, periods.weekStart, periods.weekEnd));
    } else if (filterMode === "livre_month") {
      list = equipements.filter((e) => e.statut === "livre" && inRange(e.date_livraison_reelle, periods.monthStart, periods.monthEnd));
    } else if (filterMode === "livre_year") {
      list = equipements.filter((e) => e.statut === "livre" && inRange(e.date_livraison_reelle, periods.yearStart, periods.yearEnd));
    } else if (filterMode === "entree_today") {
      list = equipements.filter((e) => inRange(e.created_at, periods.todayStart, periods.todayEnd));
    } else if (filterMode === "entree_week") {
      list = equipements.filter((e) => inRange(e.created_at, periods.weekStart, periods.weekEnd));
    } else if (filterMode === "entree_month") {
      list = equipements.filter((e) => inRange(e.created_at, periods.monthStart, periods.monthEnd));
    } else if (filterMode === "entree_year") {
      list = equipements.filter((e) => inRange(e.created_at, periods.yearStart, periods.yearEnd));
    }

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.client_name.toLowerCase().includes(s) ||
        (e.code_faratec && e.code_faratec.toLowerCase().includes(s)) ||
        e.type_equipement.toLowerCase().includes(s)
      );
    }

    return list;
  }, [equipements, filterMode, searchTerm, stats.stagnant, stats.notSeenToday, periods]);

  // --- TITRE DYNAMIQUE ---
  const listTitle = useMemo(() => {
    const titles: Record<FilterMode, string> = {
      all: "Tous (en cours)",
      en_cours: "En cours",
      pret_a_livrer: "Prêts à livrer",
      stagnant: "Stagnants",
      urgent: "Urgents",
      not_seen_today: "Non vus aujourd'hui",
      livre_today: "Livrés aujourd'hui",
      livre_week: "Livrés cette semaine",
      livre_month: "Livrés ce mois",
      livre_year: "Livrés cette année",
      entree_today: "Entrées aujourd'hui",
      entree_week: "Entrées cette semaine",
      entree_month: "Entrées ce mois",
      entree_year: "Entrées cette année",
    };
    return titles[filterMode];
  }, [filterMode]);

  const getProgressColor = (p: number) => {
    if (p < 30) return "bg-red-500";
    if (p < 70) return "bg-amber-500";
    return "bg-green-500";
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

  return (
    <div className="space-y-5">
      {/* --- EN-TÊTE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tableau de bord</h1>
          <p className="text-sm text-slate-500">
            Vue d'ensemble des équipements. <span className="text-amber-600 font-semibold">Semaine {semaineActuelle}</span>
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          {/* SECTION 1 - VUE D'ENSEMBLE */}
          <div>
            <h2 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
              Vue d'ensemble
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <button
                onClick={() => setFilterMode("all")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-slate-400 hover:shadow-md transition ${filterMode === "all" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Package size={10} /> Tous
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.enCours + stats.pretALivrer}</p>
              </button>
              <button
                onClick={() => setFilterMode("en_cours")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-500 hover:shadow-md transition ${filterMode === "en_cours" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <PlayCircle size={10} /> En cours
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.enCours}</p>
              </button>
              <button
                onClick={() => setFilterMode("pret_a_livrer")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-violet-500 hover:shadow-md transition ${filterMode === "pret_a_livrer" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Flag size={10} /> Prêts à livrer
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.pretALivrer}</p>
              </button>
              <button
                onClick={() => setFilterMode("urgent")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-red-600 hover:shadow-md transition ${filterMode === "urgent" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Zap size={10} className="text-red-500" /> Urgents
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.urgents.length}</p>
              </button>
              <button
                onClick={() => setFilterMode("stagnant")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-red-500 hover:shadow-md transition ${filterMode === "stagnant" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <AlertTriangle size={10} /> Stagnants
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.stagnant.length}</p>
              </button>
            </div>
          </div>

          {/* SECTION 2 - LIVRÉS */}
          <div>
            <h2 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
              Livrés
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => setFilterMode("livre_today")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-500 hover:shadow-md transition ${filterMode === "livre_today" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={10} /> Aujourd'hui
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.livresToday}</p>
              </button>
              <button
                onClick={() => setFilterMode("livre_week")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-600 hover:shadow-md transition ${filterMode === "livre_week" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Calendar size={10} /> Semaine
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.livresWeek}</p>
              </button>
              <button
                onClick={() => setFilterMode("livre_month")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-700 hover:shadow-md transition ${filterMode === "livre_month" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <CalendarDays size={10} /> Mois
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.livresMonth}</p>
              </button>
              <button
                onClick={() => setFilterMode("livre_year")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-800 hover:shadow-md transition ${filterMode === "livre_year" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <CalendarRange size={10} /> Année
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.livresYear}</p>
              </button>
            </div>
          </div>

          {/* SECTION 3 - ENTRÉES */}
          <div>
            <h2 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
              Entrées (nouvelles fiches)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => setFilterMode("entree_today")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-400 hover:shadow-md transition ${filterMode === "entree_today" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Activity size={10} /> Aujourd'hui
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.entreesToday}</p>
              </button>
              <button
                onClick={() => setFilterMode("entree_week")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-500 hover:shadow-md transition ${filterMode === "entree_week" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Activity size={10} /> Semaine
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.entreesWeek}</p>
              </button>
              <button
                onClick={() => setFilterMode("entree_month")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-600 hover:shadow-md transition ${filterMode === "entree_month" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <TrendingUp size={10} /> Mois
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.entreesMonth}</p>
              </button>
              <button
                onClick={() => setFilterMode("entree_year")}
                className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-700 hover:shadow-md transition ${filterMode === "entree_year" ? "ring-2 ring-amber-400" : ""}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Hourglass size={10} /> Année
                </p>
                <p className="text-xl font-bold text-slate-800">{stats.entreesYear}</p>
              </button>
            </div>
          </div>

          {/* ALERTES STAGNANTS */}
          {stats.stagnant.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-red-500">
              <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                Équipements stagnants (même % sur 3 derniers passages)
              </h2>
              <div className="divide-y divide-slate-100">
                {stats.stagnant.map((e) => (
                  <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-800">
                      <strong>{e.code_faratec || "—"}</strong> — {e.client_name}
                    </span>
                    <span className="font-semibold text-red-600">{e.pourcentage_global}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RECHERCHE + FILTRES */}
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Rechercher par code faratec, client ou type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Filtre actif :</span>
              <span className="text-xs font-bold text-slate-800 bg-amber-100 px-2 py-1 rounded-full">
                {listTitle}
              </span>
              {filterMode !== "all" && (
                <button
                  onClick={() => setFilterMode("all")}
                  className="text-xs text-amber-600 hover:underline font-semibold ml-1"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* LISTE ÉQUIPEMENTS */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                <Package size={16} className="text-amber-600" />
                Équipements — {listTitle} ({filteredEquipements.length})
              </h2>
            </div>

            {filteredEquipements.length === 0 ? (
              <div className="text-center py-12">
                <Package size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">Aucun équipement trouvé.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {filteredEquipements.map((e) => {
                  const isStagnant = stats.stagnant.some((s) => s.id === e.id);
                  const isUrgent = e.urgence === "urgent" && e.statut !== "livre";
                  const isLivre = e.statut === "livre";
                  const isPret = !isLivre && e.pourcentage_global >= 100;
                  return (
                    <div
                      key={e.id}
                      className={`p-4 flex items-center gap-3 transition hover:bg-slate-50/60 ${isUrgent ? "bg-red-50/30" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm">
                            {e.code_faratec || "Sans code"}
                          </span>
                          <span className="text-sm text-slate-600">• {e.client_name}</span>
                          {isUrgent && (
                            <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Zap size={9} /> URGENT
                            </span>
                          )}
                          {isStagnant && !isLivre && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <AlertTriangle size={9} /> STAGNANT
                            </span>
                          )}
                          {isPret && (
                            <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Flag size={9} /> PRÊT À LIVRER
                            </span>
                          )}
                          {isLivre && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <CheckCircle2 size={9} /> LIVRÉ
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{e.type_equipement}</p>
                        {isLivre && e.date_livraison_reelle && (
                          <p className="text-[10px] text-green-600 mt-1">
                            Livré le {formatDate(e.date_livraison_reelle)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 w-40 shrink-0">
                        <div className="flex-1">
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${getProgressColor(e.pourcentage_global)}`}
                              style={{ width: `${e.pourcentage_global}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 text-right font-semibold">{e.pourcentage_global}%</p>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/couts?eq=${e.id}`)}
                        className="text-emerald-700 hover:bg-emerald-50 rounded-lg px-2 py-1.5 text-xs font-medium transition shrink-0"
                        title="Calcul des coûts"
                      >
                        <Calculator size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}