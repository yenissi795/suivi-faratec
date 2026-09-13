import { useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Camera, X, Play, Square, Search, ChevronDown, ChevronUp,
  History, CheckCircle2, Clock, Package, Truck, Edit3, AlertTriangle,
  Filter, Loader2, Plus, Sparkles, ZoomIn, Wrench, Zap, PlusCircle,
  Hourglass, PlayCircle, Flag, Timer, CalendarClock, StopCircle, User,
  Calculator,
} from "lucide-react";
import SearchableSelect from "../components/SearchableSelect";
import { calculerTempsTravail, formatDureeMinutes, getSessionAutoCloseDate } from "../lib/workTime";
import { analyserEquipement, type CoefficientTravail } from "../lib/optimization";

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
  semaine_entree: number | null;
  urgence: string | null;
  ndi_da_ns: string | null;
  mle_reference: string | null;
  tension: string | null;
  vitesse: string | null;
  nature_travaux: string | null;
  created_at: string;
  date_debut_intervention: string | null;
  date_fin_intervention: string | null;
}
interface Atelier { id: string; name: string; }
interface Operateur { id: string; full_name: string; }
interface TypeTravail { id: string; name: string; code: string | null; }
interface TypeEquipement { id: string; name: string; }
interface NatureTravaux { id: string; name: string; }
interface Tournee { id: string; started_at: string; ended_at: string | null; }
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  operateur_id: string | null;
  type_travail_id: string | null;
  pourcentage: number;
  commentaire: string | null;
  photo_url: string | null;
  passage_date: string;
  tournee_id: string | null;
  ateliers: { name: string } | null;
  operateurs: { full_name: string } | null;
  types_travaux: { name: string; code: string | null } | null;
}
interface SessionOperateur {
  id: string;
  equipement_id: string;
  operateur_id: string;
  atelier_id: string | null;
  started_at: string;
  ended_at: string | null;
  operateurs: { full_name: string } | null;
  ateliers: { name: string } | null;
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

const getDaysBetween = (from: string, to: string | null): number => {
  const endDate = to ? new Date(to) : new Date();
  const startDate = new Date(from);
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000));
};

const getProgressColor = (p: number) => {
  if (p < 30) return "bg-red-500";
  if (p < 70) return "bg-amber-500";
  return "bg-green-500";
};

const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

type StatutKey = "en_attente" | "en_cours" | "termine" | "livre";

const getStatutInfo = (statut: string, pourcentage: number): { key: StatutKey; label: string; color: string; icon: any } => {
  if (statut === "livre") return { key: "livre", label: "LIVRÉ", color: "bg-slate-600 text-white", icon: CheckCircle2 };
  if (pourcentage >= 100) return { key: "termine", label: "TERMINÉ", color: "bg-green-600 text-white", icon: Flag };
  if (pourcentage > 0) return { key: "en_cours", label: "EN COURS", color: "bg-blue-600 text-white", icon: PlayCircle };
  return { key: "en_attente", label: "EN ATTENTE", color: "bg-amber-500 text-white", icon: Hourglass };
};

const EMPTY_NEW_EQ = {
  code_faratec: "", client_name: "", type_equipement: "",
  ndi_da_ns: "", mle_reference: "", marque: "",
  puissance_kw: "", tension: "", vitesse: "",
  operateur: "", urgence: "normal", nature_travaux: "",
};

