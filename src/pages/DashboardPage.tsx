import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Package, AlertTriangle, CheckCircle2, ClipboardList, RefreshCw, Activity, TrendingUp } from "lucide-react";

interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  code_faratec: string | null;
  statut: string;
  pourcentage_global: number;
  semaine_entree: number | null;
}
interface Passage {
  equipement_id: string;
  atelier_id: string;
  pourcentage: number;
  passage_date: string;
}

export default function DashboardPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const [{ data: eqData }, { data: passData }] = await Promise.all([
      supabase.from("equipements").select("id, client_name, type_equipement, code_faratec, statut, pourcentage_global, semaine_entree").is("deleted_at", null),
      supabase.from("journal_passages").select("equipement_id, atelier_id, pourcentage, passage_date").is("deleted_at", null).order("passage_date", { ascending: false }),
    ]);
    setEquipements((eqData as Equipement[]) || []);
    setPassages((passData as Passage[]) || []);
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

    return { enCours: enCours.length, notSeenToday, stagnant };
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tableau de bord</h1>
          <p className="text-sm text-slate-500">
            Vue d'ensemble des équipements en cours. <span className="text-amber-600 font-semibold">Semaine {semaineActuelle}</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-amber-600" />
              Tournée du jour — pas encore vus ({stats.notSeenToday.length})
            </h2>
            {stats.notSeenToday.length === 0 ? (
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle2 size={16} />
                Tous les équipements ont été vus aujourd'hui.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {stats.notSeenToday.map((e) => (
                  <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-800">
                      <strong>{e.code_faratec || "—"}</strong> — {e.client_name}
                    </span>
                    <span className="text-slate-500">{e.pourcentage_global}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}