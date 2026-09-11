import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Package, AlertTriangle, CheckCircle2, ClipboardList, Search, Wrench, Paintbrush, Hammer, Cog, Clock } from "lucide-react";

interface Equipement {
  id: string;
  reference: string;
  client_name: string;
  type_equipement: string;
  statut: string;
  pourcentage_global: number;
  atelier_actuel?: string;
}

interface Passage {
  equipement_id: string;
  atelier_id: string;
  pourcentage: number;
  passage_date: string;
}

const ATELIERS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  mecanique: { label: "Mécanique", icon: Cog, color: "text-blue-600" },
  peinture: { label: "Peinture", icon: Paintbrush, color: "text-purple-600" },
  tolerie: { label: "Tôlerie", icon: Hammer, color: "text-amber-600" },
  assemblage: { label: "Assemblage", icon: Wrench, color: "text-green-600" },
};

// --- Fonction utilitaire pour la couleur de la barre ---
const getProgressColor = (pourcentage: number) => {
  if (pourcentage < 30) return "bg-red-500";
  if (pourcentage < 70) return "bg-amber-500";
  return "bg-green-500";
};

// --- Fonction utilitaire pour le temps écoulé ---
const getTimeAgo = (dateString: string | null) => {
  if (!dateString) return "Jamais vu";
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return "Aujourd'hui";
  if (diffInDays === 1) return "Hier";
  if (diffInDays < 7) return `Il y a ${diffInDays} jours`;
  if (diffInDays < 30) return `Il y a ${Math.floor(diffInDays / 7)} sem.`;
  return `Il y a ${Math.floor(diffInDays / 30)} mois`;
};

export default function DashboardPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const load = async () => {
      const [{ data: eqData }, { data: passData }] = await Promise.all([
        supabase.from("equipements").select("id, reference, client_name, type_equipement, statut, pourcentage_global, atelier_actuel").is("deleted_at", null).in("statut", ["en_attente", "en_reparation"]),
        supabase.from("journal_passages").select("equipement_id, atelier_id, pourcentage, passage_date").is("deleted_at", null).order("passage_date", { ascending: false }),
      ]);
      setEquipements((eqData as Equipement[]) || []);
      setPassages((passData as Passage[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  // --- Map pour trouver rapidement le dernier passage d'un équipement ---
  const dernierPassageMap = useMemo(() => {
    const map = new Map<string, Passage>();
    // Les passages sont déjà triés du plus récent au plus ancien
    passages.forEach((p) => {
      if (!map.has(p.equipement_id)) {
        map.set(p.equipement_id, p);
      }
    });
    return map;
  }, [passages]);

  const filteredEquipements = useMemo(() => {
    if (!searchTerm) return equipements;
    const lowerSearch = searchTerm.toLowerCase();
    return equipements.filter(
      (e) =>
        e.client_name.toLowerCase().includes(lowerSearch) ||
        (e.reference && e.reference.toLowerCase().includes(lowerSearch))
    );
  }, [equipements, searchTerm]);

  // --- Regroupement + Tri par ancienneté de passage ---
  const equipementsParAtelier = useMemo(() => {
    const groups: Record<string, Equipement[]> = {};
    filteredEquipements.forEach((e) => {
      const atelier = e.atelier_actuel || "Non assigné";
      if (!groups[atelier]) groups[atelier] = [];
      groups[atelier].push(e);
    });

    // Trier chaque groupe : ceux qui n'ont pas été vus depuis le plus longtemps en premier
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        const dateA = dernierPassageMap.get(a.id)?.passage_date || "1970-01-01";
        const dateB = dernierPassageMap.get(b.id)?.passage_date || "1970-01-01";
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });
    });

    return groups;
  }, [filteredEquipements, dernierPassageMap]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = (iso: string) => iso.slice(0, 10) === todayStr;

  const seenTodayIds = new Set(passages.filter((p) => isToday(p.passage_date)).map((p) => p.equipement_id));
  const notSeenToday = filteredEquipements.filter((e) => !seenTodayIds.has(e.id));

  const stagnant = filteredEquipements.filter((e) => {
    const history = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
    return history.length >= 3 && history.every((p) => p.pourcentage === history[0].pourcentage);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tableau de bord</h1>
          <p className="text-sm text-slate-500">Vue d'ensemble des équipements en cours.</p>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par référence ou client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
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
                <p className="text-lg font-bold text-slate-800">{filteredEquipements.length}</p>
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

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Avancement par atelier</h2>
            {Object.keys(equipementsParAtelier).length === 0 ? (
              <p className="text-sm text-slate-500 bg-white p-4 rounded-xl shadow-sm">Aucun équipement trouvé pour cette recherche.</p>
            ) : (
              Object.entries(equipementsParAtelier).map(([atelierKey, eqs]) => {
                const config = ATELIERS_CONFIG[atelierKey] || { label: atelierKey, icon: Package, color: "text-slate-600" };
                const Icon = config.icon;
                
                return (
                  <div key={atelierKey} className="bg-white rounded-xl p-5 shadow-sm">
                    <h3 className={`font-semibold text-sm mb-3 flex items-center gap-2 ${config.color}`}>
                      <Icon size={18} />
                      {config.label} ({eqs.length})
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {eqs.map((e) => {
                        const dernierPassage = dernierPassageMap.get(e.id);
                        const dateDernierPassage = dernierPassage?.passage_date || null;
                        
                        return (
                          <div key={e.id} className="py-3 flex flex-col gap-2">
                            {/* Ligne 1 : Infos équipement */}
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex flex-col">
                                <span className="text-slate-800 font-medium">{e.client_name}</span>
                                <span className="text-xs text-slate-500">{e.type_equipement} • Réf: {e.reference || "N/A"}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="font-semibold text-slate-700">{e.pourcentage_global}%</span>
                                {/* Date du dernier passage */}
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                  <Clock size={10} />
                                  {getTimeAgo(dateDernierPassage)}
                                </span>
                              </div>
                            </div>
                            
                            {/* Ligne 2 : Barre de progression */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(e.pourcentage_global)}`}
                                style={{ width: `${e.pourcentage_global}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
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