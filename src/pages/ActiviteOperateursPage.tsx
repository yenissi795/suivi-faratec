import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Clock, Wrench, BarChart2, Calendar,
  Loader2, ChevronDown, Activity, Crown,
  Search, X, FileDown, FileSpreadsheet, Filter
} from "lucide-react";
import { calculerTempsTravail, formatDureeMinutes } from "../lib/workTime";
import { buildCsv } from "../lib/reportPdf";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Operateur { id: string; full_name: string; is_active: boolean; }

interface Session {
  id: string;
  equipement_id: string;
  operateur_id: string;
  atelier_id: string | null;
  started_at: string;
  ended_at: string | null;
  equipements: { code_faratec: string | null; client_name: string } | null;
  ateliers: { name: string } | null;
}

type PeriodType = "semaine" | "mois" | "trimestre" | "annee" | "tout";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const periodTabs: { key: PeriodType; label: string }[] = [
  { key: "semaine",   label: "Semaine" },
  { key: "mois",      label: "Mois" },
  { key: "trimestre", label: "Trimestre" },
  { key: "annee",     label: "Année" },
  { key: "tout",      label: "Tout" },
];

const SEUIL_POLYVALENT = 50; // % minimum dans un atelier pour avoir une spécialité

function getPeriodBounds(period: PeriodType): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (period === "tout") {
    return {
      start: new Date("1970-01-01"),
      end: new Date("2100-01-01"),
      label: "Tout l'historique",
    };
  }
  if (period === "semaine") {
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day - 1)); mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    return { start: mon, end: sun, label: `Semaine du ${mon.toLocaleDateString("fr-FR")} au ${sun.toLocaleDateString("fr-FR")}` };
  }
  if (period === "mois") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end, label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
  }
  if (period === "trimestre") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
    return { start, end, label: `T${q + 1} ${now.getFullYear()}` };
  }
  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    label: `Année ${now.getFullYear()}`,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function Bar({ pct, color = "bg-amber-400" }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// Couleurs d'ateliers (basées sur le hash du nom pour rester stable)
const ATELIER_COLORS = [
  { bg: "bg-amber-100", text: "text-amber-700", bar: "bg-amber-400", pill: "bg-amber-500" },
  { bg: "bg-blue-100", text: "text-blue-700", bar: "bg-blue-400", pill: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-700", bar: "bg-emerald-400", pill: "bg-emerald-500" },
  { bg: "bg-violet-100", text: "text-violet-700", bar: "bg-violet-400", pill: "bg-violet-500" },
  { bg: "bg-rose-100", text: "text-rose-700", bar: "bg-rose-400", pill: "bg-rose-500" },
  { bg: "bg-cyan-100", text: "text-cyan-700", bar: "bg-cyan-400", pill: "bg-cyan-500" },
  { bg: "bg-orange-100", text: "text-orange-700", bar: "bg-orange-400", pill: "bg-orange-500" },
  { bg: "bg-teal-100", text: "text-teal-700", bar: "bg-teal-400", pill: "bg-teal-500" },
];

function getAtelierColor(nom: string) {
  let hash = 0;
  for (let i = 0; i < nom.length; i++) hash = nom.charCodeAt(i) + ((hash << 5) - hash);
  return ATELIER_COLORS[Math.abs(hash) % ATELIER_COLORS.length];
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function ActiviteOperateursPage() {
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("mois");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"specialites" | "ateliers">("specialites");
  const [searchTerm, setSearchTerm] = useState("");
  const [specialiteFilter, setSpecialiteFilter] = useState<string>("");

  // Modales KPIs
  const [showOperateursModal, setShowOperateursModal] = useState(false);
  const [showEquipementsModal, setShowEquipementsModal] = useState(false);

  // Chargement
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [opRes, sessRes] = await Promise.all([
        supabase.from("operateurs").select("id, full_name, is_active").order("full_name"),
        supabase
          .from("interventions_operateurs")
          .select("id, equipement_id, operateur_id, atelier_id, started_at, ended_at, equipements(code_faratec, client_name), ateliers(name)")
          .order("started_at", { ascending: false })
          .limit(5000),
      ]);
      setOperateurs((opRes.data as Operateur[]) || []);
      setSessions((sessRes.data as unknown as Session[]) || []);
      setLoading(false);
    })();
  }, []);

  const bounds = useMemo(() => getPeriodBounds(period), [period]);

  const opMap = useMemo(() => {
    const m = new Map<string, string>();
    operateurs.forEach(o => m.set(o.id, o.full_name));
    return m;
  }, [operateurs]);

  const currSessions = useMemo(() =>
    sessions.filter(s => { const d = new Date(s.started_at); return d >= bounds.start && d <= bounds.end; }),
    [sessions, bounds]
  );

  // ── Stats par opérateur ────────────────────────────────────────────────────
  const statsOp = useMemo(() => {
    const map = new Map<string, {
      tempsTotalMin: number;
      equipements: Set<string>;
      nbSessions: number;
      ateliers: Map<string, number>;
      eqDetails: Map<string, { code: string; client: string; tempsMin: number; sessions: number }>;
    }>();

    currSessions.forEach(s => {
      if (!map.has(s.operateur_id)) {
        map.set(s.operateur_id, { tempsTotalMin: 0, equipements: new Set(), nbSessions: 0, ateliers: new Map(), eqDetails: new Map() });
      }
      const e = map.get(s.operateur_id)!;
      const min = calculerTempsTravail(s.started_at, s.ended_at);
      e.tempsTotalMin += min;
      e.equipements.add(s.equipement_id);
      e.nbSessions += 1;
      const atelierNom = s.ateliers?.name || "Non précisé";
      e.ateliers.set(atelierNom, (e.ateliers.get(atelierNom) || 0) + min);
      if (!e.eqDetails.has(s.equipement_id)) {
        e.eqDetails.set(s.equipement_id, { code: s.equipements?.code_faratec || "—", client: s.equipements?.client_name || "—", tempsMin: 0, sessions: 0 });
      }
      const eq = e.eqDetails.get(s.equipement_id)!;
      eq.tempsMin += min;
      eq.sessions += 1;
    });

    return Array.from(map.entries()).map(([id, d]) => {
      // Detection de specialite : atelier le plus frequent
      const ateliersSorted = Array.from(d.ateliers.entries()).sort((a, b) => b[1] - a[1]);
      const topAtelier = ateliersSorted[0];
      let specialite: string;
      let pctTopAtelier = 0;

      if (topAtelier && d.tempsTotalMin > 0) {
        pctTopAtelier = Math.round((topAtelier[1] / d.tempsTotalMin) * 100);
        if (pctTopAtelier >= SEUIL_POLYVALENT) {
          specialite = topAtelier[0];
        } else {
          specialite = "Polyvalent";
        }
      } else {
        specialite = "Polyvalent";
      }

      return {
        id,
        nom: opMap.get(id) || "Inconnu",
        tempsTotalMin: d.tempsTotalMin,
        nbEquipements: d.equipements.size,
        nbSessions: d.nbSessions,
        tempsMoyenParEq: d.equipements.size > 0 ? Math.round(d.tempsTotalMin / d.equipements.size) : 0,
        ateliers: ateliersSorted,
        eqDetails: Array.from(d.eqDetails.entries()).map(([eqId, eq]) => ({ eqId, ...eq })).sort((a, b) => b.tempsMin - a.tempsMin),
        specialite,
        pctTopAtelier,
      };
    }).sort((a, b) => b.tempsTotalMin - a.tempsTotalMin);
  }, [currSessions, opMap]);

  // Filtre par recherche
  const statsOpFiltered = useMemo(() => {
    let list = statsOp;
    if (searchTerm) {
      const s = searchTerm.toLowerCase().trim();
      list = list.filter(op => op.nom.toLowerCase().includes(s));
    }
    if (specialiteFilter) {
      list = list.filter(op => op.specialite === specialiteFilter);
    }
    return list;
  }, [statsOp, searchTerm, specialiteFilter]);

  // Groupes par specialite
  const groupesSpecialite = useMemo(() => {
    const map = new Map<string, typeof statsOpFiltered>();
    statsOpFiltered.forEach(op => {
      if (!map.has(op.specialite)) map.set(op.specialite, []);
      map.get(op.specialite)!.push(op);
    });
    // Trier : les specialites avec le plus de temps total d'abord
    return Array.from(map.entries())
      .map(([nom, ops]) => ({
        nom,
        operateurs: ops,
        tempsTotal: ops.reduce((s, o) => s + o.tempsTotalMin, 0),
      }))
      .sort((a, b) => b.tempsTotal - a.tempsTotal);
  }, [statsOpFiltered]);

  // Liste des specialites (pour les filtres)
  const specialitesDisponibles = useMemo(() => {
    const set = new Set<string>();
    statsOp.forEach(op => set.add(op.specialite));
    return Array.from(set).sort();
  }, [statsOp]);

  // ── Stats par atelier ──────────────────────────────────────────────────────
  const statsAtelier = useMemo(() => {
    const map = new Map<string, {
      tempsTotalMin: number;
      equipements: Set<string>;
      operateurs: Map<string, { tempsTotalMin: number; nbEq: Set<string>; nbSessions: number }>;
    }>();
    currSessions.forEach(s => {
      const nom = s.ateliers?.name || "Non précisé";
      if (!map.has(nom)) map.set(nom, { tempsTotalMin: 0, equipements: new Set(), operateurs: new Map() });
      const a = map.get(nom)!;
      const min = calculerTempsTravail(s.started_at, s.ended_at);
      a.tempsTotalMin += min;
      a.equipements.add(s.equipement_id);
      if (!a.operateurs.has(s.operateur_id)) a.operateurs.set(s.operateur_id, { tempsTotalMin: 0, nbEq: new Set(), nbSessions: 0 });
      const op = a.operateurs.get(s.operateur_id)!;
      op.tempsTotalMin += min;
      op.nbEq.add(s.equipement_id);
      op.nbSessions += 1;
    });
    return Array.from(map.entries()).map(([nom, d]) => ({
      nom,
      tempsTotalMin: d.tempsTotalMin,
      nbEquipements: d.equipements.size,
      operateurs: Array.from(d.operateurs.entries()).map(([opId, op]) => ({
        id: opId,
        nom: opMap.get(opId) || "Inconnu",
        tempsTotalMin: op.tempsTotalMin,
        nbEq: op.nbEq.size,
        nbSessions: op.nbSessions,
        tempsMoyenParEq: op.nbEq.size > 0 ? Math.round(op.tempsTotalMin / op.nbEq.size) : 0,
      })).sort((a, b) => b.tempsTotalMin - a.tempsTotalMin),
    })).sort((a, b) => b.tempsTotalMin - a.tempsTotalMin);
  }, [currSessions, opMap]);

  // ── KPIs globaux ──────────────────────────────────────────────────────────
  const globaux = useMemo(() => {
    const totalMin = currSessions.reduce((s, x) => s + calculerTempsTravail(x.started_at, x.ended_at), 0);
    const actifs = new Set(currSessions.map(s => s.operateur_id)).size;
    const nbEq = new Set(currSessions.map(s => s.equipement_id)).size;
    const tempsMoyenEq = nbEq > 0 ? Math.round(totalMin / nbEq) : 0;
    const atelierCount = new Map<string, number>();
    currSessions.forEach(s => {
      const n = s.ateliers?.name || "Non précisé";
      atelierCount.set(n, (atelierCount.get(n) || 0) + calculerTempsTravail(s.started_at, s.ended_at));
    });
    const topAtelier = [...atelierCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    return { totalMin, actifs, nbEq, tempsMoyenEq, topAtelier };
  }, [currSessions]);

  // Listes pour les modales
  const operateursActifs = useMemo(() => statsOp, [statsOp]);

  const equipementsTraites = useMemo(() => {
    const map = new Map<string, { code: string; client: string; tempsTotalMin: number }>();
    currSessions.forEach(s => {
      const id = s.equipement_id;
      const min = calculerTempsTravail(s.started_at, s.ended_at);
      if (!map.has(id)) {
        map.set(id, { code: s.equipements?.code_faratec || "—", client: s.equipements?.client_name || "—", tempsTotalMin: 0 });
      }
      map.get(id)!.tempsTotalMin += min;
    });
    return Array.from(map.values()).sort((a, b) => b.tempsTotalMin - a.tempsTotalMin);
  }, [currSessions]);

  const selectedOp = useMemo(() => statsOp.find(o => o.id === selectedId) || null, [statsOp, selectedId]);
  const selectedSess = useMemo(() => currSessions.filter(s => s.operateur_id === selectedId), [currSessions, selectedId]);

  // ── Exports ────────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows: string[][] = [
      ["FARATEC - Activité Opérateurs"],
      [bounds.label],
      [],
      ["KPI GLOBAUX"],
      ["Heures travaillées", formatDureeMinutes(globaux.totalMin)],
      ["Opérateurs actifs", String(globaux.actifs)],
      ["Équipements traités", String(globaux.nbEq)],
      ["Temps moyen / éq.", formatDureeMinutes(globaux.tempsMoyenEq)],
      ["Atelier le + actif", globaux.topAtelier],
      [],
      ["PAR OPÉRATEUR"],
      ["Nom", "Spécialité", "Temps total", "Équipements", "Temps moyen/éq.", "Interventions"],
      ...statsOp.map(op => [
        op.nom,
        op.specialite,
        formatDureeMinutes(op.tempsTotalMin),
        String(op.nbEquipements),
        formatDureeMinutes(op.tempsMoyenParEq),
        String(op.nbSessions),
      ]),
      [],
      ["PAR ATELIER"],
      ["Atelier", "Temps total", "Équipements", "Opérateurs"],
      ...statsAtelier.map(a => [
        a.nom,
        formatDureeMinutes(a.tempsTotalMin),
        String(a.nbEquipements),
        String(a.operateurs.length),
      ]),
    ];
    buildCsv(rows, `FARATEC_Activite_Operateurs_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportPdf = async () => {
    const { buildRapportPdf } = await import("../lib/reportPdf");

    const sections: { heading: string; rows: [string, string][] }[] = [
      {
        heading: "KPI globaux",
        rows: [
          ["Indicateur", "Valeur"] as [string, string],
          ["Heures travaillées", formatDureeMinutes(globaux.totalMin)],
          ["Opérateurs actifs", String(globaux.actifs)],
          ["Équipements traités", String(globaux.nbEq)],
          ["Temps moyen par équipement", formatDureeMinutes(globaux.tempsMoyenEq)],
          ["Atelier le plus actif", globaux.topAtelier],
        ],
      },
      // Une section par spécialité
      ...groupesSpecialite.map(g => ({
        heading: `Spécialité : ${g.nom} (${g.operateurs.length} op., ${formatDureeMinutes(g.tempsTotal)})`,
        rows: [
          ["Opérateur", "Temps total"] as [string, string],
          ...g.operateurs.map(op =>
            [`${op.nom} (${op.nbEquipements} éq., ${op.nbSessions} interv.)`, formatDureeMinutes(op.tempsTotalMin)] as [string, string]
          ),
        ],
      })),
      {
        heading: "Par atelier",
        rows: [
          ["Atelier", "Temps total"] as [string, string],
          ...statsAtelier.map(a => [`${a.nom} (${a.operateurs.length} op., ${a.nbEquipements} éq.)`, formatDureeMinutes(a.tempsTotalMin)] as [string, string]),
        ],
      },
    ];
    const doc = await buildRapportPdf(
      "Activité Opérateurs",
      bounds.label,
      sections,
      [
        { label: "Heures", value: formatDureeMinutes(globaux.totalMin), color: [245, 158, 11] },
        { label: "Opérateurs", value: String(globaux.actifs), color: [37, 99, 235] },
        { label: "Équipements", value: String(globaux.nbEq), color: [139, 92, 246] },
      ]
    );
    doc.save(`FARATEC_Activite_Operateurs_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Activity size={20} className="text-amber-500" />
            Activité Opérateurs
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Temps travaillé · Équipements traités · Répartition par spécialité
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm"
          >
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-4 py-2 bg-neutral-900 text-amber-500 hover:bg-neutral-800 shadow-sm"
          >
            <FileDown size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Filtres période */}
      <div className="flex flex-wrap gap-2">
        {periodTabs.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-1.5 transition ${
              period === p.key
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            }`}
          >
            <Calendar size={13} />
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-amber-500" size={28} />
        </div>
      ) : (
        <>
          {/* ── KPIs globaux ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-400">
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mb-1">
                <Clock size={12} className="text-amber-500" />Heures travaillées
              </p>
              <p className="text-xl font-bold text-slate-800 truncate">{formatDureeMinutes(globaux.totalMin)}</p>
            </div>

            <button
              onClick={() => setShowOperateursModal(true)}
              className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-400 hover:shadow-md transition text-left cursor-pointer"
            >
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mb-1">
                <Users size={12} className="text-blue-500" />Opérateurs actifs
              </p>
              <p className="text-xl font-bold text-slate-800 truncate">{globaux.actifs}</p>
              <p className="text-[10px] text-blue-500 mt-1 font-semibold">Voir la liste →</p>
            </button>

            <button
              onClick={() => setShowEquipementsModal(true)}
              className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-violet-400 hover:shadow-md transition text-left cursor-pointer"
            >
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mb-1">
                <Wrench size={12} className="text-violet-500" />Équipements traités
              </p>
              <p className="text-xl font-bold text-slate-800 truncate">{globaux.nbEq}</p>
              <p className="text-[10px] text-violet-500 mt-1 font-semibold">Voir la liste →</p>
            </button>

            <button
              onClick={() => { setActiveTab("ateliers"); setSelectedId(null); }}
              className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emerald-400 hover:shadow-md transition text-left cursor-pointer"
            >
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mb-1">
                <BarChart2 size={12} className="text-emerald-500" />Atelier le + actif
              </p>
              <p className="text-base font-bold text-slate-800 truncate">{globaux.topAtelier}</p>
              <p className="text-[10px] text-emerald-500 mt-1 font-semibold">Voir le détail →</p>
            </button>
          </div>

          {/* ── Barre de recherche ── */}
          <div className="bg-white rounded-xl p-3 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher un opérateur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ── Onglets ── */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {(["specialites", "ateliers"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedId(null); }}
                className={`text-sm font-medium px-4 py-1.5 rounded-lg transition ${
                  activeTab === tab ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "specialites" ? "Par spécialité" : "Par atelier"}
              </button>
            ))}
          </div>

          {/* ══════════════════ VUE PAR SPÉCIALITÉ ══════════════════ */}
          {activeTab === "specialites" && (
            <div className="space-y-5">
              {/* Filtres spécialités */}
              {specialitesDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSpecialiteFilter("")}
                    className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                      specialiteFilter === "" ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Filter size={12} /> Tous ({statsOp.length})
                  </button>
                  {specialitesDisponibles.map(sp => {
                    const count = statsOp.filter(o => o.specialite === sp).length;
                    const color = getAtelierColor(sp);
                    return (
                      <button
                        key={sp}
                        onClick={() => setSpecialiteFilter(sp)}
                        className={`text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                          specialiteFilter === sp
                            ? `${color.pill} text-white`
                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {sp} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {groupesSpecialite.length === 0 ? (
                <EmptyState searchTerm={searchTerm} />
              ) : (
                groupesSpecialite.map(groupe => {
                  const color = getAtelierColor(groupe.nom);
                  const maxTemps = groupe.operateurs[0]?.tempsTotalMin || 1;

                  return (
                    <div key={groupe.nom} className="bg-white rounded-xl shadow-sm overflow-hidden">
                      {/* En-tête du groupe */}
                      <div className={`p-4 border-b border-slate-100 ${color.bg}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg ${color.pill} text-white flex items-center justify-center`}>
                              <Crown size={14} />
                            </div>
                            <div>
                              <h2 className={`text-sm font-bold ${color.text}`}>{groupe.nom}</h2>
                              <p className="text-[11px] text-slate-500">
                                {groupe.operateurs.length} opérateur{groupe.operateurs.length > 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-base font-bold ${color.text}`}>{formatDureeMinutes(groupe.tempsTotal)}</p>
                            <p className="text-[10px] text-slate-400">total groupe</p>
                          </div>
                        </div>
                      </div>

                      {/* Opérateurs du groupe */}
                      <div className="divide-y divide-slate-100">
                        {groupe.operateurs.map((op, index) => {
                          const isOpen = selectedId === op.id;
                          const pctBar = Math.round((op.tempsTotalMin / maxTemps) * 100);
                          const isTop = index === 0;

                          return (
                            <div key={op.id} className={`transition ${isOpen ? "bg-slate-50/50" : ""}`}>
                              <button
                                onClick={() => setSelectedId(isOpen ? null : op.id)}
                                className="w-full p-4 flex items-center gap-4 text-left hover:bg-slate-50/60 transition"
                              >
                                <div className="relative shrink-0">
                                  <div className={`w-9 h-9 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-sm font-bold`}>
                                    {op.nom.charAt(0).toUpperCase()}
                                  </div>
                                  {isTop && (
                                    <div className={`absolute -top-1 -right-1 ${color.pill} rounded-full p-0.5`}>
                                      <Crown size={11} className="text-white" fill="white" />
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-slate-800">{op.nom}</p>
                                    {isTop && (
                                      <span className={`text-[9px] ${color.bg} ${color.text} px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5`}>
                                        <Crown size={8} /> TOP
                                      </span>
                                    )}
                                    {op.specialite === "Polyvalent" && (
                                      <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">
                                        POLYVALENT
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                                    <span>{op.nbEquipements} équipement{op.nbEquipements > 1 ? "s" : ""}</span>
                                    <span>·</span>
                                    <span>{op.nbSessions} intervention{op.nbSessions > 1 ? "s" : ""}</span>
                                  </div>
                                  <div className="mt-2">
                                    <Bar pct={pctBar} color={color.bar} />
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <p className={`text-lg font-bold ${color.text}`}>{formatDureeMinutes(op.tempsTotalMin)}</p>
                                  <p className="text-[10px] text-slate-400">{formatDureeMinutes(op.tempsMoyenParEq)}/éq.</p>
                                </div>

                                <ChevronDown size={16} className={`text-slate-300 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>

                              {isOpen && selectedOp && selectedOp.id === op.id && (
                                <div className="border-t border-slate-100 bg-white">
                                  {selectedOp.ateliers.length > 0 && (
                                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Répartition par atelier</p>
                                      <div className="space-y-2.5">
                                        {selectedOp.ateliers.map(([nom, min]) => {
                                          const pct = Math.round((min / selectedOp.tempsTotalMin) * 100);
                                          const c = getAtelierColor(nom);
                                          return (
                                            <div key={nom}>
                                              <div className="flex justify-between text-xs mb-1">
                                                <span className="font-medium text-slate-700">{nom}</span>
                                                <span className="text-slate-500">{formatDureeMinutes(min)} <span className="text-slate-300">·</span> {pct}%</span>
                                              </div>
                                              <Bar pct={pct} color={c.bar} />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div className="p-4 border-b border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Équipements traités ({selectedOp.eqDetails.length})</p>
                                    <div className="space-y-2">
                                      {selectedOp.eqDetails.map(eq => (
                                        <div key={eq.eqId} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                                          <div>
                                            <span className="font-semibold text-slate-700">{eq.code}</span>
                                            <span className="text-slate-400 ml-1">· {eq.client}</span>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-bold text-amber-600">{formatDureeMinutes(eq.tempsMin)}</span>
                                            <span className="text-slate-400 ml-1">· {eq.sessions} sess.</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="p-4">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Historique des interventions ({selectedSess.length})</p>
                                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                      {selectedSess.map(s => {
                                        const min = calculerTempsTravail(s.started_at, s.ended_at);
                                        return (
                                          <div key={s.id} className="flex items-center gap-3 text-xs py-2 border-b border-slate-50 last:border-0">
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium text-slate-700 truncate">
                                                <span className="font-bold">{s.equipements?.code_faratec || "—"}</span>
                                                <span className="text-slate-400"> · {s.equipements?.client_name}</span>
                                              </p>
                                              <p className="text-slate-400 mt-0.5">
                                                {s.ateliers?.name || "Atelier non précisé"} · {formatDate(s.started_at)}
                                                {" "}de {formatTime(s.started_at)}{s.ended_at ? ` à ${formatTime(s.ended_at)}` : ""}
                                              </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                              <p className="font-bold text-amber-600">{formatDureeMinutes(min)}</p>
                                              {!s.ended_at && (
                                                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">EN COURS</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ══════════════════ VUE PAR ATELIER ══════════════════ */}
          {activeTab === "ateliers" && (
            <div className="space-y-4">
              {statsAtelier.length === 0 ? (
                <EmptyState searchTerm="" />
              ) : (
                statsAtelier.map(atelier => {
                  const maxOpTemps = atelier.operateurs[0]?.tempsTotalMin || 1;
                  const color = getAtelierColor(atelier.nom);
                  return (
                    <div key={atelier.nom} className="bg-white rounded-xl shadow-sm overflow-hidden">
                      <div className={`p-4 border-b border-slate-100 ${color.bg} flex items-center justify-between`}>
                        <div>
                          <p className={`font-semibold text-sm ${color.text}`}>{atelier.nom}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {atelier.operateurs.length} opérateur{atelier.operateurs.length > 1 ? "s" : ""} · {atelier.nbEquipements} équipement{atelier.nbEquipements > 1 ? "s" : ""}
                          </p>
                        </div>
                        <p className={`text-base font-bold ${color.text}`}>{formatDureeMinutes(atelier.tempsTotalMin)}</p>
                      </div>

                      <div className="divide-y divide-slate-50">
                        {atelier.operateurs.map(op => {
                          const pct = Math.round((op.tempsTotalMin / maxOpTemps) * 100);
                          return (
                            <div key={op.id} className="p-3 flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-xs font-bold shrink-0`}>
                                {op.nom.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium text-slate-700 truncate">{op.nom}</p>
                                  <div className="flex items-center gap-3 shrink-0 ml-2">
                                    <span className="text-[11px] text-slate-400">{op.nbEq} éq. · {formatDureeMinutes(op.tempsMoyenParEq)}/éq.</span>
                                    <span className={`text-sm font-bold ${color.text}`}>{formatDureeMinutes(op.tempsTotalMin)}</span>
                                  </div>
                                </div>
                                <Bar pct={pct} color={color.bar} />
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
          )}
        </>
      )}

      {/* ─── MODALE Opérateurs actifs ─── */}
      {showOperateursModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowOperateursModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Users size={16} className="text-blue-600" /> Opérateurs actifs
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{operateursActifs.length} sur la période · {bounds.label}</p>
              </div>
              <button onClick={() => setShowOperateursModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {operateursActifs.map((op, i) => {
                const color = getAtelierColor(op.specialite);
                return (
                  <div key={op.id} className="p-3 flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? "bg-amber-500 text-white" :
                      i === 1 ? "bg-slate-300 text-slate-700" :
                      i === 2 ? "bg-amber-700 text-white" :
                      "bg-slate-100 text-slate-500"
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{op.nom}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className={`${color.text} font-semibold`}>{op.specialite}</span>
                        {" "}· {op.nbEquipements} éq. · {op.nbSessions} interv.
                      </p>
                    </div>
                    <p className="text-sm font-bold text-amber-600 shrink-0">{formatDureeMinutes(op.tempsTotalMin)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALE Équipements traités ─── */}
      {showEquipementsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEquipementsModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Wrench size={16} className="text-violet-600" /> Équipements traités
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{equipementsTraites.length} sur la période · {bounds.label}</p>
              </div>
              <button onClick={() => setShowEquipementsModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {equipementsTraites.map((eq, i) => (
                <div key={i} className="p-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{eq.code}</p>
                    <p className="text-[11px] text-slate-500 truncate">· {eq.client}</p>
                  </div>
                  <p className="text-sm font-bold text-violet-600 shrink-0">{formatDureeMinutes(eq.tempsTotalMin)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ searchTerm }: { searchTerm: string }) {
  return (
    <div className="bg-white rounded-xl p-14 shadow-sm text-center">
      <Activity size={36} className="mx-auto text-slate-200 mb-3" />
      {searchTerm ? (
        <>
          <p className="text-sm font-medium text-slate-500">Aucun opérateur ne correspond à "{searchTerm}".</p>
          <p className="text-xs text-slate-400 mt-1">Essayez un autre nom.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">Aucune activité enregistrée sur cette période.</p>
          <p className="text-xs text-slate-400 mt-1">Les sessions se créent lors des observations de ronde.</p>
        </>
      )}
    </div>
  );
}