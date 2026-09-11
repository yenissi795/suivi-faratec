import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Camera, X, Play, Square, Search, ChevronDown, ChevronUp,
  History, CheckCircle2, Clock, Package, Truck, Edit3, AlertTriangle,
  Filter, Loader2, Info, Plus, Sparkles
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
}
interface Atelier { id: string; name: string; }
interface Technicien { id: string; full_name: string; }
interface Tournee { id: string; started_at: string; ended_at: string | null; }
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  technicien_id: string | null;
  pourcentage: number;
  commentaire: string | null;
  photo_url: string | null;
  passage_date: string;
  tournee_id: string | null;
  ateliers: { name: string } | null;
  techniciens: { full_name: string } | null;
}

// --- UTILITAIRES ---
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

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

export default function JournalPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [tourneeActive, setTourneeActive] = useState<Tournee | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "not_seen_today" | "stagnant">("all");
  const [showLivre, setShowLivre] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- OBSERVATION ---
  const [selectedEquipement, setSelectedEquipement] = useState<Equipement | null>(null);
  const [atelierId, setAtelierId] = useState("");
  const [technicienId, setTechnicienId] = useState("");
  const [pourcentage, setPourcentage] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- ÉDITION ---
  const [editingEquipement, setEditingEquipement] = useState<Equipement | null>(null);
  const [editForm, setEditForm] = useState({
    reference: "", client_name: "", type_equipement: "",
    marque: "", puissance_kw: "", operateur: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  // --- CRÉATION ---
  const [creatingEquipement, setCreatingEquipement] = useState(false);
  const [newEqForm, setNewEqForm] = useState({
    reference: "", client_name: "", type_equipement: "",
    marque: "", puissance_kw: "", operateur: "",
  });
  const [newEqErrors, setNewEqErrors] = useState<Record<string, string>>({});
  const [newEqSaving, setNewEqSaving] = useState(false);

  // --- CHARGEMENT ---
  const load = async () => {
    setLoading(true);
    const [eqRes, atRes, techRes, passRes, tourneeRes] = await Promise.all([
      supabase.from("equipements").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("ateliers").select("id, name").order("name"),
      supabase.from("techniciens").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("journal_passages")
        .select("*, ateliers(name), techniciens(full_name)")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false })
        .limit(200),
      supabase.from("tournees").select("*").is("ended_at", null).order("started_at", { ascending: false }).limit(1),
    ]);

    setEquipements((eqRes.data as Equipement[]) || []);
    setAteliers((atRes.data as Atelier[]) || []);
    setTechniciens((techRes.data as Technicien[]) || []);
    setPassages((passRes.data as unknown as Passage[]) || []);
    setTourneeActive(tourneeRes.data && tourneeRes.data.length > 0 ? (tourneeRes.data[0] as Tournee) : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // --- RACCOURCI CLAVIER ÉCHAP ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEquipement) closeObservation();
        if (editingEquipement) closeEdit();
        if (creatingEquipement) closeCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEquipement, editingEquipement, creatingEquipement]);

  // --- STATISTIQUES DE TOURNÉE ---
  const statsTournee = useMemo(() => {
    if (!tourneeActive) return { count: 0, avgPct: 0, ateliersVisites: 0 };
    const passagesTournee = passages.filter((p) => p.tournee_id === tourneeActive.id);
    const avgPct = passagesTournee.length > 0
      ? Math.round(passagesTournee.reduce((acc, p) => acc + p.pourcentage, 0) / passagesTournee.length)
      : 0;
    const ateliersSet = new Set(passagesTournee.map((p) => p.atelier_id));
    return { count: passagesTournee.length, avgPct, ateliersVisites: ateliersSet.size };
  }, [tourneeActive, passages]);

  // --- MAP DERNIER PASSAGE ---
  const dernierPassageMap = useMemo(() => {
    const map = new Map<string, Passage>();
    passages.forEach((p) => {
      if (!map.has(p.equipement_id)) map.set(p.equipement_id, p);
    });
    return map;
  }, [passages]);

  // --- FILTRAGE INTELLIGENT ---
  const filteredEquipements = useMemo(() => {
    let list = equipements.filter((e) => e.statut !== "livre");

    if (filterMode === "not_seen_today") {
      const todayStr = new Date().toISOString().slice(0, 10);
      const seenTodayIds = new Set(
        passages.filter((p) => p.passage_date.slice(0, 10) === todayStr).map((p) => p.equipement_id)
      );
      list = list.filter((e) => !seenTodayIds.has(e.id));
    } else if (filterMode === "stagnant") {
      list = list.filter((e) => {
        const hist = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
        return hist.length >= 3 && hist.every((p) => p.pourcentage === hist[0].pourcentage);
      });
    }

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.client_name.toLowerCase().includes(s) ||
        (e.reference && e.reference.toLowerCase().includes(s)) ||
        e.type_equipement.toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => {
      const dateA = dernierPassageMap.get(a.id)?.passage_date || "1970-01-01";
      const dateB = dernierPassageMap.get(b.id)?.passage_date || "1970-01-01";
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    return list;
  }, [equipements, searchTerm, filterMode, passages, dernierPassageMap]);

  const equipementsLivres = useMemo(() => {
    let list = equipements.filter((e) => e.statut === "livre");
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.client_name.toLowerCase().includes(s) ||
        (e.reference && e.reference.toLowerCase().includes(s))
      );
    }
    return list;
  }, [equipements, searchTerm]);

  // --- TOURNÉE ---
  const handleStartTournee = async () => {
    if (!user) return;
    const { data } = await supabase.from("tournees").insert({ owner_id: user.id }).select().single();
    if (data) setTourneeActive(data as Tournee);
  };

  const handleEndTournee = async () => {
    if (!tourneeActive) return;
    await supabase.from("tournees").update({ ended_at: new Date().toISOString() }).eq("id", tourneeActive.id);
    setTourneeActive(null);
  };

  // --- CRÉATION D'ÉQUIPEMENT ---
  const openCreate = () => {
    setCreatingEquipement(true);
    setNewEqForm({ reference: "", client_name: "", type_equipement: "", marque: "", puissance_kw: "", operateur: "" });
    setNewEqErrors({});
  };

  const closeCreate = () => {
    setCreatingEquipement(false);
    setNewEqErrors({});
  };

  const handleCreateEquipement = async () => {
    if (!user) return;
    const errs: Record<string, string> = {};
    if (!newEqForm.reference.trim()) errs.reference = "Obligatoire";
    if (!newEqForm.client_name.trim()) errs.client_name = "Obligatoire";
    if (!newEqForm.type_equipement.trim()) errs.type_equipement = "Obligatoire";
    setNewEqErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setNewEqSaving(true);

    const { data, error } = await supabase.from("equipements").insert({
      reference: newEqForm.reference.trim(),
      client_name: newEqForm.client_name.trim(),
      type_equipement: newEqForm.type_equipement.trim(),
      marque: newEqForm.marque.trim() || null,
      puissance_kw: newEqForm.puissance_kw ? parseFloat(newEqForm.puissance_kw) : null,
      operateur: newEqForm.operateur.trim() || null,
      owner_id: user.id,
      statut: "en_attente",
      pourcentage_global: 0,
    }).select().single();

    if (error || !data) {
      setNewEqSaving(false);
      setNewEqErrors({ reference: "Erreur lors de la création. Vérifiez la référence (peut-être déjà utilisée)." });
      return;
    }

    const newEquipement = data as Equipement;

    // Mise à jour optimiste de la liste locale
    setEquipements((prev) => [newEquipement, ...prev]);
    setNewEqSaving(false);
    closeCreate();

    // Ouvre immédiatement la modale d'observation sur ce nouvel équipement
    openObservation(newEquipement);
  };

  // --- OBSERVATION ---
  const openObservation = (eq: Equipement) => {
    setSelectedEquipement(eq);
    setPourcentage(String(eq.pourcentage_global));
    setAtelierId("");
    setTechnicienId("");
    setCommentaire("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setErrors({});
  };

  const closeObservation = () => {
    setSelectedEquipement(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveObservation = async () => {
    if (!user || !selectedEquipement) return;
    const errs: Record<string, string> = {};
    if (!atelierId) errs.atelierId = "Requis";
    if (pourcentage === "") errs.pourcentage = "Requis";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    const newPct = Number(pourcentage);

    let photoUrl: string | null = null;
    if (photoFile) {
      const fileName = `${user.id}/${Date.now()}_${photoFile.name}`;
      const { data: uploadData } = await supabase.storage.from("journal-photos").upload(fileName, photoFile);
      if (uploadData) {
        const { data: urlData } = supabase.storage.from("journal-photos").getPublicUrl(uploadData.path);
        photoUrl = urlData.publicUrl;
      }
    }

    const optimisticPassage: Passage = {
      id: `temp-${Date.now()}`,
      equipement_id: selectedEquipement.id,
      atelier_id: atelierId,
      technicien_id: technicienId || null,
      pourcentage: newPct,
      commentaire: commentaire.trim() || null,
      photo_url: photoUrl,
      passage_date: new Date().toISOString(),
      tournee_id: tourneeActive?.id || null,
      ateliers: { name: ateliers.find((a) => a.id === atelierId)?.name || "" },
      techniciens: technicienId ? { full_name: techniciens.find((t) => t.id === technicienId)?.full_name || "" } : null,
    };

    setPassages((prev) => [optimisticPassage, ...prev]);
    setEquipements((prev) =>
      prev.map((e) =>
        e.id === selectedEquipement.id
          ? { ...e, pourcentage_global: newPct, statut: newPct >= 100 ? "termine" : "en_reparation" }
          : e
      )
    );

    await supabase.from("journal_passages").insert({
      owner_id: user.id,
      equipement_id: selectedEquipement.id,
      atelier_id: atelierId,
      technicien_id: technicienId || null,
      pourcentage: newPct,
      commentaire: commentaire.trim() || null,
      photo_url: photoUrl,
      tournee_id: tourneeActive?.id || null,
    });

    await supabase.from("equipements").update({
      pourcentage_global: newPct,
      statut: newPct >= 100 ? "termine" : "en_reparation",
    }).eq("id", selectedEquipement.id);

    setSaving(false);
    closeObservation();
  };

  const handleMarquerLivre = async (id: string) => {
    setEquipements((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, statut: "livre", date_livraison_reelle: new Date().toISOString().slice(0, 10) } : e
      )
    );
    await supabase.from("equipements").update({
      statut: "livre",
      date_livraison_reelle: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
  };

  // --- ÉDITION ---
  const openEdit = (eq: Equipement) => {
    setEditingEquipement(eq);
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

  const closeEdit = () => {
    setEditingEquipement(null);
    setEditErrors({});
  };

  const handleSaveEdit = async () => {
    if (!editingEquipement) return;
    const errs: Record<string, string> = {};
    if (!editForm.reference.trim()) errs.reference = "La référence est obligatoire.";
    if (!editForm.client_name.trim()) errs.client_name = "Le nom du client est obligatoire.";
    if (!editForm.type_equipement.trim()) errs.type_equipement = "Le type est obligatoire.";
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditSaving(true);

    const updated: Equipement = {
      ...editingEquipement,
      reference: editForm.reference.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: editForm.type_equipement.trim(),
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      operateur: editForm.operateur.trim() || null,
    };

    setEquipements((prev) => prev.map((e) => (e.id === editingEquipement.id ? updated : e)));

    await supabase.from("equipements").update({
      reference: editForm.reference.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: editForm.type_equipement.trim(),
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      operateur: editForm.operateur.trim() || null,
    }).eq("id", editingEquipement.id);

    setEditSaving(false);
    closeEdit();
  };

  const getHistorique = (equipementId: string) =>
    passages.filter((p) => p.equipement_id === equipementId);

  return (
    <div className="space-y-5">
      {/* --- EN-TÊTE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Journal / Tournée</h1>
          <p className="text-sm text-slate-500">Suivi intelligent des passages en atelier.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bouton Nouvel équipement */}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition"
          >
            <Plus size={16} /> Nouvel équipement
          </button>

          {tourneeActive ? (
            <div className="flex items-center gap-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <div className="text-xs">
                <p className="font-bold text-green-800">Tournée en cours</p>
                <p className="text-green-600">
                  Depuis {formatTime(tourneeActive.started_at)} · {statsTournee.count} passages
                </p>
              </div>
              <button
                onClick={handleEndTournee}
                className="ml-2 flex items-center gap-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              >
                <Square size={12} /> Terminer
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartTournee}
              className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-md hover:shadow-lg transition-all"
            >
              <Play size={16} /> Démarrer la tournée
            </button>
          )}
        </div>
      </div>

      {/* --- KPIs DE TOURNÉE --- */}
      {tourneeActive && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Passages</p>
            <p className="text-xl font-bold text-slate-800">{statsTournee.count}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-blue-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Ateliers visités</p>
            <p className="text-xl font-bold text-slate-800">{statsTournee.ateliersVisites}/{ateliers.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-violet-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">% moyen</p>
            <p className="text-xl font-bold text-slate-800">{statsTournee.avgPct}%</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Durée</p>
            <p className="text-xl font-bold text-slate-800">
              {Math.floor((Date.now() - new Date(tourneeActive.started_at).getTime()) / 3600000)}h
            </p>
          </div>
        </div>
      )}

      {/* --- BARRE DE RECHERCHE + FILTRES --- */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par client, référence ou type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterMode("all")}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
              filterMode === "all" ? "bg-amber-500 text-neutral-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Filter size={12} /> Tous ({equipements.filter((e) => e.statut !== "livre").length})
          </button>
          <button
            onClick={() => setFilterMode("not_seen_today")}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
              filterMode === "not_seen_today" ? "bg-amber-500 text-neutral-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Clock size={12} /> Non vus aujourd'hui
          </button>
          <button
            onClick={() => setFilterMode("stagnant")}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
              filterMode === "stagnant" ? "bg-amber-500 text-neutral-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <AlertTriangle size={12} /> Stagnants
          </button>
        </div>
      </div>

      {/* --- LISTE PRINCIPALE --- */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Package size={16} className="text-amber-600" />
            Équipements en attente
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
              {filteredEquipements.length}
            </span>
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
            <button
              onClick={openCreate}
              className="mt-3 inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 text-xs font-semibold"
            >
              <Plus size={12} /> Créer le premier équipement
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEquipements.map((e) => {
              const isExpanded = expandedId === e.id;
              const historique = getHistorique(e.id);
              const dernierPassage = dernierPassageMap.get(e.id);
              const history3 = historique.slice(0, 3);
              const isStagnant = history3.length >= 3 && history3.every((p) => p.pourcentage === history3[0].pourcentage);
              const isNew = historique.length === 0;

              return (
                <div key={e.id} className="hover:bg-slate-50/40 transition">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">
                          {e.reference || "Sans réf."}
                        </span>
                        <span className="text-sm text-slate-600">• {e.client_name}</span>
                        {isStagnant && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <AlertTriangle size={9} /> STAGNANT
                          </span>
                        )}
                        {isNew && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                            NOUVEAU
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{e.type_equipement}</p>
                      {dernierPassage && (
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock size={10} />
                          Dernier passage : {getTimeAgo(dernierPassage.passage_date)} · {dernierPassage.ateliers?.name}
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

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openObservation(e)}
                        className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-sm transition"
                      >
                        <Edit3 size={12} /> Observation
                      </button>
                      <button
                        onClick={() => openEdit(e)}
                        className="flex items-center gap-1 text-blue-700 hover:bg-blue-50 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition"
                        title="Modifier les informations"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleMarquerLivre(e.id)}
                        className="flex items-center gap-1 text-violet-700 hover:bg-violet-50 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition"
                        title="Marquer comme livré"
                      >
                        <Truck size={12} />
                      </button>
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
                        <History size={12} /> Historique ({historique.length} passages)
                      </p>
                      {historique.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Aucun passage enregistré.</p>
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
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {formatDate(p.passage_date)} à {formatTime(p.passage_date)}
                                </p>
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

      {/* --- SECTION LIVRÉS --- */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowLivre(!showLivre)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
        >
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" />
            Équipements livrés
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
              {equipementsLivres.length}
            </span>
          </h2>
          {showLivre ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>

        {showLivre && (
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {equipementsLivres.length === 0 ? (
              <p className="text-sm text-slate-400 p-4 italic">Aucun équipement livré pour l'instant.</p>
            ) : (
              equipementsLivres.map((e) => (
                <div key={e.id} className="p-4 flex items-center justify-between hover:bg-slate-50/40 transition">
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {e.reference || "Sans réf."} — {e.client_name}
                    </p>
                    <p className="text-xs text-slate-500">{e.type_equipement}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                      LIVRÉ
                    </span>
                    {e.date_livraison_reelle && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatDate(e.date_livraison_reelle)}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* --- MODALE DE CRÉATION --- */}
      {creatingEquipement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-600" />
                  Nouvel équipement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Créez la fiche, puis enregistrez immédiatement une observation.
                </p>
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
                    value={newEqForm.reference}
                    onChange={(e) => { setNewEqForm((f) => ({ ...f, reference: e.target.value })); setNewEqErrors((p) => ({ ...p, reference: "" })); }}
                    placeholder="Ex: REF-2025-001"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${newEqErrors.reference ? "border-red-400" : "border-slate-200"}`}
                  />
                  {newEqErrors.reference && <p className="text-xs text-red-600 mt-1">{newEqErrors.reference}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Client *</label>
                  <input
                    value={newEqForm.client_name}
                    onChange={(e) => { setNewEqForm((f) => ({ ...f, client_name: e.target.value })); setNewEqErrors((p) => ({ ...p, client_name: "" })); }}
                    placeholder="Nom du client"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${newEqErrors.client_name ? "border-red-400" : "border-slate-200"}`}
                  />
                  {newEqErrors.client_name && <p className="text-xs text-red-600 mt-1">{newEqErrors.client_name}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Type d'équipement *</label>
                <input
                  value={newEqForm.type_equipement}
                  onChange={(e) => { setNewEqForm((f) => ({ ...f, type_equipement: e.target.value })); setNewEqErrors((p) => ({ ...p, type_equipement: "" })); }}
                  placeholder="Ex: Moteur électrique, Pompe, etc."
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${newEqErrors.type_equipement ? "border-red-400" : "border-slate-200"}`}
                />
                {newEqErrors.type_equipement && <p className="text-xs text-red-600 mt-1">{newEqErrors.type_equipement}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Marque</label>
                  <input
                    value={newEqForm.marque}
                    onChange={(e) => setNewEqForm((f) => ({ ...f, marque: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Puissance (kW)</label>
                  <input
                    type="number"
                    value={newEqForm.puissance_kw}
                    onChange={(e) => setNewEqForm((f) => ({ ...f, puissance_kw: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Opérateur</label>
                  <input
                    value={newEqForm.operateur}
                    onChange={(e) => setNewEqForm((f) => ({ ...f, operateur: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Après la création, la fenêtre d'observation s'ouvrira automatiquement pour enregistrer le premier passage.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={closeCreate} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
                Annuler
              </button>
              <button
                onClick={handleCreateEquipement}
                disabled={newEqSaving}
                className="bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 shadow-sm transition"
              >
                {newEqSaving ? <><Loader2 className="animate-spin" size={14} /> Création...</> : <><Plus size={14} /> Créer & observer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALE D'OBSERVATION --- */}
      {selectedEquipement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeObservation} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  {selectedEquipement.reference || "Sans réf."}
                  <span className="text-xs font-normal text-slate-500">— {selectedEquipement.client_name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedEquipement.type_equipement}</p>
              </div>
              <button onClick={closeObservation} className="text-slate-400 hover:text-slate-600 p-1 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Atelier *</label>
                  <select
                    value={atelierId}
                    onChange={(e) => { setAtelierId(e.target.value); setErrors((p) => ({ ...p, atelierId: "" })); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errors.atelierId ? "border-red-400" : "border-slate-200"}`}
                  >
                    <option value="">Sélectionner</option>
                    {ateliers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {errors.atelierId && <p className="text-xs text-red-600 mt-1">{errors.atelierId}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Technicien</label>
                  <select
                    value={technicienId}
                    onChange={(e) => setTechnicienId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="">Optionnel</option>
                    {techniciens.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Pourcentage d'avancement *</label>
                <input
                  type="number" min={0} max={100}
                  value={pourcentage}
                  onChange={(e) => { setPourcentage(e.target.value); setErrors((p) => ({ ...p, pourcentage: "" })); }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errors.pourcentage ? "border-red-400" : "border-slate-200"}`}
                />
                {errors.pourcentage && <p className="text-xs text-red-600 mt-1">{errors.pourcentage}</p>}
                <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${getProgressColor(Number(pourcentage) || 0)}`}
                    style={{ width: `${Number(pourcentage) || 0}%` }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Commentaire</label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={3}
                  placeholder="Détails sur l'intervention..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Photo</label>
                {photoPreview ? (
                  <div className="relative w-32">
                    <img src={photoPreview} alt="Aperçu" className="w-32 h-32 object-cover rounded-lg" />
                    <button
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                      className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md hover:bg-red-50 transition"
                    >
                      <X size={14} className="text-red-500" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg py-6 cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition">
                    <Camera size={20} className="text-slate-400" />
                    <span className="text-xs text-slate-500">Prendre ou choisir une photo</span>
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={closeObservation} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
                Annuler
              </button>
              <button
                onClick={handleSaveObservation}
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 shadow-sm transition"
              >
                {saving ? <><Loader2 className="animate-spin" size={14} /> Enregistrement...</> : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALE D'ÉDITION --- */}
      {editingEquipement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 size={16} className="text-blue-600" />
                  Modifier l'équipement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Corrigez les informations erronées.</p>
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