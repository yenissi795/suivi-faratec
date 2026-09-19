import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Search, FileDown, Loader2, Calendar, CalendarDays,
  CalendarRange, Target, Package, CheckCircle2, PlayCircle,
  Hourglass, Flag, Zap, TrendingUp, Filter, X, ChevronDown,
  ChevronUp, Sheet, RotateCcw, Building2, AlertTriangle,
  Info, Clock, CalendarClock
} from "lucide-react";
import { buildCsv } from "../lib/reportPdf";

interface Equipement {
  id: string;
  code_faratec: string | null;
  client_name: string;
  type_equipement: string;
  nature_travaux: string | null;
  marque: string | null;
  puissance_kw: number | null;
  ndi_da_ns: string | null;
  mle_reference: string | null;
  tension: string | null;
  vitesse: string | null;
  urgence: string | null;
  statut: string;
  pourcentage_global: number;
  created_at: string;
  date_livraison_reelle: string | null;
  date_debut_intervention: string | null;
  date_fin_intervention: string | null;
  date_fin_prevue: string | null;
  rapport_etabli: boolean | null;
}

interface Passage {
  equipement_id: string;
  pourcentage: number;
  passage_date: string;
}

type PeriodType = "jour" | "semaine" | "mois" | "annee" | "custom" | "tout";
type StatutFiltre = "tous" | "en_attente" | "en_cours" | "pret_a_livrer" | "livre" | "stagnant";
type DateFilterType = "created" | "livraison";

