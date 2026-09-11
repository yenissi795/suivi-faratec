import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Calendar, CalendarDays, CalendarRange, FileDown,
  TrendingUp, TrendingDown, AlertTriangle, Target, Users, Factory,
  Package, Clock, CalendarClock, FileSpreadsheet, Award, Activity
} from "lucide-react";
import { buildRapportPdf, buildCsv } from "../lib/reportPdf";

interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  reference: string | null;
  statut: string;
  date_entree: string;
  pourcentage_global: number;
  created_at: string;
}
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  technicien_id: string | null;
  pourcentage: number;
  passage_date: string;
}
interface Atelier { id: string; name: string; }
interface Technicien { id: string; full_name: string; }

type PeriodType = "jour" | "semaine" | "mois" | "annee" | "custom";

export default function RapportsPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("jour");
  const [downloading, setDownloading] = useState(false);

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const load = async () => {
      const [{ data: eqData }, { data: passData }, { data: atData }, { data: techData }] = await Promise.all([
        supabase.from("equipements").select("*").is("deleted_at", null),
        supabase.from("journal_passages").select("*").is("deleted_at", null).order("passage_date", { ascending: true }),
        supabase.from("ateliers").select("id, name"),
        supabase.from("techniciens").select("id, full_name"),
      ]);
      setEquipements((eqData as Equipement[]) || []);
      setPassages((passData as Passage[]) || []);
      setAteliers((atData as Atelier[]) || []);
      setTechniciens((techData as Technicien[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // --- BORNES ---
  const bounds = useMemo(() => {
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const saturdayNoon = new Date(monday);
    saturdayNoon.setDate(monday.getDate() + 5);
    saturdayNoon.setHours(12, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const cS = new Date(customStart); cS.setHours(0, 0, 0, 0);
    const cE = new Date(customEnd); cE.setHours(23, 59, 59, 999);

    return {
      jour: { start: startOfDay, end: endOfDay, label: now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) },
      semaine: { start: monday, end: saturdayNoon, label: `Du ${monday.toLocaleDateString("fr-FR")} au ${saturdayNoon.toLocaleDateString("fr-FR")} (samedi midi)` },
      mois: { start: startOfMonth, end: endOfMonth, label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) },
      annee: { start: startOfYear, end: endOfYear, label: `Annee ${now.getFullYear()}` },
      custom: { start: cS, end: cE, label: `Du ${cS.toLocaleDateString("fr-FR")} au ${cE.toLocaleDateString("fr-FR")}` },
    };
  }, [customStart, customEnd, now]);

  const previousBounds = useMemo(() => {
    const b = bounds[period];
    const duration = b.end.getTime() - b.start.getTime();
    return { start: new Date(b.start.getTime() - duration), end: new Date(b.start.getTime() - 1) };
  }, [period, bounds]);

  const inRange = (iso: string, range: { start: Date; end: Date }) => {
    const d = new Date(iso);
    return d >= range.start && d <= range.end;
  };

  const currentRange = bounds[period];

  const passagesInPeriod = useMemo(() => passages.filter((p) => inRange(p.passage_date, currentRange)), [passages, currentRange]);
  const passagesPrev = useMemo(() => passages.filter((p) => inRange(p.passage_date, previousBounds)), [passages, previousBounds]);

  const equipementsInPeriod = useMemo(() => equipements.filter((e) => inRange(e.created_at, currentRange)), [equipements, currentRange]);
  const equipementsPrev = useMemo(() => equipements.filter((e) => inRange(e.created_at, previousBounds)), [equipements, previousBounds]);

  const vusIds = useMemo(() => new Set(passagesInPeriod.map((p) => p.equipement_id)), [passagesInPeriod]);
  const vusIdsPrev = useMemo(() => new Set(passagesPrev.map((p) => p.equipement_id)), [passagesPrev]);

  const equipementsActifs = useMemo(
    () => equipements.filter((e) => e.statut === "en_attente" || e.statut === "en_reparation"),
    [equipements]
  );

  const stagnantIds = useMemo(() => {
    const set = new Set<string>();
    equipementsActifs.forEach((e) => {
      const hist = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
      if (hist.length >= 3 && hist.every((p) => p.pourcentage === hist[0].pourcentage)) set.add(e.id);
    });
    return set;
  }, [equipementsActifs, passages]);

  const kpis = useMemo(() => {
    const vus = vusIds.size;
    const vusPrev = vusIdsPrev.size;
    const deltaVus = vusPrev > 0 ? Math.round(((vus - vusPrev) / vusPrev) * 100) : (vus > 0 ? 100 : 0);

    const passagesCount = passagesInPeriod.length;
    const passagesPrevCount = passagesPrev.length;
    const deltaPassages = passagesPrevCount > 0 ? Math.round(((passagesCount - passagesPrevCount) / passagesPrevCount) * 100) : (passagesCount > 0 ? 100 : 0);

    const nouveaux = equipementsInPeriod.length;
    const nouveauxPrev = equipementsPrev.length;
    const deltaNouveaux = nouveauxPrev > 0 ? Math.round(((nouveaux - nouveauxPrev) / nouveauxPrev) * 100) : (nouveaux > 0 ? 100 : 0);

    const nonVus = equipementsActifs.filter((e) => !vusIds.has(e.id)).length;
    const totalActifs = equipementsActifs.length;
    const stagnationRate = totalActifs > 0 ? Math.round((stagnantIds.size / totalActifs) * 100) : 0;

    return { vus, deltaVus, passagesCount, deltaPassages, nouveaux, deltaNouveaux, nonVus, stagnationRate };
  }, [vusIds, vusIdsPrev, passagesInPeriod, passagesPrev, equipementsInPeriod, equipementsPrev, equipementsActifs, stagnantIds]);

  const passagesParMois = useMemo(() => {
    const arr = Array(12).fill(0);
    passages.filter((p) => new Date(p.passage_date).getFullYear() === now.getFullYear())
      .forEach((p) => { arr[new Date(p.passage_date).getMonth()]++; });
    return arr;
  }, [passages, now]);

  // Charge par atelier - fusion des doublons par nom pour eviter les warnings React
  const chargeParAtelier = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    ateliers.forEach((a) => {
      const count = passagesInPeriod.filter((p) => p.atelier_id === a.id).length;
      const existing = map.get(a.name);
      if (existing) {
        existing.count += count;
      } else {
        map.set(a.name, { id: a.id, name: a.name, count });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [ateliers, passagesInPeriod]);

  const chargeParTechnicien = useMemo(() => {
    return techniciens.map((t) => ({
      id: t.id,
      name: t.full_name,
      count: passagesInPeriod.filter((p) => p.technicien_id === t.id).length,
    })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
  }, [techniciens, passagesInPeriod]);

  const topClients = useMemo(() => {
    const map: Record<string, number> = {};
    equipements.forEach((e) => { map[e.client_name] = (map[e.client_name] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [equipements]);

  const topTypes = useMemo(() => {
    const map: Record<string, number> = {};
    equipements.forEach((e) => { map[e.type_equipement] = (map[e.type_equipement] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [equipements]);

  const alertes = useMemo(() => {
    const list: { type: "danger" | "warning" | "info"; message: string }[] = [];

    if (stagnantIds.size > 0) {
      list.push({ type: "danger", message: `${stagnantIds.size} equipement(s) stagnant(s) - meme % sur les 3 derniers passages` });
    }

    const jamaisVus = equipementsActifs.filter((e) => {
      const hist = passages.filter((p) => p.equipement_id === e.id);
      const days = Math.floor((now.getTime() - new Date(e.created_at).getTime()) / 86400000);
      return hist.length === 0 && days > 7;
    });
    if (jamaisVus.length > 0) {
      list.push({ type: "warning", message: `${jamaisVus.length} equipement(s) jamais vu(s) depuis plus de 7 jours` });
    }

    if (kpis.stagnationRate > 30) {
      list.push({ type: "warning", message: `Taux de stagnation eleve : ${kpis.stagnationRate}% des actifs` });
    }

    if (kpis.nonVus > 5) {
      list.push({ type: "info", message: `${kpis.nonVus} equipement(s) non vu(s) sur la periode` });
    }

    return list;
  }, [stagnantIds, equipementsActifs, passages, kpis, now]);

  const equipementsStagnants = useMemo(() => {
    return equipementsActifs
      .filter((e) => stagnantIds.has(e.id))
      .map((e) => {
        const hist = passages.filter((p) => p.equipement_id === e.id).slice(0, 3);
        const lastDate = hist[0]?.passage_date;
        const days = lastDate ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000) : 0;
        return { ...e, daysStagnant: days };
      })
      .sort((a, b) => b.daysStagnant - a.daysStagnant);
  }, [equipementsActifs, stagnantIds, passages, now]);

  const progressionParEquipement = useMemo(() => {
    return Array.from(vusIds).map((id) => {
      const eq = equipements.find((e) => e.id === id);
      const obs = passagesInPeriod.filter((p) => p.equipement_id === id).sort((a, b) => a.passage_date.localeCompare(b.passage_date));
      return {
        equipement: eq,
        debut: obs[0]?.pourcentage ?? 0,
        fin: obs[obs.length - 1]?.pourcentage ?? 0,
        nbTournees: obs.length,
      };
    }).filter((p) => p.equipement);
  }, [vusIds, equipements, passagesInPeriod]);

  const progressionMoyenne = progressionParEquipement.length > 0
    ? Math.round(progressionParEquipement.reduce((s, p) => s + (p.fin - p.debut), 0) / progressionParEquipement.length)
    : 0;

  // --- SECTIONS POUR LE PDF ---
  const buildSections = (): { heading: string; rows: [string, string][] }[] => [
    {
      heading: "Synthese de la periode",
      rows: [
        ["Indicateur", "Valeur"] as [string, string],
        ["Equipements vus", String(kpis.vus)],
        ["Total passages", String(kpis.passagesCount)],
        ["Nouveaux equipements", String(kpis.nouveaux)],
        ["Equipements non vus", String(kpis.nonVus)],
        ["Taux de stagnation", `${kpis.stagnationRate}%`],
        ["Progression moyenne", `${progressionMoyenne > 0 ? "+" : ""}${progressionMoyenne}%`],
      ],
    },
    {
      heading: "Charge par atelier",
      rows: [["Atelier", "Passages"] as [string, string], ...chargeParAtelier.map((a) => [a.name, String(a.count)] as [string, string])],
    },
    {
      heading: "Charge par technicien",
      rows: [["Technicien", "Passages"] as [string, string], ...chargeParTechnicien.map((t) => [t.name, String(t.count)] as [string, string])],
    },
    {
      heading: "Equipements stagnants",
      rows: [
        ["Equipement", "Jours stagnants"] as [string, string],
        ...equipementsStagnants.map((e) => [`${e.reference || "-"} - ${e.client_name}`, `${e.daysStagnant}j`] as [string, string]),
      ],
    },
    {
      heading: "Progression par equipement",
      rows: [
        ["Equipement", "Debut -> Fin"] as [string, string],
        ...progressionParEquipement.map((p) => [`${p.equipement?.reference || "-"} - ${p.equipement?.client_name}`, `${p.debut}% -> ${p.fin}% (${p.nbTournees})`] as [string, string]),
      ],
    },
    {
      heading: "Top 5 clients",
      rows: [["Client", "Equipements"] as [string, string], ...topClients.map(([c, n]) => [c, String(n)] as [string, string])],
    },
    {
      heading: "Top 5 types d'equipement",
      rows: [["Type", "Nombre"] as [string, string], ...topTypes.map(([t, n]) => [t, String(n)] as [string, string])],
    },
  ];

  // --- PDF ---
  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const title = `Rapport ${period === "jour" ? "journalier" : period === "semaine" ? "hebdomadaire" : period === "mois" ? "mensuel" : period === "annee" ? "annuel" : "personnalise"}`;
      const periodLabel = currentRange.label;

      const kpiList = [
        { label: "Vus", value: String(kpis.vus), color: [245, 158, 11] as [number, number, number] },
        { label: "Passages", value: String(kpis.passagesCount), color: [37, 99, 235] as [number, number, number] },
        { label: "Nouveaux", value: String(kpis.nouveaux), color: [22, 163, 74] as [number, number, number] },
        { label: "Stagnants", value: String(stagnantIds.size), color: [220, 38, 38] as [number, number, number] },
      ];

      const charts = [
        {
          title: "Passages par mois (annee en cours)",
          data: passagesParMois.map((v, i) => ({ label: ["Jan","Fev","Mar","Avr","Mai","Jun","Jul","Aou","Sep","Oct","Nov","Dec"][i], value: v })),
        },
        {
          title: "Charge par atelier",
          data: chargeParAtelier.slice(0, 10).map((a) => ({ label: a.name, value: a.count })),
        },
      ];

      const doc = await buildRapportPdf(title, periodLabel, buildSections(), kpiList, charts);
      doc.save(`FARATEC_${title.replace(/\s/g, "_")}_${todayStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  // --- CSV ---
  const handleExportCsv = () => {
    const rows: string[][] = [
      ["FARATEC - Rapport"],
      [currentRange.label],
      [],
      ["Indicateur", "Valeur"],
      ["Equipements vus", String(kpis.vus)],
      ["Total passages", String(kpis.passagesCount)],
      ["Nouveaux equipements", String(kpis.nouveaux)],
      ["Equipements non vus", String(kpis.nonVus)],
      ["Taux de stagnation", `${kpis.stagnationRate}%`],
      [],
    ];

    buildSections().forEach((s) => {
      rows.push([s.heading]);
      s.rows.forEach((r) => rows.push([r[0], r[1]]));
      rows.push([]);
    });

    buildCsv(rows, `FARATEC_Rapport_${todayStr}.csv`);
  };

  const periodTabs: { key: PeriodType; label: string; icon: any }[] = [
    { key: "jour", label: "Jour", icon: Calendar },
    { key: "semaine", label: "Semaine", icon: CalendarDays },
    { key: "mois", label: "Mois", icon: CalendarClock },
    { key: "annee", label: "Annee", icon: CalendarRange },
    { key: "custom", label: "Personnalise", icon: Target },
  ];

  const moisLabels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Juil", "Aou", "Sep", "Oct", "Nov", "Dec"];

  const deltaBadge = (delta: number) => {
    if (delta === 0) return null;
    const isUp = delta > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isUp ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        {isUp ? "+" : ""}{delta}%
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* --- EN-TETE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Rapports & Analyses</h1>
          <p className="text-sm text-slate-500">Tableau de bord decisionnel - {currentRange.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 shadow-sm"
          >
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || loading}
            className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-4 py-2 bg-neutral-900 text-amber-500 hover:bg-neutral-800 disabled:opacity-50 shadow-sm"
          >
            <FileDown size={14} />
            {downloading ? "Generation..." : "Telecharger PDF"}
          </button>
        </div>
      </div>

      {/* --- ONGLETS --- */}
      <div className="flex flex-wrap gap-2">
        {periodTabs.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 transition ${
              period === p.key ? "bg-amber-500 text-neutral-900 shadow-sm" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            <p.icon size={14} />
            {p.label}
          </button>
        ))}
      </div>

      {/* --- CUSTOM --- */}
      {period === "custom" && (
        <div className="bg-white rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
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

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          {/* --- ALERTES --- */}
          {alertes.length > 0 && (
            <div className="space-y-2">
              {alertes.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-xl p-3 border-l-4 shadow-sm ${
                    a.type === "danger" ? "bg-red-50 border-red-500" :
                    a.type === "warning" ? "bg-amber-50 border-amber-500" :
                    "bg-blue-50 border-blue-500"
                  }`}
                >
                  <AlertTriangle size={16} className={
                    a.type === "danger" ? "text-red-600" :
                    a.type === "warning" ? "text-amber-600" : "text-blue-600"
                  } />
                  <p className={`text-sm font-medium ${
                    a.type === "danger" ? "text-red-800" :
                    a.type === "warning" ? "text-amber-800" : "text-blue-800"
                  }`}>{a.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* --- KPIs --- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equipements vus</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-2xl font-bold text-slate-800">{kpis.vus}</p>
                {deltaBadge(kpis.deltaVus)}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Passages</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-2xl font-bold text-slate-800">{kpis.passagesCount}</p>
                {deltaBadge(kpis.deltaPassages)}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Nouveaux</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-2xl font-bold text-slate-800">{kpis.nouveaux}</p>
                {deltaBadge(kpis.deltaNouveaux)}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Taux stagnation</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-2xl font-bold text-slate-800">{kpis.stagnationRate}%</p>
                <span className="text-[10px] text-slate-400">{stagnantIds.size}/{equipementsActifs.length}</span>
              </div>
            </div>
          </div>

          {/* --- GRAPHIQUE PASSAGES PAR MOIS --- */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-amber-600" />
              <h2 className="font-semibold text-slate-700 text-sm">Passages par mois - {now.getFullYear()}</h2>
            </div>
            <div className="flex items-end gap-1 h-32">
              {passagesParMois.map((count, i) => {
                const max = Math.max(...passagesParMois, 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-semibold">{count > 0 ? count : ""}</span>
                    <div
                      className="w-full bg-gradient-to-t from-amber-400 to-amber-500 rounded-t transition-all hover:from-amber-500 hover:to-amber-600"
                      style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? "4px" : "2px" }}
                    />
                    <span className="text-[10px] text-slate-400">{moisLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* --- CHARGE PAR ATELIER + TECHNICIEN --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Factory size={16} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-sm">Charge par atelier</h2>
              </div>
              {chargeParAtelier.every((a) => a.count === 0) ? (
                <p className="text-sm text-slate-400">Aucun passage sur la periode.</p>
              ) : (
                <div className="space-y-2">
                  {chargeParAtelier.filter((a) => a.count > 0).map((a) => {
                    const max = Math.max(...chargeParAtelier.map((x) => x.count), 1);
                    return (
                      <div key={a.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 font-medium">{a.name}</span>
                          <span className="font-bold text-slate-800">{a.count}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(a.count / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-sm">Charge par technicien</h2>
              </div>
              {chargeParTechnicien.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun passage sur la periode.</p>
              ) : (
                <div className="space-y-2">
                  {chargeParTechnicien.map((t) => {
                    const max = Math.max(...chargeParTechnicien.map((x) => x.count), 1);
                    return (
                      <div key={t.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 font-medium">{t.name}</span>
                          <span className="font-bold text-slate-800">{t.count}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(t.count / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* --- PROGRESSION --- */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-amber-600" />
              <h2 className="font-semibold text-slate-700 text-sm">Progression des equipements sur la periode</h2>
              <span className="ml-auto text-xs text-slate-500">
                Moyenne :{" "}
                <strong className={progressionMoyenne > 0 ? "text-green-600" : progressionMoyenne < 0 ? "text-red-600" : "text-slate-600"}>
                  {progressionMoyenne > 0 ? "+" : ""}{progressionMoyenne}%
                </strong>
              </span>
            </div>
            {progressionParEquipement.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Aucune observation sur la periode.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {progressionParEquipement.map((p) => {
                  const delta = p.fin - p.debut;
                  return (
                    <div key={p.equipement!.id} className="py-2 flex items-center justify-between text-sm">
                      <span className="text-slate-800">
                        {p.equipement!.reference || "-"} - {p.equipement!.client_name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-500">{p.debut}%</span>
                        <span className="text-slate-400">{"->"}</span>
                        <span className="font-bold text-amber-700">{p.fin}%</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          delta > 0 ? "bg-green-100 text-green-700" : delta < 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {delta > 0 ? "+" : ""}{delta}%
                        </span>
                        <span className="text-[10px] text-slate-400">({p.nbTournees})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* --- STAGNANTS --- */}
          {equipementsStagnants.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-red-500">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-red-500" />
                <h2 className="font-semibold text-slate-700 text-sm">Equipements stagnants ({equipementsStagnants.length})</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {equipementsStagnants.map((e) => (
                  <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-800">{e.reference || "-"} - {e.client_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-700">{e.pourcentage_global}%</span>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Clock size={9} /> {e.daysStagnant}j
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- TOP 5 --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Award size={16} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-sm">Top 5 clients</h2>
              </div>
              {topClients.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun client.</p>
              ) : (
                <div className="space-y-2">
                  {topClients.map(([client, count], i) => (
                    <div key={client} className="flex items-center gap-3 text-sm">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? "bg-amber-500 text-white" :
                        i === 1 ? "bg-slate-300 text-slate-700" :
                        i === 2 ? "bg-amber-700 text-white" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-slate-700 truncate">{client}</span>
                      <span className="font-semibold text-slate-800">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Package size={16} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-sm">Top 5 types d'equipement</h2>
              </div>
              {topTypes.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun type.</p>
              ) : (
                <div className="space-y-2">
                  {topTypes.map(([type, count], i) => (
                    <div key={type} className="flex items-center gap-3 text-sm">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? "bg-amber-500 text-white" :
                        i === 1 ? "bg-slate-300 text-slate-700" :
                        i === 2 ? "bg-amber-700 text-white" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-slate-700 truncate">{type}</span>
                      <span className="font-semibold text-slate-800">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}