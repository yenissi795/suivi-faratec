import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Search, FileDown, Loader2, Calendar, CalendarDays,
  CalendarRange, Target, Package, CheckCircle2, PlayCircle,
  Hourglass, Flag, Zap, TrendingUp
} from "lucide-react";

interface Equipement {
  id: string;
  code_faratec: string | null;
  client_name: string;
  type_equipement: string;
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

export default function VueClientPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedClient, setSelectedClient] = useState<string>("");
  const [searchClient, setSearchClient] = useState("");
  const [showClientList, setShowClientList] = useState(false);

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
      .select("id, code_faratec, client_name, type_equipement, marque, puissance_kw, ndi_da_ns, mle_reference, tension, vitesse, urgence, statut, pourcentage_global, created_at, date_livraison_reelle, date_debut_intervention, date_fin_intervention")
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

    // custom
    const s = new Date(customStart); s.setHours(0, 0, 0, 0);
    const e = new Date(customEnd); e.setHours(23, 59, 59, 999);
    return { start: s, end: e, label: `Du ${s.toLocaleDateString("fr-FR")} au ${e.toLocaleDateString("fr-FR")}` };
  }, [period, customStart, customEnd]);

  // --- FILTRAGE FINAL ---
  const filteredEquipements = useMemo(() => {
    if (!selectedClient) return [];
    return equipements.filter((e) => {
      if (e.client_name !== selectedClient) return false;
      const d = new Date(e.created_at);
      return d >= periodBounds.start && d <= periodBounds.end;
    });
  }, [equipements, selectedClient, periodBounds]);

  // --- STATS ---
  const stats = useMemo(() => {
    const total = filteredEquipements.length;
    const enAttente = filteredEquipements.filter((e) => e.pourcentage_global === 0).length;
    const enCours = filteredEquipements.filter((e) => e.pourcentage_global > 0 && e.pourcentage_global < 100).length;
    const termine = filteredEquipements.filter((e) => e.pourcentage_global >= 100 && e.statut !== "livre").length;
    const livres = filteredEquipements.filter((e) => e.statut === "livre").length;
    const urgents = filteredEquipements.filter((e) => e.urgence === "urgent" && e.statut !== "livre").length;
    return { total, enAttente, enCours, termine, livres, urgents };
  }, [filteredEquipements]);

  // --- TÉLÉCHARGEMENT PDF ---
  const handleDownloadPdf = async () => {
    if (!selectedClient) return;
    const { buildClientEquipementsPdf } = await import("../lib/reportPdf");
    const doc = await buildClientEquipementsPdf({
      client_name: selectedClient,
      periode_label: periodBounds.label,
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
    const filename = `FARATEC_${selectedClient.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
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
            <Users size={20} className="text-amber-600" />
            Vue Client
          </h1>
          <p className="text-sm text-slate-500">Liste des equipements d'un client, avec export PDF.</p>
        </div>
        {selectedClient && filteredEquipements.length > 0 && (
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-amber-500 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition"
          >
            <FileDown size={14} /> Telecharger PDF
          </button>
        )}
      </div>

      {/* --- SÉLECTEUR CLIENT --- */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        {selectedClient ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Client selectionne</p>
              <p className="font-bold text-slate-800 text-lg">{selectedClient}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {filteredEquipements.length} equipement{filteredEquipements.length > 1 ? "s" : ""} sur la periode
              </p>
            </div>
            <button
              onClick={() => { setSelectedClient(""); setSearchClient(""); }}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium shrink-0"
            >
              Changer
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Selectionner un client</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={searchClient}
                onChange={(e) => { setSearchClient(e.target.value); setShowClientList(true); }}
                onFocus={() => setShowClientList(true)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {showClientList && (
              <div className="mt-2 max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {filteredClients.length === 0 ? (
                  <p className="text-sm text-slate-400 p-4 text-center">Aucun client trouve.</p>
                ) : (
                  filteredClients.map((c) => {
                    const count = equipements.filter((e) => e.client_name === c).length;
                    return (
                      <button
                        key={c}
                        onClick={() => { setSelectedClient(c); setShowClientList(false); }}
                        className="w-full text-left p-3 hover:bg-amber-50/50 transition flex items-center justify-between"
                      >
                        <span className="text-sm font-semibold text-slate-800">{c}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
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

      {/* --- SÉLECTEUR PÉRIODE --- */}
      {selectedClient && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Periode</p>
          <div className="flex flex-wrap gap-2">
            {periodTabs.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 transition ${
                  period === p.key ? "bg-amber-500 text-neutral-900 shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <p.icon size={14} />
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
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
          <p className="text-xs text-slate-500 mt-3">
            <strong>Periode :</strong> {periodBounds.label}
          </p>
        </div>
      )}

      {/* --- KPIs --- */}
      {selectedClient && (
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
      {selectedClient && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
              <Package size={16} className="text-amber-600" />
              Equipements de {selectedClient}
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
              <p className="text-sm text-slate-400">Aucun equipement sur cette periode.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-left font-semibold">Code Faratec</th>
                    <th className="p-2 text-left font-semibold">Type</th>
                    <th className="p-2 text-left font-semibold">Marque</th>
                    <th className="p-2 text-center font-semibold">Puis.</th>
                    <th className="p-2 text-left font-semibold">NDI</th>
                    <th className="p-2 text-left font-semibold">MLE</th>
                    <th className="p-2 text-center font-semibold">Tension</th>
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
                        <td className="p-2 text-slate-600">{e.type_equipement}</td>
                        <td className="p-2 text-slate-600">{e.marque || "—"}</td>
                        <td className="p-2 text-center text-slate-600">{e.puissance_kw ? `${e.puissance_kw}kW` : "—"}</td>
                        <td className="p-2 text-slate-500 text-[10px]">{e.ndi_da_ns || "—"}</td>
                        <td className="p-2 text-slate-500 text-[10px]">{e.mle_reference || "—"}</td>
                        <td className="p-2 text-center text-slate-500 text-[10px]">{e.tension || "—"}</td>
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
      )}

      {/* --- ÉTAT VIDE --- */}
      {!selectedClient && !loading && (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <Users size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Selectionnez un client pour voir ses equipements.</p>
        </div>
      )}
    </div>
  );
}