export default function VueClientPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);

  // Mode "client spécifique" vs "tous les clients"
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [searchClient, setSearchClient] = useState("");
  const [showClientList, setShowClientList] = useState(false);

  // Filtres avancés
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterNature, setFilterNature] = useState("");
  const [filterMarque, setFilterMarque] = useState("");
  const [filterPuissance, setFilterPuissance] = useState("");
  const [filterNdi, setFilterNdi] = useState("");
  const [filterMle, setFilterMle] = useState("");
  const [filterTension, setFilterTension] = useState("");
  const [filterVitesse, setFilterVitesse] = useState("");
  const [filterUrgence, setFilterUrgence] = useState<"tous" | "urgent" | "normal">("tous");
  const [filterDateExacte, setFilterDateExacte] = useState("");

  // Statut (boutons rapides)
  const [filterStatut, setFilterStatut] = useState<StatutFiltre>("tous");

  // Type de date (entree ou livraison)
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>("created");

  // Période
  const [period, setPeriod] = useState<PeriodType>("tout");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  // Modale détail
  const [selectedEquipement, setSelectedEquipement] = useState<Equipement | null>(null);

  // --- CHARGEMENT ---
  const load = async () => {
    setLoading(true);
    const [eqRes, passRes] = await Promise.all([
      supabase
        .from("equipements")
        .select("id, code_faratec, client_name, type_equipement, nature_travaux, marque, puissance_kw, ndi_da_ns, mle_reference, tension, vitesse, urgence, statut, pourcentage_global, created_at, date_livraison_reelle, date_debut_intervention, date_fin_intervention, date_fin_prevue, rapport_etabli")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("journal_passages")
        .select("equipement_id, pourcentage, passage_date")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false }),
    ]);
    setEquipements((eqRes.data as Equipement[]) || []);
    setPassages((passRes.data as Passage[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // --- LISTE DES CLIENTS UNIQUES ---
  const clients = useMemo(() => {
    const set = new Set<string>();
    equipements.forEach((e) => set.add(e.client_name));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipements]);

  const filteredClients = useMemo(() => {
    if (!searchClient) return clients.slice(0, 50);
    const s = searchClient.toLowerCase();
    return clients.filter((c) => c.toLowerCase().includes(s)).slice(0, 50);
  }, [clients, searchClient]);

  // --- LISTES UNIQUES ---
  const typesUniques = useMemo(() => {
    const set = new Set<string>();
    equipements.forEach((e) => { if (e.type_equipement) set.add(e.type_equipement); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipements]);

  const naturesUniques = useMemo(() => {
    const set = new Set<string>();
    equipements.forEach((e) => { if (e.nature_travaux) set.add(e.nature_travaux); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipements]);

  const marquesUniques = useMemo(() => {
    const set = new Set<string>();
    equipements.forEach((e) => { if (e.marque) set.add(e.marque); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipements]);

  // --- STAGNANTS ---
  const stagnantIds = useMemo(() => {
    const set = new Set<string>();
    const enCours = equipements.filter((e) => e.statut !== "livre");
    enCours.forEach((e) => {
      const hist = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
      if (hist.length >= 3 && hist.every((p) => p.pourcentage === hist[0].pourcentage)) {
        set.add(e.id);
      }
    });
    return set;
  }, [equipements, passages]);

  // --- BORNES DE LA PÉRIODE ---
  const periodBounds = useMemo(() => {
    const now = new Date();
    if (period === "tout") return { start: new Date("1970-01-01"), end: new Date("2100-01-01"), label: "Tout l'historique" };

    if (period === "jour") {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      return { start, end, label: `Aujourd'hui (${now.toLocaleDateString("fr-FR")})` };
    }

    if (period === "semaine") {
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday, label: `Semaine du ${monday.toLocaleDateString("fr-FR")} au ${sunday.toLocaleDateString("fr-FR")}` };
    }

    if (period === "mois") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { start, end, label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
    }

    if (period === "annee") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      return { start, end, label: `Année ${now.getFullYear()}` };
    }

    const s = new Date(customStart); s.setHours(0, 0, 0, 0);
    const e = new Date(customEnd); e.setHours(23, 59, 59, 999);
    return { start: s, end: e, label: `Du ${s.toLocaleDateString("fr-FR")} au ${e.toLocaleDateString("fr-FR")}` };
  }, [period, customStart, customEnd]);

  // --- FILTRAGE FINAL ---
  const filteredEquipements = useMemo(() => {
    return equipements.filter((e) => {
      // 1. Filtre client
      if (selectedClient && e.client_name !== selectedClient) return false;

      // 2. Filtre date exacte (prioritaire)
      if (filterDateExacte) {
        const dateRef = dateFilterType === "created" ? e.created_at : e.date_livraison_reelle;
        if (!dateRef) return false;
        const eqDate = new Date(dateRef).toISOString().slice(0, 10);
        if (eqDate !== filterDateExacte) return false;
      } else {
        // Sinon filtre période
        const dateRef = dateFilterType === "created" ? e.created_at : e.date_livraison_reelle;
        if (!dateRef) return false;
        const d = new Date(dateRef);
        if (d < periodBounds.start || d > periodBounds.end) return false;
      }

      // 3. Recherche texte
      if (searchTerm) {
        const s = searchTerm.toLowerCase().trim();
        const matches =
          (e.code_faratec && e.code_faratec.toLowerCase().includes(s)) ||
          e.client_name.toLowerCase().includes(s) ||
          e.type_equipement.toLowerCase().includes(s) ||
          (e.nature_travaux && e.nature_travaux.toLowerCase().includes(s)) ||
          (e.marque && e.marque.toLowerCase().includes(s)) ||
          (e.ndi_da_ns && e.ndi_da_ns.toLowerCase().includes(s)) ||
          (e.mle_reference && e.mle_reference.toLowerCase().includes(s)) ||
          (e.tension && e.tension.toLowerCase().includes(s)) ||
          (e.vitesse && e.vitesse.toLowerCase().includes(s));
        if (!matches) return false;
      }

      // 4-11. Filtres avancés
      if (filterType && e.type_equipement !== filterType) return false;
      if (filterNature && e.nature_travaux !== filterNature) return false;
      if (filterMarque && e.marque !== filterMarque) return false;
      if (filterPuissance) {
        const p = Number(filterPuissance);
        if (isNaN(p) || e.puissance_kw !== p) return false;
      }
      if (filterNdi) {
        const s = filterNdi.toLowerCase().trim();
        if (!e.ndi_da_ns || !e.ndi_da_ns.toLowerCase().includes(s)) return false;
      }
      if (filterMle) {
        const s = filterMle.toLowerCase().trim();
        if (!e.mle_reference || !e.mle_reference.toLowerCase().includes(s)) return false;
      }
      if (filterTension) {
        const s = filterTension.toLowerCase().trim();
        if (!e.tension || !e.tension.toLowerCase().includes(s)) return false;
      }
      if (filterVitesse) {
        const s = filterVitesse.toLowerCase().trim();
        if (!e.vitesse || !e.vitesse.toLowerCase().includes(s)) return false;
      }

      // 12. Filtre statut (boutons rapides)
      if (filterStatut !== "tous") {
        if (filterStatut === "livre" && e.statut !== "livre") return false;
        if (filterStatut === "en_attente" && (e.statut === "livre" || e.pourcentage_global > 0)) return false;
        if (filterStatut === "en_cours" && (e.statut === "livre" || e.pourcentage_global === 0 || e.pourcentage_global >= 100)) return false;
        if (filterStatut === "pret_a_livrer" && (e.statut === "livre" || e.pourcentage_global < 100)) return false;
        if (filterStatut === "stagnant" && !stagnantIds.has(e.id)) return false;
      }

      // 13. Filtre urgence
      if (filterUrgence !== "tous") {
        if (filterUrgence === "urgent" && e.urgence !== "urgent") return false;
        if (filterUrgence === "normal" && e.urgence === "urgent") return false;
      }

      return true;
    });
  }, [equipements, selectedClient, periodBounds, filterDateExacte, dateFilterType, searchTerm, filterType, filterNature, filterMarque, filterPuissance, filterNdi, filterMle, filterTension, filterVitesse, filterStatut, filterUrgence, stagnantIds]);

  // --- COMPTER FILTRES ACTIFS (hors statut) ---
  const nbFiltresActifs = useMemo(() => {
    let n = 0;
    if (searchTerm) n++;
    if (filterType) n++;
    if (filterNature) n++;
    if (filterMarque) n++;
    if (filterPuissance) n++;
    if (filterNdi) n++;
    if (filterMle) n++;
    if (filterTension) n++;
    if (filterVitesse) n++;
    if (filterUrgence !== "tous") n++;
    if (filterDateExacte) n++;
    return n;
  }, [searchTerm, filterType, filterNature, filterMarque, filterPuissance, filterNdi, filterMle, filterTension, filterVitesse, filterUrgence, filterDateExacte]);

  // --- RÉINITIALISER ---
  const resetFiltres = () => {
    setSearchTerm("");
    setFilterType("");
    setFilterNature("");
    setFilterMarque("");
    setFilterPuissance("");
    setFilterNdi("");
    setFilterMle("");
    setFilterTension("");
    setFilterVitesse("");
    setFilterUrgence("tous");
    setFilterDateExacte("");
    setFilterStatut("tous");
    setPeriod("tout");
  };


  // --- TÉLÉCHARGEMENT PDF ---
  const handleDownloadPdf = async () => {
    if (filteredEquipements.length === 0) return;
    const { buildClientEquipementsPdf } = await import("../lib/reportPdf");
    const clientLabel = selectedClient || "Tous les clients";
    const doc = await buildClientEquipementsPdf({
      client_name: clientLabel,
      periode_label: filterDateExacte ? `Date : ${new Date(filterDateExacte).toLocaleDateString("fr-FR")}` : periodBounds.label,
      equipements: filteredEquipements.map((e) => ({
        code_faratec: e.code_faratec,
        type_equipement: e.type_equipement,
        marque: e.marque,
        puissance_kw: e.puissance_kw,
        ndi_da_ns: e.ndi_da_ns,
        mle_reference: e.mle_reference,
        tension: e.tension,
        vitesse: e.vitesse,
        urgence: e.urgence,
        statut: e.statut,
        pourcentage_global: e.pourcentage_global,
        created_at: e.created_at,
        date_livraison_reelle: e.date_livraison_reelle,
      })),
    });
    const filename = `FARATEC_${clientLabel.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  // --- TÉLÉCHARGEMENT CSV ---
  const handleDownloadCsv = () => {
    if (filteredEquipements.length === 0) return;

    const header = [
      "Code Faratec", "Client", "Type", "Nature", "Marque", "Puissance (kW)",
      "NDI/DA/NS", "MLE/Reference", "Tension", "Vitesse", "Urgence", "Statut",
      "Avancement (%)", "Date entree", "Date livraison",
    ];

    const rows = filteredEquipements.map((e) => {
      let statutLabel = "En attente";
      if (e.statut === "livre") statutLabel = "Livre";
      else if (e.pourcentage_global >= 100) statutLabel = "Pret a livrer";
      else if (e.pourcentage_global > 0) statutLabel = "En cours";

      return [
        e.code_faratec || "—",
        e.client_name,
        e.type_equipement,
        e.nature_travaux || "—",
        e.marque || "—",
        e.puissance_kw !== null ? String(e.puissance_kw) : "—",
        e.ndi_da_ns || "—",
        e.mle_reference || "—",
        e.tension || "—",
        e.vitesse || "—",
        e.urgence === "urgent" ? "URGENT" : "Normal",
        statutLabel,
        String(e.pourcentage_global),
        new Date(e.created_at).toLocaleDateString("fr-FR"),
        e.date_livraison_reelle ? new Date(e.date_livraison_reelle).toLocaleDateString("fr-FR") : "—",
      ];
    });

    const clientLabel = selectedClient || "Tous_les_clients";
    const filename = `FARATEC_${clientLabel.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    buildCsv([header, ...rows], filename);
  };

  // --- HELPERS ---
  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

  const getDaysBetween = (from: string, to: string | null): number => {
    const endDate = to ? new Date(to) : new Date();
    const startDate = new Date(from);
    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000));
  };

  const getStatutInfo = (e: Equipement) => {
    if (e.statut === "livre") return { label: "LIVRÉ", color: "bg-slate-600 text-white", icon: CheckCircle2 };
    if (e.pourcentage_global >= 100) return { label: "PRÊT À LIVRER", color: "bg-violet-600 text-white", icon: Flag };
    if (e.pourcentage_global > 0) return { label: "EN COURS", color: "bg-blue-600 text-white", icon: PlayCircle };
    return { label: "EN ATTENTE", color: "bg-amber-500 text-white", icon: Hourglass };
  };

  const periodTabs: { key: PeriodType; label: string; icon: any }[] = [
    { key: "jour", label: "Jour", icon: Calendar },
    { key: "semaine", label: "Semaine", icon: CalendarDays },
    { key: "mois", label: "Mois", icon: CalendarRange },
    { key: "annee", label: "Année", icon: TrendingUp },
    { key: "custom", label: "Perso", icon: Target },
    { key: "tout", label: "Tout", icon: Clock },
  ];

  // Compteurs pour les boutons de statut (basés sur equipements filtrés hors statut)
  const compteurs = useMemo(() => {
    const base = equipements.filter((e) => {
      if (selectedClient && e.client_name !== selectedClient) return false;
      const dateRef = dateFilterType === "created" ? e.created_at : e.date_livraison_reelle;
      if (!dateRef) return false;
      if (filterDateExacte) {
        if (new Date(dateRef).toISOString().slice(0, 10) !== filterDateExacte) return false;
      } else {
        const d = new Date(dateRef);
        if (d < periodBounds.start || d > periodBounds.end) return false;
      }
      return true;
    });
    const livres = base.filter((e) => e.statut === "livre").length;
    const pretALivrer = base.filter((e) => e.statut !== "livre" && e.pourcentage_global >= 100).length;
    const enCours = base.filter((e) => e.statut !== "livre" && e.pourcentage_global > 0 && e.pourcentage_global < 100).length;
    const enAttente = base.filter((e) => e.statut !== "livre" && e.pourcentage_global === 0).length;
    const stagnants = base.filter((e) => stagnantIds.has(e.id)).length;
    const urgents = base.filter((e) => e.urgence === "urgent" && e.statut !== "livre").length;
    return { total: base.length, livres, pretALivrer, enCours, enAttente, stagnants, urgents };
  }, [equipements, selectedClient, dateFilterType, filterDateExacte, periodBounds, stagnantIds]);

  const statutButtons: { key: StatutFiltre; label: string; count: number; color: string; activeColor: string }[] = [
    { key: "tous", label: "Tous", count: compteurs.total, color: "bg-slate-100 text-slate-600 hover:bg-slate-200", activeColor: "bg-slate-800 text-white" },
    { key: "en_attente", label: "En attente", count: compteurs.enAttente, color: "bg-slate-100 text-slate-600 hover:bg-slate-200", activeColor: "bg-amber-500 text-white" },
    { key: "en_cours", label: "En cours", count: compteurs.enCours, color: "bg-slate-100 text-slate-600 hover:bg-slate-200", activeColor: "bg-blue-600 text-white" },
    { key: "pret_a_livrer", label: "Prêt à livrer", count: compteurs.pretALivrer, color: "bg-slate-100 text-slate-600 hover:bg-slate-200", activeColor: "bg-violet-600 text-white" },
    { key: "livre", label: "Livré", count: compteurs.livres, color: "bg-slate-100 text-slate-600 hover:bg-slate-200", activeColor: "bg-slate-600 text-white" },
    { key: "stagnant", label: "Stagnant", count: compteurs.stagnants, color: "bg-slate-100 text-slate-600 hover:bg-slate-200", activeColor: "bg-red-600 text-white" },
  ];

  return (
    <div className="space-y-5">
      {/* --- EN-TÊTE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 size={20} className="text-amber-600" />
            Répertoire équipements
          </h1>
          <p className="text-sm text-slate-500">
            Recherchez, analysez et exportez tous les équipements.
          </p>
        </div>
        {filteredEquipements.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition"
            >
              <Sheet size={14} /> CSV
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-amber-500 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition"
            >
              <FileDown size={14} /> PDF
            </button>
          </div>
        )}
      </div>

      {/* --- RECHERCHE + BOUTON FILTRES --- */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Rechercher : code, client, type, marque, NDI, MLE, tension, vitesse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              showFilters || nbFiltresActifs > 0
                ? "bg-amber-500 text-neutral-900 shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Filter size={14} />
            Filtres
            {nbFiltresActifs > 0 && (
              <span className="bg-neutral-900 text-amber-500 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                {nbFiltresActifs}
              </span>
            )}
            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* --- PANNEAU FILTRES AVANCÉS --- */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 space-y-4">
            {/* Sélection client */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Client</p>
              {selectedClient ? (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">{selectedClient}</span>
                  <button
                    onClick={() => { setSelectedClient(""); setSearchClient(""); }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1"
                  >
                    <X size={12} /> Retirer
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Rechercher un client..."
                    value={searchClient}
                    onChange={(e) => { setSearchClient(e.target.value); setShowClientList(true); }}
                    onFocus={() => setShowClientList(true)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {showClientList && searchClient && (
                    <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg divide-y divide-slate-100">
                      {filteredClients.length === 0 ? (
                        <p className="text-sm text-slate-400 p-3 text-center">Aucun client trouvé.</p>
                      ) : (
                        filteredClients.map((c) => {
                          const count = equipements.filter((e) => e.client_name === c).length;
                          return (
                            <button
                              key={c}
                              onClick={() => { setSelectedClient(c); setShowClientList(false); setSearchClient(""); }}
                              className="w-full text-left p-2.5 hover:bg-amber-50/50 transition flex items-center justify-between"
                            >
                              <span className="text-sm font-semibold text-slate-800">{c}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                                {count}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type + Nature */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Type équipement</p>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">Tous les types</option>
                  {typesUniques.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Nature des travaux</p>
                <select
                  value={filterNature}
                  onChange={(e) => setFilterNature(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">Toutes les natures</option>
                  {naturesUniques.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {/* Marque + Puissance */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Marque</p>
                <select
                  value={filterMarque}
                  onChange={(e) => setFilterMarque(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">Toutes les marques</option>
                  {marquesUniques.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Puissance (kW)</p>
                <input
                  type="number"
                  placeholder="Ex: 4"
                  value={filterPuissance}
                  onChange={(e) => setFilterPuissance(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* NDI + MLE */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">NDI/DA/NS</p>
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={filterNdi}
                  onChange={(e) => setFilterNdi(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">MLE/Référence</p>
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={filterMle}
                  onChange={(e) => setFilterMle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Tension + Vitesse */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Tension</p>
                <input
                  type="text"
                  placeholder="Ex: 380V"
                  value={filterTension}
                  onChange={(e) => setFilterTension(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Vitesse</p>
                <input
                  type="text"
                  placeholder="Ex: 1500"
                  value={filterVitesse}
                  onChange={(e) => setFilterVitesse(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Urgence */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Urgence</p>
              <select
                value={filterUrgence}
                onChange={(e) => setFilterUrgence(e.target.value as "tous" | "urgent" | "normal")}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="tous">Toutes</option>
                <option value="urgent">Urgent uniquement</option>
                <option value="normal">Normal uniquement</option>
              </select>
            </div>

            {/* Type de date + Date exacte */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Filtrer par date</p>
              <select
                value={dateFilterType}
                onChange={(e) => setDateFilterType(e.target.value as DateFilterType)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none mb-3"
              >
                <option value="created">Date d'entrée</option>
                <option value="livraison">Date de livraison</option>
              </select>
              <input
                type="date"
                value={filterDateExacte}
                onChange={(e) => setFilterDateExacte(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              {filterDateExacte && (
                <p className="text-[10px] text-amber-700 mt-1">
                  La période est ignorée tant que la date exacte est renseignée.
                </p>
              )}
            </div>

            {/* Réinitialiser */}
            {nbFiltresActifs > 0 && (
              <button
                onClick={resetFiltres}
                className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 transition"
              >
                <RotateCcw size={12} /> Réinitialiser tous les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- PÉRIODE + STATUTS --- */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        {/* Période */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Période</p>
          <div className="flex flex-wrap gap-2">
            {periodTabs.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                disabled={!!filterDateExacte}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  period === p.key ? "bg-amber-500 text-neutral-900 shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                } ${filterDateExacte ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <p.icon size={12} />
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && !filterDateExacte && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-2">
                Du
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </label>
              <label className="text-xs font-medium text-slate-600 flex items-center gap-2">
                au
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </label>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            <strong>{dateFilterType === "created" ? "Entrées" : "Livraisons"} :</strong> {periodBounds.label}
          </p>
        </div>

        {/* Statuts rapides */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Statut</p>
          <div className="flex flex-wrap gap-2">
            {statutButtons.map((b) => (
              <button
                key={b.key}
                onClick={() => setFilterStatut(b.key)}
                className={`text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  filterStatut === b.key ? b.activeColor : b.color
                }`}
              >
                {b.label} ({b.count})
              </button>
            ))}
            {/* Urgent séparé */}
            <button
              onClick={() => setFilterUrgence(filterUrgence === "urgent" ? "tous" : "urgent")}
              className={`flex items-center gap-1 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                filterUrgence === "urgent" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Zap size={11} /> Urgents ({compteurs.urgents})
            </button>
          </div>
        </div>
      </div>

      {/* --- LISTE ÉQUIPEMENTS --- */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Package size={16} className="text-amber-600" />
            {selectedClient ? `Équipements de ${selectedClient}` : "Tous les équipements"}
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
            <p className="text-sm text-slate-400">Aucun équipement ne correspond aux critères.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-2 text-left font-semibold">Code Faratec</th>
                  <th className="p-2 text-left font-semibold">Client</th>
                  <th className="p-2 text-left font-semibold">Type</th>
                  <th className="p-2 text-left font-semibold">Nature</th>
                  <th className="p-2 text-left font-semibold">Marque</th>
                  <th className="p-2 text-center font-semibold">Puis.</th>
                  <th className="p-2 text-left font-semibold">NDI/DA/NS</th>
                  <th className="p-2 text-left font-semibold">MLE/Réf</th>
                  <th className="p-2 text-center font-semibold">Tension</th>
                  <th className="p-2 text-center font-semibold">Vitesse</th>
                  <th className="p-2 text-center font-semibold">Statut</th>
                  <th className="p-2 text-right font-semibold">Avanc.</th>
                  <th className="p-2 text-center font-semibold">Entrée</th>
                  <th className="p-2 text-center font-semibold">Livré le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEquipements.map((e) => {
                  const statutInfo = getStatutInfo(e);
                  const StatutIcon = statutInfo.icon;
                  const isUrgent = e.urgence === "urgent" && e.statut !== "livre";
                  const isStagnant = stagnantIds.has(e.id);
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50/50 ${isUrgent ? "bg-red-50/30" : ""}`}>
                      <td className="p-2">
                        <button
                          onClick={() => setSelectedEquipement(e)}
                          className="font-bold text-amber-700 hover:text-amber-900 hover:underline transition"
                          title="Cliquer pour voir le détail"
                        >
                          {e.code_faratec || "—"}
                        </button>
                        {isUrgent && <Zap size={10} className="inline ml-1 text-red-600" />}
                        {isStagnant && <AlertTriangle size={10} className="inline ml-1 text-red-500" />}
                      </td>
                      <td className="p-2 text-slate-600 font-medium">{e.client_name}</td>
                      <td className="p-2 text-slate-600">{e.type_equipement}</td>
                      <td className="p-2 text-slate-600">{e.nature_travaux || "—"}</td>
                      <td className="p-2 text-slate-600">{e.marque || "—"}</td>
                      <td className="p-2 text-center text-slate-600">{e.puissance_kw !== null ? `${e.puissance_kw}kW` : "—"}</td>
                      <td className="p-2 text-slate-500 text-[10px]">{e.ndi_da_ns || "—"}</td>
                      <td className="p-2 text-slate-500 text-[10px]">{e.mle_reference || "—"}</td>
                      <td className="p-2 text-center text-slate-500 text-[10px]">{e.tension || "—"}</td>
                      <td className="p-2 text-center text-slate-500 text-[10px]">{e.vitesse || "—"}</td>
                      <td className="p-2 text-center">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${statutInfo.color}`}>
                          <StatutIcon size={8} /> {statutInfo.label}
                        </span>
                      </td>
                      <td className="p-2 text-right font-bold text-amber-700">{e.pourcentage_global}%</td>
                      <td className="p-2 text-center text-slate-500 text-[10px]">{formatDate(e.created_at)}</td>
                      <td className="p-2 text-center text-slate-500 text-[10px]">{formatDate(e.date_livraison_reelle)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- ÉTAT VIDE --- */}
      {!loading && equipements.length === 0 && (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <Users size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Aucun équipement en base.</p>
        </div>
      )}

      {/* --- MODALE DÉTAIL ÉQUIPEMENT --- */}
      {selectedEquipement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedEquipement(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  {selectedEquipement.code_faratec || "Sans code"}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {selectedEquipement.client_name} · {selectedEquipement.type_equipement}
                </p>
              </div>
              <button onClick={() => setSelectedEquipement(null)} className="text-slate-400 hover:text-slate-600 p-1 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Statut */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1.5 ${getStatutInfo(selectedEquipement).color}`}>
                  {(() => {
                    const info = getStatutInfo(selectedEquipement);
                    const Icon = info.icon;
                    return <><Icon size={12} /> {info.label}</>;
                  })()}
                </span>
                <span className="text-sm font-bold text-amber-700">{selectedEquipement.pourcentage_global}%</span>
                {selectedEquipement.urgence === "urgent" && selectedEquipement.statut !== "livre" && (
                  <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full font-bold inline-flex items-center gap-1">
                    <Zap size={10} /> URGENT
                  </span>
                )}
                {stagnantIds.has(selectedEquipement.id) && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-bold inline-flex items-center gap-1">
                    <AlertTriangle size={10} /> STAGNANT
                  </span>
                )}
              </div>

              {/* Informations principales */}
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-1">
                  <Info size={12} /> Informations principales
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoField label="Client" value={selectedEquipement.client_name} />
                  <InfoField label="Type" value={selectedEquipement.type_equipement} />
                  <InfoField label="Nature des travaux" value={selectedEquipement.nature_travaux} />
                  <InfoField label="Marque" value={selectedEquipement.marque} />
                  <InfoField label="Puissance" value={selectedEquipement.puissance_kw !== null ? `${selectedEquipement.puissance_kw} kW` : null} />
                  <InfoField label="Urgence" value={selectedEquipement.urgence === "urgent" ? "🔴 Urgent" : "Normal"} />
                </div>
              </div>

              {/* Informations techniques */}
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3">
                  Informations techniques
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                  <InfoField label="NDI / DA / NS" value={selectedEquipement.ndi_da_ns} />
                  <InfoField label="MLE / Référence" value={selectedEquipement.mle_reference} />
                  <InfoField label="Tension" value={selectedEquipement.tension} />
                  <InfoField label="Vitesse" value={selectedEquipement.vitesse} />
                </div>
              </div>

              {/* Dates */}
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-1">
                  <CalendarClock size={12} /> Dates
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoField label="Date d'entrée" value={formatDate(selectedEquipement.created_at)} />
                  <InfoField label="Début intervention" value={formatDate(selectedEquipement.date_debut_intervention)} />
                  <InfoField label="Fin intervention" value={formatDate(selectedEquipement.date_fin_intervention)} />
                  <InfoField label="Date prévue de fin" value={formatDate(selectedEquipement.date_fin_prevue)} />
                  <InfoField label="Date de livraison" value={formatDate(selectedEquipement.date_livraison_reelle)} />
                  <InfoField
                    label="Rapport établi"
                    value={selectedEquipement.rapport_etabli === true ? "✅ Oui" : selectedEquipement.rapport_etabli === false ? "❌ Non" : "—"}
                  />
                </div>
              </div>

              {/* Durées calculées */}
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-1">
                  <Clock size={12} /> Durées calculées
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <DurationField
                    label="Délai avant réparation"
                    value={
                      selectedEquipement.date_debut_intervention
                        ? `${getDaysBetween(selectedEquipement.created_at, selectedEquipement.date_debut_intervention)}j`
                        : null
                    }
                    sublabel="Entrée → Début"
                  />
                  <DurationField
                    label="Durée d'intervention"
                    value={
                      selectedEquipement.date_debut_intervention
                        ? `${getDaysBetween(selectedEquipement.date_debut_intervention, selectedEquipement.date_fin_intervention)}j`
                        : null
                    }
                    sublabel={selectedEquipement.date_fin_intervention ? "Début → Fin" : "Début → Aujourd'hui"}
                  />
                  <DurationField
                    label="Durée totale"
                    value={`${getDaysBetween(selectedEquipement.created_at, selectedEquipement.date_fin_intervention || selectedEquipement.date_livraison_reelle)}j`}
                    sublabel="Entrée → Fin/Livraison"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end sticky bottom-0 bg-white">
              <button
                onClick={() => setSelectedEquipement(null)}
                className="px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Composants helper pour la modale ---
function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

function DurationField({ label, value, sublabel }: { label: string; value: string | null; sublabel?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{label}</p>
      <p className="text-lg font-bold text-amber-700">{value || "—"}</p>
      {sublabel && <p className="text-[9px] text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}