export default function JournalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingIntervention, setSavingIntervention] = useState(false);
  const [stoppingSession, setStoppingSession] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [typesTravaux, setTypesTravaux] = useState<TypeTravail[]>([]);
  const [typesEquipement, setTypesEquipement] = useState<TypeEquipement[]>([]);
  const [naturesTravaux, setNaturesTravaux] = useState<NatureTravaux[]>([]);
  const [coefficients, setCoefficients] = useState<CoefficientTravail[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [sessions, setSessions] = useState<SessionOperateur[]>([]);
  const [tourneeActive, setTourneeActive] = useState<Tournee | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "en_attente" | "en_cours" | "termine" | "not_seen_today" | "stagnant">("all");
  const [showLivre, setShowLivre] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [selectedEquipement, setSelectedEquipement] = useState<Equipement | null>(null);
  const [atelierId, setAtelierId] = useState("");
  const [operateurId, setOperateurId] = useState("");
  const [typeTravailId, setTypeTravailId] = useState("");
  const [pourcentage, setPourcentage] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [editingEquipement, setEditingEquipement] = useState<Equipement | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_NEW_EQ });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  const [creatingEquipement, setCreatingEquipement] = useState(false);
  const [newEqForm, setNewEqForm] = useState({ ...EMPTY_NEW_EQ });
  const [newEqErrors, setNewEqErrors] = useState<Record<string, string>>({});
  const [newEqSaving, setNewEqSaving] = useState(false);

  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  // --- HORLOGE ---
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // --- CHARGEMENT ---
  const load = async () => {
    setLoading(true);
    const [eqRes, atRes, opRes, ttRes, teRes, ntRes, coefRes, passRes, tourneeRes, sessRes] = await Promise.all([
      supabase.from("equipements").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("ateliers").select("id, name").order("name"),
      supabase.from("operateurs").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("types_travaux").select("id, name, code").order("name"),
      supabase.from("types_equipement").select("id, name").order("name"),
      supabase.from("natures_travaux").select("id, name").order("name"),
      supabase.from("coefficients_travaux").select("id, type_travail, puissance_min, puissance_max, temps_attendu_jours, tolerance_pourcentage"),
      supabase.from("journal_passages")
        .select("*, ateliers(name), operateurs(full_name), types_travaux(name, code)")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false })
        .limit(200),
      supabase.from("tournees").select("*").is("ended_at", null).order("started_at", { ascending: false }).limit(1),
      supabase.from("interventions_operateurs")
        .select("*, operateurs(full_name), ateliers(name)")
        .order("started_at", { ascending: false })
        .limit(500),
    ]);

    setEquipements((eqRes.data as Equipement[]) || []);
    setAteliers((atRes.data as Atelier[]) || []);
    setOperateurs((opRes.data as Operateur[]) || []);
    setTypesTravaux((ttRes.data as TypeTravail[]) || []);
    setTypesEquipement((teRes.data as TypeEquipement[]) || []);
    setNaturesTravaux((ntRes.data as NatureTravaux[]) || []);
    setCoefficients((coefRes.data as CoefficientTravail[]) || []);
    setPassages((passRes.data as unknown as Passage[]) || []);

    let allSessions = (sessRes.data as unknown as SessionOperateur[]) || [];

    // Fermeture auto des sessions orphelines
    const orphelines = allSessions.filter((s) => !s.ended_at && getSessionAutoCloseDate(s.started_at) !== null);
    if (orphelines.length > 0) {
      for (const s of orphelines) {
        const autoCloseDate = getSessionAutoCloseDate(s.started_at);
        if (autoCloseDate) {
          await supabase.from("interventions_operateurs").update({ ended_at: autoCloseDate }).eq("id", s.id);
          s.ended_at = autoCloseDate;
        }
      }
    }

    setSessions(allSessions);
    setTourneeActive(tourneeRes.data && tourneeRes.data.length > 0 ? (tourneeRes.data[0] as Tournee) : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomedPhoto) setZoomedPhoto(null);
        else if (selectedEquipement) closeObservation();
        else if (editingEquipement) closeEdit();
        else if (creatingEquipement) closeCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEquipement, editingEquipement, creatingEquipement, zoomedPhoto]);

  // --- STATS ---
  const statsTournee = useMemo(() => {
    if (!tourneeActive) return { count: 0, avgPct: 0, ateliersVisites: 0 };
    const passagesTournee = passages.filter((p) => p.tournee_id === tourneeActive.id);
    const avgPct = passagesTournee.length > 0
      ? Math.round(passagesTournee.reduce((acc, p) => acc + p.pourcentage, 0) / passagesTournee.length)
      : 0;
    const ateliersSet = new Set(passagesTournee.map((p) => p.atelier_id));
    return { count: passagesTournee.length, avgPct, ateliersVisites: ateliersSet.size };
  }, [tourneeActive, passages]);

  const dernierPassageMap = useMemo(() => {
    const map = new Map<string, Passage>();
    passages.forEach((p) => {
      if (!map.has(p.equipement_id)) map.set(p.equipement_id, p);
    });
    return map;
  }, [passages]);

  const sessionsActivesParEquipement = useMemo(() => {
    const map = new Map<string, SessionOperateur[]>();
    sessions.filter((s) => !s.ended_at).forEach((s) => {
      if (!map.has(s.equipement_id)) map.set(s.equipement_id, []);
      map.get(s.equipement_id)!.push(s);
    });
    return map;
  }, [sessions]);

  const sessionsParEquipement = useMemo(() => {
    const map = new Map<string, SessionOperateur[]>();
    sessions.forEach((s) => {
      if (!map.has(s.equipement_id)) map.set(s.equipement_id, []);
      map.get(s.equipement_id)!.push(s);
    });
    return map;
  }, [sessions]);

  const statsStatuts = useMemo(() => {
    const enCoursList = equipements.filter((e) => e.statut !== "livre");
    const enAttente = enCoursList.filter((e) => e.pourcentage_global === 0).length;
    const enCours = enCoursList.filter((e) => e.pourcentage_global > 0 && e.pourcentage_global < 100).length;
    const termine = enCoursList.filter((e) => e.pourcentage_global >= 100).length;
    return { enAttente, enCours, termine };
  }, [equipements]);

  const filteredEquipements = useMemo(() => {
    let list = equipements.filter((e) => e.statut !== "livre");

    if (filterMode === "en_attente") list = list.filter((e) => e.pourcentage_global === 0);
    else if (filterMode === "en_cours") list = list.filter((e) => e.pourcentage_global > 0 && e.pourcentage_global < 100);
    else if (filterMode === "termine") list = list.filter((e) => e.pourcentage_global >= 100);
    else if (filterMode === "not_seen_today") {
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
        (e.code_faratec && e.code_faratec.toLowerCase().includes(s)) ||
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
        (e.code_faratec && e.code_faratec.toLowerCase().includes(s))
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

  // --- GESTION DES TYPES ---
  const handleCreateTypeEquipement = async (typeName: string) => {
    if (!user || !typeName.trim()) return;
    const { data } = await supabase.from("types_equipement").insert({
      name: typeName.trim(),
      owner_id: user.id,
    }).select().single();
    if (data) {
      setTypesEquipement((prev) => [...prev, data as TypeEquipement].sort((a, b) => a.name.localeCompare(b.name)));
      setNewEqForm((f) => ({ ...f, type_equipement: (data as TypeEquipement).name }));
      setEditForm((f) => ({ ...f, type_equipement: (data as TypeEquipement).name }));
    }
  };

  const handleCreateNatureTravaux = async (natureName: string) => {
    if (!user || !natureName.trim()) return;
    const { data } = await supabase.from("natures_travaux").insert({
      name: natureName.trim(),
      owner_id: user.id,
    }).select().single();
    if (data) {
      setNaturesTravaux((prev) => [...prev, data as NatureTravaux].sort((a, b) => a.name.localeCompare(b.name)));
      setNewEqForm((f) => ({ ...f, nature_travaux: (data as NatureTravaux).name }));
      setEditForm((f) => ({ ...f, nature_travaux: (data as NatureTravaux).name }));
    }
  };

  // --- CRÉATION ---
  const openCreate = () => {
    setCreatingEquipement(true);
    setNewEqForm({ ...EMPTY_NEW_EQ });
    setNewEqErrors({});
  };

  const closeCreate = () => {
    setCreatingEquipement(false);
    setNewEqErrors({});
  };

  const handleCreateEquipement = async () => {
    if (!user) return;
    const errs: Record<string, string> = {};
    if (!newEqForm.code_faratec.trim()) errs.code_faratec = "Obligatoire";
    if (!newEqForm.client_name.trim()) errs.client_name = "Obligatoire";
    if (!newEqForm.type_equipement.trim()) errs.type_equipement = "Obligatoire";
    setNewEqErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setNewEqSaving(true);
    const semaine = getWeekNumber(new Date());

    const { data, error } = await supabase.from("equipements").insert({
      code_faratec: newEqForm.code_faratec.trim(),
      client_name: newEqForm.client_name.trim(),
      type_equipement: newEqForm.type_equipement,
      ndi_da_ns: newEqForm.ndi_da_ns.trim() || null,
      mle_reference: newEqForm.mle_reference.trim() || null,
      marque: newEqForm.marque.trim() || null,
      puissance_kw: newEqForm.puissance_kw ? parseFloat(newEqForm.puissance_kw) : null,
      tension: newEqForm.tension.trim() || null,
      vitesse: newEqForm.vitesse.trim() || null,
      operateur: newEqForm.operateur.trim() || null,
      urgence: newEqForm.urgence || "normal",
      nature_travaux: newEqForm.nature_travaux || null,
      owner_id: user.id,
      statut: "en_attente",
      pourcentage_global: 0,
      semaine_entree: semaine,
    }).select().single();

    if (error || !data) {
      setNewEqSaving(false);
      setNewEqErrors({ code_faratec: "Erreur : ce code existe peut-être déjà." });
      return;
    }

    const newEquipement = data as Equipement;
    setEquipements((prev) => [newEquipement, ...prev]);
    setNewEqSaving(false);
    closeCreate();
    openObservation(newEquipement);
  };

  // --- OBSERVATION ---
  const openObservation = (eq: Equipement) => {
    setSelectedEquipement(eq);
    setPourcentage(String(eq.pourcentage_global));
    setAtelierId("");
    setOperateurId("");
    setTypeTravailId("");
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

  const demarrerSessionSiNecessaire = async (equipementId: string, opId: string, atId: string): Promise<void> => {
    if (!user || !opId) return;
    const existing = sessions.find((s) => s.equipement_id === equipementId && s.operateur_id === opId && !s.ended_at);
    if (existing) return;

    const { data } = await supabase.from("interventions_operateurs").insert({
      equipement_id: equipementId,
      operateur_id: opId,
      atelier_id: atId || null,
      owner_id: user.id,
    }).select("*, operateurs(full_name), ateliers(name)").single();

    if (data) setSessions((prev) => [data as unknown as SessionOperateur, ...prev]);
  };

  const handleStopSession = async (sessionId: string) => {
    if (stoppingSession) return;
    setStoppingSession(sessionId);
    const now = new Date().toISOString();
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ended_at: now } : s)));
    await supabase.from("interventions_operateurs").update({ ended_at: now }).eq("id", sessionId);
    setStoppingSession(null);
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
    const now = new Date().toISOString();

    const isFirstPassage = !selectedEquipement.date_debut_intervention;
    const dateDebutIntervention = isFirstPassage ? now : selectedEquipement.date_debut_intervention;
    const nouveauStatut = newPct >= 100 ? "termine" : "en_reparation";

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
      operateur_id: operateurId || null,
      type_travail_id: typeTravailId || null,
      pourcentage: newPct,
      commentaire: commentaire.trim() || null,
      photo_url: photoUrl,
      passage_date: now,
      tournee_id: tourneeActive?.id || null,
      ateliers: { name: ateliers.find((a) => a.id === atelierId)?.name || "" },
      operateurs: operateurId ? { full_name: operateurs.find((o) => o.id === operateurId)?.full_name || "" } : null,
      types_travaux: typeTravailId ? { name: typesTravaux.find((t) => t.id === typeTravailId)?.name || "", code: typesTravaux.find((t) => t.id === typeTravailId)?.code || null } : null,
    };

    setPassages((prev) => [optimisticPassage, ...prev]);
    setEquipements((prev) =>
      prev.map((e) =>
        e.id === selectedEquipement.id
          ? { ...e, pourcentage_global: newPct, statut: nouveauStatut, date_debut_intervention: dateDebutIntervention }
          : e
      )
    );

    await supabase.from("journal_passages").insert({
      owner_id: user.id,
      equipement_id: selectedEquipement.id,
      atelier_id: atelierId,
      operateur_id: operateurId || null,
      type_travail_id: typeTravailId || null,
      pourcentage: newPct,
      commentaire: commentaire.trim() || null,
      photo_url: photoUrl,
      tournee_id: tourneeActive?.id || null,
    });

    const updateData: Record<string, any> = { pourcentage_global: newPct, statut: nouveauStatut };
    if (isFirstPassage) updateData.date_debut_intervention = dateDebutIntervention;
    await supabase.from("equipements").update(updateData).eq("id", selectedEquipement.id);

    if (operateurId) {
      await demarrerSessionSiNecessaire(selectedEquipement.id, operateurId, atelierId);
    }

    setSaving(false);
    closeObservation();
  };

  const handleTerminerIntervention = async (id: string) => {
    if (savingIntervention) return;
    setSavingIntervention(true);
    const now = new Date().toISOString();
    setEquipements((prev) => prev.map((e) => (e.id === id ? { ...e, date_fin_intervention: now } : e)));
    await supabase.from("equipements").update({ date_fin_intervention: now }).eq("id", id);
    setSavingIntervention(false);
  };

  const handleMarquerLivre = async (id: string) => {
    const eq = equipements.find((e) => e.id === id);
    if (!eq || eq.pourcentage_global < 100) return;
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
      code_faratec: eq.code_faratec || "",
      client_name: eq.client_name || "",
      type_equipement: eq.type_equipement || "",
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
    setEditErrors({});
  };

  const closeEdit = () => {
    setEditingEquipement(null);
    setEditErrors({});
  };

  const handleSaveEdit = async () => {
    if (!editingEquipement || !user) return;
    const errs: Record<string, string> = {};
    if (!editForm.code_faratec.trim()) errs.code_faratec = "Obligatoire";
    if (!editForm.client_name.trim()) errs.client_name = "Obligatoire";
    if (!editForm.type_equipement.trim()) errs.type_equipement = "Obligatoire";
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditSaving(true);

    const updated: Equipement = {
      ...editingEquipement,
      code_faratec: editForm.code_faratec.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: editForm.type_equipement,
      ndi_da_ns: editForm.ndi_da_ns.trim() || null,
      mle_reference: editForm.mle_reference.trim() || null,
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      tension: editForm.tension.trim() || null,
      vitesse: editForm.vitesse.trim() || null,
      operateur: editForm.operateur.trim() || null,
      urgence: editForm.urgence || "normal",
      nature_travaux: editForm.nature_travaux || null,
    };

    setEquipements((prev) => prev.map((e) => (e.id === editingEquipement.id ? updated : e)));

    await supabase.from("equipements").update({
      code_faratec: editForm.code_faratec.trim(),
      client_name: editForm.client_name.trim(),
      type_equipement: editForm.type_equipement,
      ndi_da_ns: editForm.ndi_da_ns.trim() || null,
      mle_reference: editForm.mle_reference.trim() || null,
      marque: editForm.marque.trim() || null,
      puissance_kw: editForm.puissance_kw ? parseFloat(editForm.puissance_kw) : null,
      tension: editForm.tension.trim() || null,
      vitesse: editForm.vitesse.trim() || null,
      operateur: editForm.operateur.trim() || null,
      urgence: editForm.urgence || "normal",
      nature_travaux: editForm.nature_travaux || null,
    }).eq("id", editingEquipement.id);

    setEditSaving(false);
    closeEdit();
  };

  const getHistorique = (equipementId: string) => passages.filter((p) => p.equipement_id === equipementId);

  const getTempsParOperateur = (equipementId: string) => {
    const eqSessions = sessionsParEquipement.get(equipementId) || [];
    const map = new Map<string, { operateur: string; totalMin: number; sessions: SessionOperateur[] }>();
    eqSessions.forEach((s) => {
      const mins = calculerTempsTravail(s.started_at, s.ended_at);
      const key = s.operateur_id;
      const name = s.operateurs?.full_name || "Inconnu";
      if (!map.has(key)) map.set(key, { operateur: name, totalMin: 0, sessions: [] });
      const entry = map.get(key)!;
      entry.totalMin += mins;
      entry.sessions.push(s);
    });
    return Array.from(map.values()).sort((a, b) => b.totalMin - a.totalMin);
  };

  const semaineActuelle = getWeekNumber(new Date());

  const renderFormFields = (
    form: typeof EMPTY_NEW_EQ,
    setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_NEW_EQ>>,
    errs: Record<string, string>
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
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errs.code_faratec ? "border-red-400" : "border-slate-200"}`}
            />
            {errs.code_faratec && <p className="text-xs text-red-600 mt-1">{errs.code_faratec}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Client *</label>
            <input
              value={form.client_name}
              onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
              placeholder="Nom du client"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${errs.client_name ? "border-red-400" : "border-slate-200"}`}
            />
            {errs.client_name && <p className="text-xs text-red-600 mt-1">{errs.client_name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Type d'équipement *</label>
            <SearchableSelect
              value={form.type_equipement}
              onChange={(val) => setForm((f) => ({ ...f, type_equipement: val }))}
              options={typesEquipement.map((t) => ({ value: t.name, label: t.name }))}
              placeholder="Sélectionner un type..."
              searchPlaceholder="Rechercher un type..."
              error={!!errs.type_equipement}
              hasOtherOption={true}
              otherLabel="+ Nouveau type d'équipement"
              onOtherCreate={handleCreateTypeEquipement}
            />
            {errs.type_equipement && <p className="text-xs text-red-600 mt-1">{errs.type_equipement}</p>}
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
            <SearchableSelect
              value={form.nature_travaux}
              onChange={(val) => setForm((f) => ({ ...f, nature_travaux: val }))}
              options={naturesTravaux.map((n) => ({ value: n.name, label: n.name }))}
              placeholder="Sélectionner une nature..."
              searchPlaceholder="Rechercher..."
              hasOtherOption={true}
              otherLabel="+ Nouvelle nature de travaux"
              onOtherCreate={handleCreateNatureTravaux}
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
          <h1 className="text-xl font-bold text-slate-800">Journal / Tournée</h1>
          <p className="text-sm text-slate-500">
            Suivi intelligent des passages en atelier. <span className="text-amber-600 font-semibold">Semaine {semaineActuelle}</span>
          </p>
        </div>
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

      {/* --- KPIs statuts --- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <Hourglass size={10} /> En attente
          </p>
          <p className="text-xl font-bold text-slate-800">{statsStatuts.enAttente}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-blue-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <PlayCircle size={10} /> En cours
          </p>
          <p className="text-xl font-bold text-slate-800">{statsStatuts.enCours}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-500">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <Flag size={10} /> Terminés
          </p>
          <p className="text-xl font-bold text-slate-800">{statsStatuts.termine}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-slate-600">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <CheckCircle2 size={10} /> Livrés
          </p>
          <p className="text-xl font-bold text-slate-800">{equipementsLivres.length}</p>
        </div>
      </div>

      {/* --- KPIs de tournée --- */}
      {tourneeActive && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-3 shadow-sm border border-amber-200">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Passages</p>
            <p className="text-xl font-bold text-amber-900">{statsTournee.count}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 shadow-sm border border-blue-200">
            <p className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">Ateliers visités</p>
            <p className="text-xl font-bold text-blue-900">{statsTournee.ateliersVisites}/{ateliers.length}</p>
          </div>
          <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-xl p-3 shadow-sm border border-violet-200">
            <p className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold">% moyen</p>
            <p className="text-xl font-bold text-violet-900">{statsTournee.avgPct}%</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 shadow-sm border border-green-200">
            <p className="text-[10px] uppercase tracking-wider text-green-700 font-semibold">Durée</p>
            <p className="text-xl font-bold text-green-900">
              {Math.floor((Date.now() - new Date(tourneeActive.started_at).getTime()) / 3600000)}h
            </p>
          </div>
        </div>
      )}

      {/* --- BLOC UNIFIÉ --- */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
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
            <button onClick={() => setFilterMode("all")} className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${filterMode === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <Filter size={12} /> Tous ({equipements.filter((e) => e.statut !== "livre").length})
            </button>
            <button onClick={() => setFilterMode("en_attente")} className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${filterMode === "en_attente" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <Hourglass size={12} /> En attente ({statsStatuts.enAttente})
            </button>
            <button onClick={() => setFilterMode("en_cours")} className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${filterMode === "en_cours" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <PlayCircle size={12} /> En cours ({statsStatuts.enCours})
            </button>
            <button onClick={() => setFilterMode("termine")} className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${filterMode === "termine" ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <Flag size={12} /> Terminés ({statsStatuts.termine})
            </button>
            <button onClick={() => setFilterMode("not_seen_today")} className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${filterMode === "not_seen_today" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <Clock size={12} /> Non vus aujourd'hui
            </button>
            <button onClick={() => setFilterMode("stagnant")} className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${filterMode === "stagnant" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              <AlertTriangle size={12} /> Stagnants
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Package size={16} className="text-amber-600" />
            Équipements ({filteredEquipements.length})
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
              const history3 = historique.slice(0, 3);
              const isStagnant = history3.length >= 3 && history3.every((p) => p.pourcentage === history3[0].pourcentage);
              const isNew = historique.length === 0;
              const canLivrer = e.pourcentage_global >= 100;
              const isUrgent = e.urgence === "urgent";
              const statutInfo = getStatutInfo(e.statut, e.pourcentage_global);
              const StatutIcon = statutInfo.icon;

              const joursEnAtelier = getDaysBetween(e.created_at, null);
              const delaiAvantReparation = e.date_debut_intervention ? getDaysBetween(e.created_at, e.date_debut_intervention) : null;
              const dureeIntervention = e.date_debut_intervention ? getDaysBetween(e.date_debut_intervention, e.date_fin_intervention) : null;
              const dureeTotale = getDaysBetween(e.created_at, e.date_fin_intervention);

              const canTerminerIntervention = e.pourcentage_global >= 100 && !e.date_fin_intervention;
              const sessionsActives = sessionsActivesParEquipement.get(e.id) || [];
              const tempsParOperateur = getTempsParOperateur(e.id);

              const sessEq = sessionsParEquipement.get(e.id) || [];
              const analyse = analyserEquipement(e, sessEq, coefficients);

              return (
                <div key={e.id} className={`transition ${isUrgent ? "bg-red-50/30" : "hover:bg-slate-50/40"}`}>
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${statutInfo.color}`}>
                          <StatutIcon size={9} /> {statutInfo.label}
                        </span>
                        {isUrgent && (
                          <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Zap size={9} /> URGENT
                          </span>
                        )}
                        {sessionsActives.length > 0 && (
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <User size={9} /> {sessionsActives.length} EN COURS
                          </span>
                        )}
                        {analyse.est_sur_duree && analyse.temps_reel_jours > 0 && (
                          <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1" title={`Attendu: ${analyse.temps_attendu_jours}j / Réel: ${analyse.temps_reel_jours}j (+${analyse.depassement_pourcentage}%)`}>
                            <AlertTriangle size={9} /> SUR-DURÉE +{analyse.depassement_pourcentage}%
                          </span>
                        )}
                        <span className="font-bold text-slate-800 text-sm">
                          {e.code_faratec || "Sans code"}
                        </span>
                        <span className="text-sm text-slate-600">• {e.client_name}</span>
                        {isStagnant && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <AlertTriangle size={9} /> STAGNANT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{e.type_equipement}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Timer size={10} />
                          En atelier depuis <strong className="text-slate-600">{joursEnAtelier}j</strong>
                        </span>
                        {e.date_debut_intervention && (
                          <span className="flex items-center gap-1">
                            <CalendarClock size={10} />
                            Démarré le {formatDate(e.date_debut_intervention)}
                          </span>
                        )}
                        {dernierPassage && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            Dernier passage : {getTimeAgo(dernierPassage.passage_date)} · {dernierPassage.ateliers?.name}
                          </span>
                        )}
                      </div>
                      {sessionsActives.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {sessionsActives.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                              <span className="text-[10px] font-bold text-emerald-800">
                                {s.operateurs?.full_name}
                              </span>
                              <span className="text-[10px] text-emerald-600 font-mono">
                                {formatDureeMinutes(calculerTempsTravail(s.started_at, s.ended_at))}
                              </span>
                              <button
                                onClick={() => handleStopSession(s.id)}
                                disabled={stoppingSession === s.id}
                                className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 rounded px-1.5 py-0.5 font-bold transition disabled:opacity-50"
                              >
                                {stoppingSession === s.id ? "..." : "STOP"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {isNew && (
                        <p className="text-[10px] text-slate-400 mt-0.5 italic">Aucun passage enregistré — cliquez sur Observation pour démarrer</p>
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
                        onClick={() => navigate(`/couts?eq=${e.id}`)}
                        className="flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition"
                        title="Calcul des coûts"
                      >
                        <Calculator size={12} />
                      </button>
                      {canTerminerIntervention && (
                        <button
                          onClick={() => handleTerminerIntervention(e.id)}
                          disabled={savingIntervention}
                          className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-2 py-1.5 text-xs font-semibold whitespace-nowrap shadow-sm transition disabled:opacity-50"
                        >
                          <StopCircle size={12} /> Terminer
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(e)}
                        className="flex items-center gap-1 text-blue-700 hover:bg-blue-50 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition"
                        title="Modifier"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => canLivrer && handleMarquerLivre(e.id)}
                        disabled={!canLivrer}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                          canLivrer ? "text-violet-700 hover:bg-violet-50" : "text-slate-300 cursor-not-allowed"
                        }`}
                        title={canLivrer ? "Marquer comme livré" : `Impossible : ${e.pourcentage_global}%`}
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
                    <div className="bg-slate-50/60 border-t border-slate-100 p-4 space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 flex items-center gap-1">
                            <Hourglass size={10} /> Délai avant réparation
                          </p>
                          <p className="text-lg font-bold text-slate-800">
                            {delaiAvantReparation !== null ? `${delaiAvantReparation}j` : "—"}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">Entrée → Début</p>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 flex items-center gap-1">
                            <Wrench size={10} /> Durée d'intervention
                          </p>
                          <p className="text-lg font-bold text-blue-700">
                            {dureeIntervention !== null ? `${dureeIntervention}j` : "—"}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {e.date_fin_intervention ? "Début → Fin" : "Début → Aujourd'hui"}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 flex items-center gap-1">
                            <Package size={10} /> Durée totale
                          </p>
                          <p className="text-lg font-bold text-amber-700">{dureeTotale}j</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">Entrée → Aujourd'hui</p>
                        </div>
                      </div>

                      {tempsParOperateur.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1">
                            <User size={12} /> Temps de travail effectif par opérateur
                          </p>
                          <div className="space-y-2">
                            {tempsParOperateur.map((tp, i) => {
                              const activeSessions = tp.sessions.filter((s) => !s.ended_at);
                              return (
                                <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">
                                        {tp.operateur.substring(0, 2).toUpperCase()}
                                      </div>
                                      <span className="text-sm font-medium text-slate-800">{tp.operateur}</span>
                                      {activeSessions.length > 0 && (
                                        <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                                          ACTIF
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-amber-700">{formatDureeMinutes(tp.totalMin)}</p>
                                      <p className="text-[9px] text-slate-400">
                                        {tp.sessions.length} session{tp.sessions.length > 1 ? "s" : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                    {tp.sessions.map((s) => (
                                      <div key={s.id} className="flex items-center justify-between text-[10px]">
                                        <span className="text-slate-500">
                                          {formatDate(s.started_at)} {formatTime(s.started_at)}
                                          {s.ended_at && ` → ${formatTime(s.ended_at)}`}
                                          {!s.ended_at && " → en cours"}
                                        </span>
                                        <span className="font-mono text-slate-600">
                                          {formatDureeMinutes(calculerTempsTravail(s.started_at, s.ended_at))}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div>
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
                                  <button
                                    onClick={() => setZoomedPhoto(p.photo_url)}
                                    className="relative group shrink-0"
                                  >
                                    <img src={p.photo_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-lg flex items-center justify-center transition">
                                      <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition" />
                                    </div>
                                  </button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 flex-wrap">
                                      <span>{p.ateliers?.name}</span>
                                      {p.operateurs?.full_name && (
                                        <>
                                          <span className="text-slate-300">•</span>
                                          <span>{p.operateurs.full_name}</span>
                                        </>
                                      )}
                                      {p.types_travaux?.name && (
                                        <>
                                          <span className="text-slate-300">•</span>
                                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                            <Wrench size={9} />
                                            {p.types_travaux.name}
                                          </span>
                                        </>
                                      )}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-amber-600 transition"
            >
              <PlusCircle size={12} />
              Équipement non listé (créer une nouvelle fiche)
            </button>
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
            <CheckCircle2 size={16} className="text-slate-600" />
            Équipements livrés
            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
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
                      {e.code_faratec || "Sans code"} — {e.client_name}
                    </p>
                    <p className="text-xs text-slate-500">{e.type_equipement}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs bg-slate-600 text-white px-2 py-1 rounded-full font-semibold">
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-600" />
                  Nouvel équipement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Cas exceptionnel : équipement non enregistré à la réception.</p>
              </div>
              <button onClick={closeCreate} className="text-slate-400 hover:text-slate-600 p-1 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-5">
              {renderFormFields(newEqForm, setNewEqForm, newEqErrors)}
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
                  {selectedEquipement.code_faratec || "Sans code"}
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
                  <SearchableSelect
                    value={atelierId}
                    onChange={(val) => { setAtelierId(val); setErrors((p) => ({ ...p, atelierId: "" })); }}
                    options={ateliers.map((a) => ({ value: a.id, label: a.name }))}
                    placeholder="Sélectionner un atelier..."
                    searchPlaceholder="Rechercher un atelier..."
                    emptyMessage="Aucun atelier trouvé"
                    error={!!errors.atelierId}
                  />
                  {errors.atelierId && <p className="text-xs text-red-600 mt-1">{errors.atelierId}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Opérateur</label>
                  <SearchableSelect
                    value={operateurId}
                    onChange={(val) => setOperateurId(val)}
                    options={operateurs.map((o) => ({ value: o.id, label: o.full_name }))}
                    placeholder="Optionnel"
                    searchPlaceholder="Rechercher un opérateur..."
                    emptyMessage="Aucun opérateur trouvé"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1">
                  <Wrench size={12} className="text-amber-600" />
                  Type de travail
                </label>
                <SearchableSelect
                  value={typeTravailId}
                  onChange={(val) => setTypeTravailId(val)}
                  options={typesTravaux.map((t) => ({
                    value: t.id,
                    label: t.name,
                    sublabel: t.code || undefined,
                  }))}
                  placeholder="Optionnel (Démontage, Bobinage, etc.)"
                  searchPlaceholder="Rechercher un type de travail..."
                  emptyMessage="Aucun type trouvé"
                />
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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

            <div className="p-5">
              {renderFormFields(editForm, setEditForm, editErrors)}
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