import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Package, AlertTriangle, ClipboardList, RefreshCw,
  Activity, Search, Filter, Zap, PlayCircle,
  Calculator
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
}
interface Passage {
  equipement_id: string;
  atelier_id: string;
  pourcentage: number;
  passage_date: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "en_cours" | "stagnant" | "urgent">("all");

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const [eqRes, passRes] = await Promise.all([
      supabase.from("equipements")
        .select("id, client_name, type_equipement, code_faratec, statut, pourcentage_global, semaine_entree, urgence, created_at")
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = (iso: string) => iso.slice(0, 10) === todayStr;

  const stats = useMemo(() => {
    const enCours = equipements.filter((e) => e.statut !== "livre");
    const seenTodayIds = new Set(passages.filter((p) => isToday(p.passage_date)).map((p) => p.equipement_id));
    const notSeenToday = enCours.filter((e) => !seenTodayIds.has(e.id));

    const stagnant = enCours.filter((e) => {
      const history = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
      return history.length >= 3 && history.every((p) => p.pourcentage === history[0].pourcentage);
    });

    const urgents = enCours.filter((e) => e.urgence === "urgent");

    return { enCours: enCours.length, notSeenToday, stagnant, urgents };
  }, [equipements, passages]);

  const semaineActuelle = useMemo(() => {
    const d = new Date();
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }, []);

  const entreesCetteSemaine = useMemo(() => {
    return equipements.filter((e) => e.semaine_entree === semaineActuelle).length;
  }, [equipements, semaineActuelle]);

  // --- FILTRAGE ---
  const filteredEquipements = useMemo(() => {
    let list = equipements.filter((e) => e.statut !== "livre");

    if (filterMode === "en_cours") list = list.filter((e) => e.pourcentage_global > 0 && e.pourcentage_global < 100);
    else if (filterMode === "stagnant") list = list.filter((e) => stats.stagnant.some((s) => s.id === e.id));
    else if (filterMode === "urgent") list = list.filter((e) => e.urgence === "urgent");

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.client_name.toLowerCase().includes(s) ||
        (e.code_faratec && e.code_faratec.toLowerCase().includes(s)) ||
        e.type_equipement.toLowerCase().includes(s)
      );
    }

    return list;
  }, [equipements, filterMode, searchTerm, stats.stagnant]);

  const getProgressColor = (p: number) => {
    if (p < 30) return "bg-red-500";
    if (p < 70) return "bg-amber-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-6">
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
          {/* --- KPIs --- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border-l-4 border-amber-500">
              <Package size={22} className="text-amber-700" />
              <div>
                <p className="text-xs text-slate-500">En cours</p>
                <p className="text-lg font-bold text-slate-800">{stats.enCours}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border-l-4 border-red-500">
              <AlertTriangle size={22} className="text-red-500" />
              <div>
                <p className="text-xs text-slate-500">Stagnants</p>
                <p className="text-lg font-bold text-slate-800">{stats.stagnant.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border-l-4 border-blue-500">
              <ClipboardList size={22} className="text-blue-600" />
              <div>
                <p className="text-xs text-slate-500">Non vus aujourd'hui</p>
                <p className="text-lg font-bold text-slate-800">{stats.notSeenToday.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border-l-4 border-green-500">
              <Activity size={22} className="text-green-600" />
              <div>
                <p className="text-xs text-slate-500">Entrées cette semaine</p>
                <p className="text-lg font-bold text-slate-800">{entreesCetteSemaine}</p>
              </div>
            </div>
          </div>

          {/* --- ALERTES STAGNANTS --- */}
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

          {/* --- RECHERCHE + FILTRES --- */}
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterMode("all")}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  filterMode === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Filter size={12} /> Tous ({equipements.filter((e) => e.statut !== "livre").length})
              </button>
              <button
                onClick={() => setFilterMode("en_cours")}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  filterMode === "en_cours" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <PlayCircle size={12} /> En cours
              </button>
              <button
                onClick={() => setFilterMode("stagnant")}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  filterMode === "stagnant" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <AlertTriangle size={12} /> Stagnants
              </button>
              <button
                onClick={() => setFilterMode("urgent")}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  filterMode === "urgent" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Zap size={12} /> Urgents
              </button>
            </div>
          </div>

          {/* --- LISTE ÉQUIPEMENTS --- */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                <Package size={16} className="text-amber-600" />
                Équipements ({filteredEquipements.length})
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
                  const isUrgent = e.urgence === "urgent";
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
                          {isStagnant && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <AlertTriangle size={9} /> STAGNANT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{e.type_equipement}</p>
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