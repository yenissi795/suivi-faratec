import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Package, Plus, Search, Edit3, Truck, Trash2, X, Loader2,
  Clock, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, History,
  Sparkles, Filter, ZoomIn, Zap, Calculator
} from "lucide-react";

// --- TYPES ---
interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  code_faratec: string | null;
  marque: string | null;
  puissance_kw: number | null;
  operateur: string | null;
  pourcentage_global: number;
  statut: string;
  date_livraison_reelle: string | null;
  created_at: string;
  ndi_da_ns: string | null;
  mle_reference: string | null;
  tension: string | null;
  vitesse: string | null;
  nature_travaux: string | null;
  urgence: string | null;
  semaine_entree: number | null;
}
interface TypeEquipement {
  id: string;
  name: string;
}
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  operateur_id: string | null;
  pourcentage: number;
  commentaire: string | null;
  photo_url: string | null;
  passage_date: string;
  ateliers: { name: string } | null;
  operateurs: { full_name: string } | null;
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

const EMPTY_FORM = {
  code_faratec: "", client_name: "", type_equipement: "",
  ndi_da_ns: "", mle_reference: "", marque: "",
  puissance_kw: "", tension: "", vitesse: "",
  operateur: "", urgence: "normal", nature_travaux: "",
};

export default function EquipementsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [typesEquipement, setTypesEquipement] = useState<TypeEquipement[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "en_cours" | "livres" | "stagnant" | "urgent">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  // --- CRÉATION ---
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_FORM });
  const [newCustomType, setNewCustomType] = useState("");
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});
  const [newSaving, setNewSaving] = useState(false);

  // --- ÉDITION ---
  const [editing, setEditing] = useState<Equipement | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [editCustomType, setEditCustomType] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  // --- CHARGEMENT ---
  const load = async () => {
    setLoading(true);
    const [eqRes, passRes, typesRes] = await Promise.all([
      supabase.from("equipements").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("journal_passages")
        .select("id, equipement_id, atelier_id, operateur_id, pourcentage, commentaire, photo_url, passage_date, ateliers(name), operateurs(full_name)")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false }),
      supabase.from("types_equipement").select("id, name").order("name"),
    ]);
    setEquipements((eqRes.data as Equipement[]) || []);
    setPassages((passRes.data as unknown as Passage[]) || []);
    setTypesEquipement((typesRes.data as TypeEquipement[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomedPhoto) setZoomedPhoto(null);
        else if (creating) closeCreate();
        else if (editing) closeEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, editing, zoomedPhoto]);

  const dernierPassageMap = useMemo(() => {
    const map = new Map<string, Passage>();
    passages.forEach((p) => {
      if (!map.has(p.equipement_id)) map.set(p.equipement_id, p);
    });
    return map;
  }, [passages]);

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

  const stats = useMemo(() => {
    const total = equipements.length;
    const enCours = equipements.filter((e) => e.statut !== "livre").length;
    const livres = equipements.filter((e) => e.statut === "livre").length;
    const stagnants = stagnantIds.size;
    const urgents = equipements.filter((e) => e.urgence === "urgent" && e.statut !== "livre").length;
    return { total, enCours, livres, stagnants, urgents };
  }, [equipements, stagnantIds]);

  const filteredEquipements = useMemo(() => {
    let list = [...equipements];

    if (filterMode === "en_cours") list = list.filter((e) => e.statut !== "livre");
    else if (filterMode === "livres") list = list.filter((e) => e.statut === "livre");
    else if (filterMode === "stagnant") list = list.filter((e) => stagnantIds.has(e.id));
    else if (filterMode === "urgent") list = list.filter((e) => e.urgence === "urgent" && e.statut !== "livre");

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.client_name.toLowerCase().includes(s) ||
        (e.code_faratec && e.code_faratec.toLowerCase().includes(s)) ||
        e.type_equipement.toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => {
      if (a.statut === "livre" && b.statut !== "livre") return 1;
      if (a.statut !== "livre" && b.statut === "livre") return -1;
      const dateA = dernierPassageMap.get(a.id)?.passage_date || "1970-01-01";
      const dateB = dernierPassageMap.get(b.id)?.passage_date || "1970-01-01";
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    return list;
  }, [equipements, filterMode, searchTerm, stagnantIds, dernierPassageMap]);

  // --- GESTION DES TYPES ---
  const handleCreateTypeIfNeeded = async (typeName: string): Promise<string> => {
    if (!user || !typeName.trim()) return typeName.trim();
    const existing = typesEquipement.find((t) => t.name.toLowerCase() === typeName.trim().toLowerCase());
    if (existing) return existing.name;
    const { data } = await supabase.from("types_equipement").insert({
      name: typeName.trim(),
      owner_id: user.id,
    }).select().single();
    if (data) {
      setTypesEquipement((prev) => [...prev, data as TypeEquipement].sort((a, b) => a.name.localeCompare(b.name)));
      return (data as TypeEquipement).name;
    }
    return typeName.trim();
  };

  // --- CRÉATION ---
  const openCreate = () => {
    setCreating(true);
    setNewForm({ ...EMPTY_FORM });
    setNewCustomType("");
    setNewErrors({});
  };
  const closeCreate = () => { setCreating(false); setNewErrors({}); setNewCustomType(""); };

  const handleCreate = async () => {
    if (!user) return;
    const errs: Record<string, string> = {};
    if (!newForm.code_faratec.trim()) errs.code_faratec = "Obligatoire";
    if (!newForm.client_name.trim()) errs.client_name = "Obligatoire";
    const finalType = newForm.type_equipement === "__autre__" ? newCustomType : newForm.type_equipement;
    if (!finalType.trim()) errs.type_equipement = "Obligatoire";
    setNewErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setNewSaving(true);
    const typeFinalName = await handleCreateTypeIfNeeded(finalType);

    const d = new Date();
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const semaine = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

    const { data, error } = await supabase.from("equipements").insert({
      code_faratec: newForm.code_faratec.trim(),
      client_name: newForm.client_name.trim(),
      type_equipement: typeFinalName,
      ndi_da_ns: newForm.ndi_da_ns.trim() || null,
      mle_reference: newForm.mle_reference.trim() || null,
      marque: newForm.marque.trim() || null,
      puissance_kw: newForm.puissance_kw ? parseFloat(newForm.puissance_kw) : null,
      tension: newForm.tension.trim() || null,
      vitesse: newForm.vitesse.trim() || null,
      operateur: newForm.operateur.trim() || null,
      urgence: newForm.urgence || "normal",
      nature_travaux: newForm.nature_travaux.trim() || null,
      owner_id: user.id,
      statut: "en_attente",
      pourcentage_global: 0,
      semaine_entree: semaine,
    }).select().single();

    if (error || !data) {
      setNewSaving(false);
      setNewErrors({ code_faratec: "Erreur : ce code existe peut-être déjà." });
      return;
    }
    setEquipements((prev) => [data as Equipement, ...prev]);
    setNewSaving(false);
    closeCreate();
  };

  // --- ÉDITION ---
  const openEdit = (eq: Equipement) => {
    setEditing(eq);
    const isKnownType = typesEquipement.some((t) => t.name === eq.type_equipement);
    setEditForm({
      code_faratec: eq.code_faratec || "",
      client_name: eq.client_name || "",
      type_equipement: isKnownType ? eq.type_equipement : "__autre__",
      ndi_da_ns: eq.ndi_da_ns || "",
      mle_reference: eq.mle_reference || "",
      marque: eq.marque || "",
      puissance_kw: eq.puissance_kw ? String(eq.puissance_kw) : "",
      tension: eq.tension || "",
      vitesse: eq.vitesse || "",
      operateur: eq.operateur || "",
      urgence: eq.urgence || "normal",
      nature_travaux: eq.nature_travaux || "",
    });
    setEditCustomType(isKnownType ? "" : (eq.type_equipement || ""));
    setEditErrors({});
  };
  const closeEdit = () => { setEditing(null); setEditErrors({}); setEditCustomType(""); };

  const handleSaveEdit = async () => {
    if (!editing || !user) return;
    const errs: Record<string, string> = {};
    if (!editForm.code_faratec.trim()) errs.code_faratec = "Obligatoire";
    if (!editForm.client_name.trim()) errs.client_name = "Obligatoire";
    const finalType = editForm.type_equipement === "__autre__" ? editCustomType : editForm.type_equipement;
    if (!finalType.trim()) errs.type_equipement = "Obligatoire";
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditSaving(true);
    const typeFinalName = await handleCreateTypeIfNeeded(finalType);

    const updated: Equipement = {
      ...editing,
      code_faratec: editForm.code_faratec.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: typeFinalName,
      ndi_da_ns: editForm.ndi_da_ns.trim() || null,
      mle_reference: editForm.mle_reference.trim() || null,
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      tension: editForm.tension.trim() || null,
      vitesse: editForm.vitesse.trim() || null,
      operateur: editForm.operateur.trim() || null,
      urgence: editForm.urgence || "normal",
      nature_travaux: editForm.nature_travaux.trim() || null,
    };
    setEquipements((prev) => prev.map((e) => (e.id === editing.id ? updated : e)));

    await supabase.from("equipements").update({
      code_faratec: editForm.code_faratec.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: typeFinalName,
      ndi_da_ns: editForm.ndi_da_ns.trim() || null,
      mle_reference: editForm.mle_reference.trim() || null,
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      tension: editForm.tension.trim() || null,
      vitesse: editForm.vitesse.trim() || null,
      operateur: editForm.operateur.trim() || null,
      urgence: editForm.urgence || "normal",
      nature_travaux: editForm.nature_travaux.trim() || null,
    }).eq("id", editing.id);

    setEditSaving(false);
    closeEdit();
  };

  // --- LIVRER ---
  const handleMarquerLivre = async (id: string) => {
    const eq = equipements.find((e) => e.id === id);
    if (!eq || eq.pourcentage_global < 100) return;
    const dateIso = new Date().toISOString().slice(0, 10);
    setEquipements((prev) =>
      prev.map((e) => (e.id === id ? { ...e, statut: "livre", date_livraison_reelle: dateIso } : e))
    );
    await supabase.from("equipements").update({
      statut: "livre",
      date_livraison_reelle: dateIso,
    }).eq("id", id);
  };

  const handleDelete = async (id: string) => {
    setEquipements((prev) => prev.filter((e) => e.id !== id));
    setConfirmDelete(null);
    await supabase.from("equipements").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  const getHistorique = (eqId: string) => passages.filter((p) => p.equipement_id === eqId);

  // --- RENDU FORMULAIRE ---
  const renderFormFields = (
    form: typeof EMPTY_FORM,
    setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>,
    customType: string,
    setCustomType: React.Dispatch<React.SetStateAction<string>>,
    errors: Record<string, string>
  ) => (
    <div className="space-y-5">
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3">Informations principales</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Code Faratec *</label>
            <input
              value={form.code_faratec}
              onChange={(e) => setForm((f) => ({ ...f, code_faratec: e.target.value }))}
              placeholder="Ex: 12744"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errors.code_faratec ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.code_faratec && <p className="text-xs text-red-600 mt-1">{errors.code_faratec}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Client *</label>
            <input
              value={form.client_name}
              onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
              placeholder="Nom du client"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errors.client_name ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.client_name && <p className="text-xs text-red-600 mt-1">{errors.client_name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Type d'équipement *</label>
            <select
              value={form.type_equipement}
              onChange={(e) => { setForm((f) => ({ ...f, type_equipement: e.target.value })); setCustomType(""); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errors.type_equipement ? "border-red-400" : "border-slate-200"}`}
            >
              <option value="">-- Sélectionner --</option>
              {typesEquipement.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
              <option value="__autre__">+ Autre (saisir)</option>
            </select>
            {form.type_equipement === "__autre__" && (
              <input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Nouveau type d'équipement..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-2 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            )}
            {errors.type_equipement && <p className="text-xs text-red-600 mt-1">{errors.type_equipement}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Urgence</label>
            <select
              value={form.urgence}
              onChange={(e) => setForm((f) => ({ ...f, urgence: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="normal">Normal</option>
              <option value="urgent">🔴 Urgent</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3">Informations techniques</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">NDI / DA / NS</label>
            <input
              value={form.ndi_da_ns}
              onChange={(e) => setForm((f) => ({ ...f, ndi_da_ns: e.target.value }))}
              placeholder="Non disponible"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">MLE / Référence</label>
            <input
              value={form.mle_reference}
              onChange={(e) => setForm((f) => ({ ...f, mle_reference: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Marque</label>
            <input
              value={form.marque}
              onChange={(e) => setForm((f) => ({ ...f, marque: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Puissance (kW)</label>
            <input
              type="number"
              value={form.puissance_kw}
              onChange={(e) => setForm((f) => ({ ...f, puissance_kw: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Tension</label>
            <input
              value={form.tension}
              onChange={(e) => setForm((f) => ({ ...f, tension: e.target.value }))}
              placeholder="Ex: 380V"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Vitesse</label>
            <input
              value={form.vitesse}
              onChange={(e) => setForm((f) => ({ ...f, vitesse: e.target.value }))}
              placeholder="Ex: 1500 tr/min"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3">Détails</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Opérateur</label>
            <input
              value={form.operateur}
              onChange={(e) => setForm((f) => ({ ...f, operateur: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Nature des travaux</label>
            <input
              value={form.nature_travaux}
              onChange={(e) => setForm((f) => ({ ...f, nature_travaux: e.target.value }))}
              placeholder="Optionnel (modifiable plus tard)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
          onClick={() => setFilterMode("urgent")}
          className={`text-left bg-white rounded-xl p-3 shadow-sm border-l-4 border-red-600 hover:shadow-md transition ${filterMode === "urgent" ? "ring-2 ring-amber-400" : ""}`}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <Zap size={10} className="text-red-500" /> Urgents
          </p>
          <p className="text-xl font-bold text-slate-800">{stats.urgents}</p>
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
            placeholder="Rechercher par code faratec, client ou type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        {filterMode !== "all" && (
          <div className="mt-2 flex items-center gap-2">
            <Filter size={12} className="text-slate-400" />
            <span className="text-xs text-slate-500">
              Filtre actif : <strong>{
                filterMode === "en_cours" ? "En cours"
                : filterMode === "livres" ? "Livrés"
                : filterMode === "urgent" ? "Urgents"
                : "Stagnants"
              }</strong>
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
              const canLivrer = e.pourcentage_global >= 100;
              const isUrgent = e.urgence === "urgent";

              return (
                <div key={e.id} className={`transition ${isLivre ? "bg-slate-50/40" : isUrgent ? "bg-red-50/30" : "hover:bg-slate-50/40"}`}>
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isUrgent && !isLivre && (
                          <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Zap size={9} /> URGENT
                          </span>
                        )}
                        <span className="font-bold text-slate-800 text-base">
                          {e.code_faratec || "Sans code"}
                        </span>
                        {isLivre && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                            LIVRÉ
                          </span>
                        )}
                        {isStagnant && !isLivre && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <AlertTriangle size={9} /> STAGNANT                          </span>
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
                        {e.mle_reference && <><span className="text-slate-300">•</span><span>MLE: {e.mle_reference}</span></>}
                        {e.marque && <><span className="text-slate-300">•</span><span>{e.marque}</span></>}
                        {e.puissance_kw && <><span className="text-slate-300">•</span><span>{e.puissance_kw} kW</span></>}
                        {e.tension && <><span className="text-slate-300">•</span><span>{e.tension}</span></>}
                        {e.vitesse && <><span className="text-slate-300">•</span><span>{e.vitesse}</span></>}
                      </div>
                      {e.ndi_da_ns && (
                        <p className="text-[10px] text-slate-400 mt-0.5">NDI/DA/NS: {e.ndi_da_ns}</p>
                      )}
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
                      {!isLivre && e.semaine_entree && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Entrée semaine {e.semaine_entree}</p>
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
                      <button
                        onClick={() => navigate(`/couts?eq=${e.id}`)}
                        className="text-emerald-700 hover:bg-emerald-50 rounded-lg px-2 py-1.5 text-xs font-medium transition"
                        title="Calcul des coûts"
                      >
                        <Calculator size={14} />
                      </button>
                      <button
                        onClick={() => canLivrer && handleMarquerLivre(e.id)}
                        disabled={!canLivrer}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                          canLivrer
                            ? "text-violet-700 hover:bg-violet-50"
                            : "text-slate-300 cursor-not-allowed"
                        }`}
                        title={canLivrer ? "Marquer comme livré" : `Impossible : équipement à ${e.pourcentage_global}% (100% requis)`}
                      >
                        <Truck size={14} />
                      </button>
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
                                <button
                                  onClick={() => setZoomedPhoto(p.photo_url)}
                                  className="relative group shrink-0"
                                  title="Cliquer pour agrandir"
                                >
                                  <img src={p.photo_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-lg flex items-center justify-center transition">
                                    <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition" />
                                  </div>
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-700">
                                    {p.ateliers?.name} {p.operateurs?.full_name ? `• ${p.operateurs.full_name}` : ""}
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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

            <div className="p-5">
              {renderFormFields(newForm, setNewForm, newCustomType, setNewCustomType, newErrors)}
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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

            <div className="p-5">
              {renderFormFields(editForm, setEditForm, editCustomType, setEditCustomType, editErrors)}
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

      {/* --- MODALE PHOTO ZOOM --- */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setZoomedPhoto(null)}
        >
          <button
            onClick={() => setZoomedPhoto(null)}
            className="absolute top-4 right-4 text-white hover:text-amber-400 transition p-2 bg-black/50 rounded-full"
          >
            <X size={24} />
          </button>
          <img
            src={zoomedPhoto}
            alt="Photo agrandie"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}