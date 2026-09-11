import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
    Package, Plus, Search, Edit3, Truck, Trash2, X, Loader2,
  Clock, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, History,
  Sparkles, Filter
} from "lucide-react";

// --- TYPES ---
interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  reference: string | null;
  marque: string | null;
  puissance_kw: number | null;
  operateur: string | null;
  pourcentage_global: number;
  statut: string;
  date_livraison_reelle: string | null;
  created_at: string;
}
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  technicien_id: string | null;
  pourcentage: number;
  commentaire: string | null;
  photo_url: string | null;
  passage_date: string;
  ateliers: { name: string } | null;
  techniciens: { full_name: string } | null;
}

// --- UTILITAIRES ---
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const getTimeAgo = (iso: string | null) => {
  if (!iso) return "Jamais";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  if (days < 30) return `Il y a ${Math.floor(days / 7)}sem`;
  return `Il y a ${Math.floor(days / 30)}mois`;
};

const getProgressColor = (p: number) => {
  if (p < 30) return "bg-red-500";
  if (p < 70) return "bg-amber-500";
  return "bg-green-500";
};

export default function EquipementsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);

  // --- UI ---
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "en_cours" | "livres" | "stagnant">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // --- MODALE CRÉATION ---
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    reference: "", client_name: "", type_equipement: "",
    marque: "", puissance_kw: "", operateur: "",
  });
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});
  const [newSaving, setNewSaving] = useState(false);

  // --- MODALE ÉDITION ---
  const [editing, setEditing] = useState<Equipement | null>(null);
  const [editForm, setEditForm] = useState({
    reference: "", client_name: "", type_equipement: "",
    marque: "", puissance_kw: "", operateur: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  // --- CHARGEMENT ---
  const load = async () => {
    setLoading(true);
    const [eqRes, passRes] = await Promise.all([
      supabase.from("equipements").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("journal_passages")
        .select("id, equipement_id, atelier_id, technicien_id, pourcentage, commentaire, photo_url, passage_date, ateliers(name), techniciens(full_name)")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false }),
    ]);
    setEquipements((eqRes.data as Equipement[]) || []);
    setPassages((passRes.data as unknown as Passage[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Échap pour fermer les modales
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (creating) closeCreate();
        if (editing) closeEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, editing]);

  // --- MAP DERNIER PASSAGE ---
  const dernierPassageMap = useMemo(() => {
    const map = new Map<string, Passage>();
    passages.forEach((p) => {
      if (!map.has(p.equipement_id)) map.set(p.equipement_id, p);
    });
    return map;
  }, [passages]);

  // --- MAP STAGNANT ---
  const stagnantIds = useMemo(() => {
    const set = new Set<string>();
    equipements.forEach((e) => {
      const hist = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
      if (hist.length >= 3 && hist.every((p) => p.pourcentage === hist[0].pourcentage)) {
        set.add(e.id);
      }
    });
    return set;
  }, [equipements, passages]);

  // --- STATS ---
  const stats = useMemo(() => {
    const total = equipements.length;
    const enCours = equipements.filter((e) => e.statut !== "livre").length;
    const livres = equipements.filter((e) => e.statut === "livre").length;
    const stagnants = stagnantIds.size;
    return { total, enCours, livres, stagnants };
  }, [equipements, stagnantIds]);

  // --- FILTRAGE ---
  const filteredEquipements = useMemo(() => {
    let list = [...equipements];

    if (filterMode === "en_cours") list = list.filter((e) => e.statut !== "livre");
    else if (filterMode === "livres") list = list.filter((e) => e.statut === "livre");
    else if (filterMode === "stagnant") list = list.filter((e) => stagnantIds.has(e.id));

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.client_name.toLowerCase().includes(s) ||
        (e.reference && e.reference.toLowerCase().includes(s)) ||
        e.type_equipement.toLowerCase().includes(s)
      );
    }

    // Tri : non vus depuis longtemps en premier, puis livrés en bas
    list.sort((a, b) => {
      if (a.statut === "livre" && b.statut !== "livre") return 1;
      if (a.statut !== "livre" && b.statut === "livre") return -1;
      const dateA = dernierPassageMap.get(a.id)?.passage_date || "1970-01-01";
      const dateB = dernierPassageMap.get(b.id)?.passage_date || "1970-01-01";
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    return list;
  }, [equipements, filterMode, searchTerm, stagnantIds, dernierPassageMap]);

  // --- CRÉATION ---
  const openCreate = () => {
    setCreating(true);
    setNewForm({ reference: "", client_name: "", type_equipement: "", marque: "", puissance_kw: "", operateur: "" });
    setNewErrors({});
  };
  const closeCreate = () => { setCreating(false); setNewErrors({}); };

  const handleCreate = async () => {
    if (!user) return;
    const errs: Record<string, string> = {};
    if (!newForm.reference.trim()) errs.reference = "Obligatoire";
    if (!newForm.client_name.trim()) errs.client_name = "Obligatoire";
    if (!newForm.type_equipement.trim()) errs.type_equipement = "Obligatoire";
    setNewErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setNewSaving(true);
    const { data, error } = await supabase.from("equipements").insert({
      reference: newForm.reference.trim(),
      client_name: newForm.client_name.trim(),
      type_equipement: newForm.type_equipement.trim(),
      marque: newForm.marque.trim() || null,
      puissance_kw: newForm.puissance_kw ? parseFloat(newForm.puissance_kw) : null,
      operateur: newForm.operateur.trim() || null,
      owner_id: user.id,
      statut: "en_attente",
      pourcentage_global: 0,
    }).select().single();

    if (error || !data) {
      setNewSaving(false);
      setNewErrors({ reference: "Erreur : cette référence existe peut-être déjà." });
      return;
    }
    setEquipements((prev) => [data as Equipement, ...prev]);
    setNewSaving(false);
    closeCreate();
  };

  // --- ÉDITION ---
  const openEdit = (eq: Equipement) => {
    setEditing(eq);
    setEditForm({
      reference: eq.reference || "",
      client_name: eq.client_name || "",
      type_equipement: eq.type_equipement || "",
      marque: eq.marque || "",
      puissance_kw: eq.puissance_kw ? String(eq.puissance_kw) : "",
      operateur: eq.operateur || "",
    });
    setEditErrors({});
  };
  const closeEdit = () => { setEditing(null); setEditErrors({}); };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const errs: Record<string, string> = {};
    if (!editForm.reference.trim()) errs.reference = "Obligatoire";
    if (!editForm.client_name.trim()) errs.client_name = "Obligatoire";
    if (!editForm.type_equipement.trim()) errs.type_equipement = "Obligatoire";
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditSaving(true);
    const updated: Equipement = {
      ...editing,
      reference: editForm.reference.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: editForm.type_equipement.trim(),
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      operateur: editForm.operateur.trim() || null,
    };
    setEquipements((prev) => prev.map((e) => (e.id === editing.id ? updated : e)));

    await supabase.from("equipements").update({
      reference: editForm.reference.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: editForm.type_equipement.trim(),
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      operateur: editForm.operateur.trim() || null,
    }).eq("id", editing.id);

    setEditSaving(false);
    closeEdit();
  };

  // --- LIVRER ---
  const handleMarquerLivre = async (id: string) => {
    const dateIso = new Date().toISOString().slice(0, 10);
    setEquipements((prev) =>
      prev.map((e) => (e.id === id ? { ...e, statut: "livre", date_livraison_reelle: dateIso } : e))
    );
    await supabase.from("equipements").update({
      statut: "livre",
      date_livraison_reelle: dateIso,
    }).eq("id", id);
  };

  // --- SUPPRIMER (soft delete) ---
  const handleDelete = async (id: string) => {
    setEquipements((prev) => prev.filter((e) => e.id !== id));
    setConfirmDelete(null);
    await supabase.from("equipements").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  // --- HISTORIQUE ---
  const getHistorique = (eqId: string) => passages.filter((p) => p.equipement_id === eqId);

  return (
    <div className="space-y-5">
      {/* --- EN-TÊTE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Équipements</h1>
          <p className="text-sm text-slate-500">Registre central de tous les équipements.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-md hover:shadow-lg transition-all"
        >
          <Plus size={16} /> Nouvel équipement
        </button>
      </div>

      {/* --- KPIs --- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFilterMode("all")}
          className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-slate-400 hover:shadow-md transition ${filterMode === "all" ? "ring-2 ring-amber-400" : ""}`}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</p>
          <p className="text-xl font-bold text-slate-800">{stats.total}</p>
        </button>
        <button
          onClick={() => setFilterMode("en_cours")}
          className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-500 hover:shadow-md transition ${filterMode === "en_cours" ? "ring-2 ring-amber-400" : ""}`}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">En cours</p>
          <p className="text-xl font-bold text-slate-800">{stats.enCours}</p>
        </button>
        <button
          onClick={() => setFilterMode("livres")}
          className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-500 hover:shadow-md transition ${filterMode === "livres" ? "ring-2 ring-amber-400" : ""}`}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Livrés</p>
          <p className="text-xl font-bold text-slate-800">{stats.livres}</p>
        </button>
        <button
          onClick={() => setFilterMode("stagnant")}
          className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-red-500 hover:shadow-md transition ${filterMode === "stagnant" ? "ring-2 ring-amber-400" : ""}`}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Stagnants</p>
          <p className="text-xl font-bold text-slate-800">{stats.stagnants}</p>
        </button>
      </div>

      {/* --- RECHERCHE --- */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par référence, client ou type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        {filterMode !== "all" && (
          <div className="mt-2 flex items-center gap-2">
            <Filter size={12} className="text-slate-400" />
            <span className="text-xs text-slate-500">
              Filtre actif : <strong>{filterMode === "en_cours" ? "En cours" : filterMode === "livres" ? "Livrés" : "Stagnants"}</strong>
            </span>
            <button onClick={() => setFilterMode("all")} className="text-xs text-amber-600 hover:underline font-semibold">
              Réinitialiser
            </button>
          </div>
        )}
      </div>

      {/* --- LISTE --- */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Package size={16} className="text-amber-600" />
            {filteredEquipements.length} équipement{filteredEquipements.length !== 1 ? "s" : ""}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-amber-500" size={24} />
          </div>
        ) : filteredEquipements.length === 0 ? (
          <div className="text-center py-12">
            <Package size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucun équipement trouvé.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEquipements.map((e) => {
              const isExpanded = expandedId === e.id;
              const historique = getHistorique(e.id);
              const dernierPassage = dernierPassageMap.get(e.id);
              const isStagnant = stagnantIds.has(e.id);
              const isNew = historique.length === 0;
              const isLivre = e.statut === "livre";

              return (
                <div key={e.id} className={`transition ${isLivre ? "bg-slate-50/40" : "hover:bg-slate-50/40"}`}>
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-base">
                          {e.reference || "Sans référence"}
                        </span>
                        {isLivre && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                            LIVRÉ
                          </span>
                        )}
                        {isStagnant && !isLivre && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <AlertTriangle size={9} /> STAGNANT
                          </span>
                        )}
                        {isNew && !isLivre && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                            NOUVEAU
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{e.client_name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        <span>{e.type_equipement}</span>
                        {e.marque && <><span className="text-slate-300">•</span><span>{e.marque}</span></>}
                        {e.puissance_kw && <><span className="text-slate-300">•</span><span>{e.puissance_kw} kW</span></>}
                      </div>
                      {dernierPassage && !isLivre && (
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock size={10} />
                          Dernier passage : {getTimeAgo(dernierPassage.passage_date)} · {dernierPassage.ateliers?.name}
                        </p>
                      )}
                      {isLivre && e.date_livraison_reelle && (
                        <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          Livré le {formatDate(e.date_livraison_reelle)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 sm:w-44">
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

                    <div className="flex items-center gap-1">
                      {!isLivre && (
                        <button
                          onClick={() => handleMarquerLivre(e.id)}
                          className="flex items-center gap-1 text-violet-700 hover:bg-violet-50 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition"
                          title="Marquer comme livré"
                        >
                          <Truck size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(e)}
                        className="flex items-center gap-1 text-blue-700 hover:bg-blue-50 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition"
                        title="Modifier"
                      >
                        <Edit3 size={14} />
                      </button>
                      {confirmDelete === e.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="text-red-600 text-xs font-semibold bg-red-50 hover:bg-red-100 rounded px-2 py-1 transition"
                          >
                            Confirmer
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="text-slate-400 hover:text-slate-600 p-1">
                            <X size={12} />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(e.id)}
                          className="text-red-400 hover:bg-red-50 rounded-lg px-2 py-1.5 text-xs font-medium transition"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : e.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 transition"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100 p-4">
                      <p className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1">
                        <History size={12} /> Historique complet ({historique.length} passages)
                      </p>
                      {historique.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Aucun passage enregistré. Utilisez le Journal pour ajouter une observation.</p>
                      ) : (
                        <div className="space-y-2">
                          {historique.map((p) => (
                            <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-3 flex gap-3 hover:shadow-sm transition">
                              {p.photo_url && (
                                <img src={p.photo_url} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-700">
                                    {p.ateliers?.name} {p.techniciens?.full_name ? `• ${p.techniciens.full_name}` : ""}
                                  </span>
                                  <span className="text-xs font-bold text-amber-700">{p.pourcentage}%</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(p.passage_date)}</p>
                                {p.commentaire && (
                                  <p className="text-xs text-slate-600 mt-1 italic">"{p.commentaire}"</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- MODALE CRÉATION --- */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-600" /> Nouvel équipement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Créer une nouvelle fiche dans le registre.</p>
              </div>
              <button onClick={closeCreate} className="text-slate-400 hover:text-slate-600 p-1 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Référence *</label>
                  <input
                    value={newForm.reference}
                    onChange={(e) => { setNewForm((f) => ({ ...f, reference: e.target.value })); setNewErrors((p) => ({ ...p, reference: "" })); }}
                    placeholder="Ex: REF-2025-001"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${newErrors.reference ? "border-red-400" : "border-slate-200"}`}
                  />
                  {newErrors.reference && <p className="text-xs text-red-600 mt-1">{newErrors.reference}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Client *</label>
                  <input
                    value={newForm.client_name}
                    onChange={(e) => { setNewForm((f) => ({ ...f, client_name: e.target.value })); setNewErrors((p) => ({ ...p, client_name: "" })); }}
                    placeholder="Nom du client"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${newErrors.client_name ? "border-red-400" : "border-slate-200"}`}
                  />
                  {newErrors.client_name && <p className="text-xs text-red-600 mt-1">{newErrors.client_name}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Type d'équipement *</label>
                <input
                  value={newForm.type_equipement}
                  onChange={(e) => { setNewForm((f) => ({ ...f, type_equipement: e.target.value })); setNewErrors((p) => ({ ...p, type_equipement: "" })); }}
                  placeholder="Ex: Moteur électrique"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${newErrors.type_equipement ? "border-red-400" : "border-slate-200"}`}
                />
                {newErrors.type_equipement && <p className="text-xs text-red-600 mt-1">{newErrors.type_equipement}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Marque</label>
                  <input
                    value={newForm.marque}
                    onChange={(e) => setNewForm((f) => ({ ...f, marque: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Puissance (kW)</label>
                  <input
                    type="number"
                    value={newForm.puissance_kw}
                    onChange={(e) => setNewForm((f) => ({ ...f, puissance_kw: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Opérateur</label>
                  <input
                    value={newForm.operateur}
                    onChange={(e) => setNewForm((f) => ({ ...f, operateur: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={closeCreate} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={newSaving}
                className="bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 shadow-sm transition"
              >
                {newSaving ? <><Loader2 className="animate-spin" size={14} /> Création...</> : <><Plus size={14} /> Créer l'équipement</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALE ÉDITION --- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 size={16} className="text-blue-600" /> Modifier l'équipement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Corrigez les informations.</p>
              </div>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 p-1 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Référence *</label>
                  <input
                    value={editForm.reference}
                    onChange={(e) => { setEditForm((f) => ({ ...f, reference: e.target.value })); setEditErrors((p) => ({ ...p, reference: "" })); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${editErrors.reference ? "border-red-400" : "border-slate-200"}`}
                  />
                  {editErrors.reference && <p className="text-xs text-red-600 mt-1">{editErrors.reference}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Client *</label>
                  <input
                    value={editForm.client_name}
                    onChange={(e) => { setEditForm((f) => ({ ...f, client_name: e.target.value })); setEditErrors((p) => ({ ...p, client_name: "" })); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${editErrors.client_name ? "border-red-400" : "border-slate-200"}`}
                  />
                  {editErrors.client_name && <p className="text-xs text-red-600 mt-1">{editErrors.client_name}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Type d'équipement *</label>
                <input
                  value={editForm.type_equipement}
                  onChange={(e) => { setEditForm((f) => ({ ...f, type_equipement: e.target.value })); setEditErrors((p) => ({ ...p, type_equipement: "" })); }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${editErrors.type_equipement ? "border-red-400" : "border-slate-200"}`}
                />
                {editErrors.type_equipement && <p className="text-xs text-red-600 mt-1">{editErrors.type_equipement}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Marque</label>
                  <input
                    value={editForm.marque}
                    onChange={(e) => setEditForm((f) => ({ ...f, marque: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Puissance (kW)</label>
                  <input
                    type="number"
                    value={editForm.puissance_kw}
                    onChange={(e) => setEditForm((f) => ({ ...f, puissance_kw: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Opérateur</label>
                  <input
                    value={editForm.operateur}
                    onChange={(e) => setEditForm((f) => ({ ...f, operateur: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={closeEdit} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 shadow-sm transition"
              >
                {editSaving ? <><Loader2 className="animate-spin" size={14} /> Enregistrement...</> : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}