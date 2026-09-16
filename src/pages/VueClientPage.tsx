import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Search, FileDown, Loader2, Calendar, CalendarDays,
  CalendarRange, Target, Package, CheckCircle2, PlayCircle,
  Hourglass, Flag, Zap, TrendingUp, Filter, X, ChevronDown,
  ChevronUp, Sheet, RotateCcw, Building2
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
}

type PeriodType = "semaine" | "mois" | "annee" | "custom" | "tout";
type StatutFiltre = "tous" | "en_attente" | "en_cours" | "termine" | "livre";

export default function VueClientPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
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
  const [filterStatut, setFilterStatut] = useState<StatutFiltre>("tous");
  const [filterUrgence, setFilterUrgence] = useState<"tous" | "urgent" | "normal">("tous");
  const [filterDateExacte, setFilterDateExacte] = useState("");

  // Période
  const [period, setPeriod] = useState<PeriodType>("tout");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  // --- CHARGEMENT ---
  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("equipements")
      .select("id, code_faratec, client_name, type_equipement, nature_travaux, marque, puissance_kw, ndi_da_ns, mle_reference, tension, vitesse, urgence, statut, pourcentage_global, created_at, date_livraison_reelle, date_debut_intervention, date_fin_intervention")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setEquipements((data as Equipement[]) || []);
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

  // --- LISTES UNIQUES (types, natures, marques) ---
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

  // --- BORNES DE LA PÉRIODE ---
  const periodBounds = useMemo(() => {
    const now = new Date();
    if (period === "tout") return { start: new Date("1970-01-01"), end: new Date("2100-01-01"), label: "Tout l'historique" };

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
      return { start, end, label: `Annee ${now.getFullYear()}` };
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

      // 2. Filtre date exacte (prioritaire sur la période)
      if (filterDateExacte) {
        const eqDate = new Date(e.created_at).toISOString().slice(0, 10);
        if (eqDate !== filterDateExacte) return false;
      } else {
        // Sinon filtre période normale
        const d = new Date(e.created_at);
        if (d < periodBounds.start || d > periodBounds.end) return false;
      }

      // 3. Recherche texte enrichie
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

      // 4. Filtre type
      if (filterType && e.type_equipement !== filterType) return false;

      // 5. Filtre nature des travaux
      if (filterNature && e.nature_travaux !== filterNature) return false;

      // 6. Filtre marque
      if (filterMarque && e.marque !== filterMarque) return false;

      // 7. Filtre puissance (valeur exacte)
      if (filterPuissance) {
        const p = Number(filterPuissance);
        if (isNaN(p) || e.puissance_kw !== p) return false;
      }

      // 8. Filtre NDI/DA/NS (contains)
      if (filterNdi) {
        const s = filterNdi.toLowerCase().trim();
        if (!e.ndi_da_ns || !e.ndi_da_ns.toLowerCase().includes(s)) return false;
      }

      // 9. Filtre MLE/Référence (contains)
      if (filterMle) {
        const s = filterMle.toLowerCase().trim();
        if (!e.mle_reference || !e.mle_reference.toLowerCase().includes(s)) return false;
      }

      // 10. Filtre Tension (contains)
      if (filterTension) {
        const s = filterTension.toLowerCase().trim();
        if (!e.tension || !e.tension.toLowerCase().includes(s)) return false;
      }

      // 11. Filtre Vitesse (contains)
      if (filterVitesse) {
        const s = filterVitesse.toLowerCase().trim();
        if (!e.vitesse || !e.vitesse.toLowerCase().includes(s)) return false;
      }

      // 12. Filtre statut
      if (filterStatut !== "tous") {
        if (filterStatut === "livre" && e.statut !== "livre") return false;
        if (filterStatut === "en_attente" && (e.statut === "livre" || e.pourcentage_global > 0)) return false;
        if (filterStatut === "en_cours" && (e.statut === "livre" || e.pourcentage_global === 0 || e.pourcentage_global >= 100)) return false;
        if (filterStatut === "termine" && (e.statut === "livre" || e.pourcentage_global < 100)) return false;
      }

      // 13. Filtre urgence
      if (filterUrgence !== "tous") {
        if (filterUrgence === "urgent" && e.urgence !== "urgent") return false;
        if (filterUrgence === "normal" && e.urgence === "urgent") return false;
      }

      return true;
    });
  }, [equipements, selectedClient, periodBounds, filterDateExacte, searchTerm, filterType, filterNature, filterMarque, filterPuissance, filterNdi, filterMle, filterTension, filterVitesse, filterStatut, filterUrgence]);

  // --- COMPTER LES FILTRES ACTIFS ---
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
    if (filterStatut !== "tous") n++;
    if (filterUrgence !== "tous") n++;
    if (filterDateExacte) n++;
    return n;
  }, [searchTerm, filterType, filterNature, filterMarque, filterPuissance, filterNdi, filterMle, filterTension, filterVitesse, filterStatut, filterUrgence, filterDateExacte]);

  // --- RÉINITIALISER LES FILTRES ---
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
    setFilterStatut("tous");
    setFilterUrgence("tous");
    setFilterDateExacte("");
    setPeriod("tout");
  };

  // --- STATS ---
  const stats = useMemo(() => {
    const total = filteredEquipements.length;
    const enAttente = filteredEquipements.filter((e) => e.pourcentage_global === 0 && e.statut !== "livre").length;
    const enCours = filteredEquipements.filter((e) => e.pourcentage_global > 0 && e.pourcentage_global < 100 && e.statut !== "livre").length;
    const termine = filteredEquipements.filter((e) => e.pourcentage_global >= 100 && e.statut !== "livre").length;
    const livres = filteredEquipements.filter((e) => e.statut === "livre").length;
    const urgents = filteredEquipements.filter((e) => e.urgence === "urgent" && e.statut !== "livre").length;
    return { total, enAttente, enCours, termine, livres, urgents };
  }, [filteredEquipements]);

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
      else if (e.pourcentage_global >= 100) statutLabel = "Termine";
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

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

  const getStatutInfo = (e: Equipement) => {
    if (e.statut === "livre") return { label: "LIVRÉ", color: "bg-slate-600 text-white", icon: CheckCircle2 };
    if (e.pourcentage_global >= 100) return { label: "TERMINÉ", color: "bg-green-600 text-white", icon: Flag };
    if (e.pourcentage_global > 0) return { label: "EN COURS", color: "bg-blue-600 text-white", icon: PlayCircle };
    return { label: "EN ATTENTE", color: "bg-amber-500 text-white", icon: Hourglass };
  };

  const periodTabs: { key: PeriodType; label: string; icon: any }[] = [
    { key: "semaine", label: "Semaine", icon: Calendar },
    { key: "mois", label: "Mois", icon: CalendarDays },
    { key: "annee", label: "Annee", icon: CalendarRange },
    { key: "custom", label: "Personnalise", icon: Target },
    { key: "tout", label: "Tout", icon: TrendingUp },
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
            Recherchez et consultez tous les équipements. Export PDF/CSV disponible.
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

      {/* --- BOUTON FILTRES + BARRE DE RECHERCHE --- */}
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

        {/* --- PANNEAU DE FILTRES --- */}
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
                        <p className="text-sm text-slate-400 p-3 text-center">Aucun client trouve.</p>
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
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Type equipement</p>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">Tous les types</option>
                  {typesUniques.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
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
                  {naturesUniques.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
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
                  {marquesUniques.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
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

            {/* NDI/DA/NS + MLE/Référence */}
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
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">MLE/Reference</p>
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

            {/* Statut + Urgence */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Statut</p>
                <select
                  value={filterStatut}
                  onChange={(e) => setFilterStatut(e.target.value as StatutFiltre)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="en_attente">En attente</option>
                  <option value="en_cours">En cours</option>
                  <option value="termine">Termine</option>
                  <option value="livre">Livre</option>
                </select>
              </div>
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
            </div>

            {/* Date exacte */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Date exacte (entree)</p>
              <input
                type="date"
                value={filterDateExacte}
                onChange={(e) => setFilterDateExacte(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              {filterDateExacte && (
                <p className="text-[10px] text-amber-700 mt-1">
                  La periode est ignoree tant que la date exacte est renseignee.
                </p>
              )}
            </div>

            {/* Période */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Periode</p>
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
                <strong>Periode :</strong> {periodBounds.label}
              </p>
            </div>

            {/* Bouton réinitialiser */}
            {nbFiltresActifs > 0 && (
              <button
                onClick={resetFiltres}
                className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 transition"
              >
                <RotateCcw size={12} /> Reinitialiser tous les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- KPIs --- */}
      {filteredEquipements.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-slate-400">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <Package size={10} /> Total
            </p>
            <p className="text-xl font-bold text-slate-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-amber-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <Hourglass size={10} /> En attente
            </p>
            <p className="text-xl font-bold text-slate-800">{stats.enAttente}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-blue-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <PlayCircle size={10} /> En cours
            </p>
            <p className="text-xl font-bold text-slate-800">{stats.enCours}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-green-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <CheckCircle2 size={10} /> Livres
            </p>
            <p className="text-xl font-bold text-slate-800">{stats.livres}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-red-500">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <Zap size={10} /> Urgents
            </p>
            <p className="text-xl font-bold text-slate-800">{stats.urgents}</p>
          </div>
        </div>
      )}

      {/* --- LISTE ÉQUIPEMENTS --- */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Package size={16} className="text-amber-600" />
            {selectedClient ? `Equipements de ${selectedClient}` : "Tous les equipements"}
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
            <p className="text-sm text-slate-400">Aucun equipement ne correspond aux criteres.</p>
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
                  <th className="p-2 text-left font-semibold">MLE/Reference</th>
                  <th className="p-2 text-center font-semibold">Tension</th>
                  <th className="p-2 text-center font-semibold">Vitesse</th>
                  <th className="p-2 text-center font-semibold">Statut</th>
                  <th className="p-2 text-right font-semibold">Avanc.</th>
                  <th className="p-2 text-center font-semibold">Entree</th>
                  <th className="p-2 text-center font-semibold">Livre le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEquipements.map((e) => {
                  const statutInfo = getStatutInfo(e);
                  const StatutIcon = statutInfo.icon;
                  const isUrgent = e.urgence === "urgent" && e.statut !== "livre";
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50/50 ${isUrgent ? "bg-red-50/30" : ""}`}>
                      <td className="p-2 font-bold text-slate-800">
                        {e.code_faratec || "—"}
                        {isUrgent && <Zap size={10} className="inline ml-1 text-red-600" />}
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

      {/* --- ÉTAT VIDE INITIAL --- */}
      {!loading && equipements.length === 0 && (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <Users size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Aucun equipement en base.</p>
        </div>
      )}
    </div>
  );
}