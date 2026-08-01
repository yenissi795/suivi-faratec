import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Package, AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";

interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  statut: string;
  pourcentage_global: number;
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

  useEffect(() => {
    const load = async () => {
      const [{ data: eqData }, { data: passData }] = await Promise.all([
        supabase.from("equipements").select("*").is("deleted_at", null).in("statut", ["en_attente", "en_reparation"]),
        supabase.from("journal_passages").select("equipement_id, atelier_id, pourcentage, passage_date").is("deleted_at", null).order("passage_date", { ascending: false }),
      ]);
      setEquipements((eqData as Equipement[]) || []);
      setPassages((passData as Passage[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = (iso: string) => iso.slice(0, 10) === todayStr;

  const seenTodayIds = new Set(passages.filter((p) => isToday(p.passage_date)).map((p) => p.equipement_id));
  const notSeenToday = equipements.filter((e) => !seenTodayIds.has(e.id));

  const stagnant = equipements.filter((e) => {
    const history = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
    return history.length >= 3 && history.every((p) => p.pourcentage === history[0].pourcentage);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Tableau de bord</h1>
        <p className="text-sm text-slate-500">Vue d'ensemble des équipements en cours.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
              <Package size={22} className="text-amber-700" />
              <div>
                <p className="text-xs text-slate-500">En cours</p>
                <p className="text-lg font-bold text-slate-800">{equipements.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
              <AlertTriangle size={22} className="text-amber-500" />
              <div>
                <p className="text-xs text-slate-500">Stagnants</p>
                <p className="text-lg font-bold text-slate-800">{stagnant.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
              <ClipboardList size={22} className="text-amber-700" />
              <div>
                <p className="text-xs text-slate-500">Non vus aujourd'hui</p>
                <p className="text-lg font-bold text-slate-800">{notSeenToday.length}</p>
              </div>
            </div>
          </div>

          {stagnant.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Équipements stagnants (même % sur 3 dernières tournées)
              </h2>
              <div className="divide-y divide-slate-100">
                {stagnant.map((e) => (
                  <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-800">{e.client_name} — {e.type_equipement}</span>
                    <span className="font-semibold text-amber-700">{e.pourcentage_global}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-700 text-sm mb-3">Tournée du jour — pas encore vus</h2>
            {notSeenToday.length === 0 ? (
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle2 size={16} />
                Tous les équipements ont été vus aujourd'hui.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notSeenToday.map((e) => (
                  <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-800">{e.client_name} — {e.type_equipement}</span>
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
