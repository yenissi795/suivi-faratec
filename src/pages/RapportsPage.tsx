import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Calendar, CalendarDays, CalendarRange, FileDown,
  TrendingUp, AlertTriangle, Target, Users, Factory,
  Package, CalendarClock, FileSpreadsheet, Award, Activity,
  Gauge, Coins, Wrench, Truck, Droplet, CheckCircle2, Info
} from "lucide-react";
import { buildRapportPdf, buildCsv } from "../lib/reportPdf";
import {
  analyserEquipement,
  getEfficaciteColor,
  getTranchePuissance,
  isEquipementTermine,
  SEUIL_MIN_EQUIPEMENTS,
  type CoefficientTravail,
  type EquipementAnalyse,
  type SessionAnalyse,
} from "../lib/optimization";
import { calculerTempsTravail } from "../lib/workTime";

// --- TYPES ---
interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  code_faratec: string | null;
  statut: string;
  created_at: string;
  pourcentage_global: number;
  puissance_kw: number | null;
  nature_travaux: string | null;
  date_debut_intervention: string | null;
  date_fin_intervention: string | null;
}
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  operateur_id: string | null;
  pourcentage: number;
  passage_date: string;
}
interface Atelier { id: string; name: string; }
interface Operateur { id: string; full_name: string; }
interface Session {
  id: string;
  equipement_id: string;
  operateur_id: string;
  started_at: string;
  ended_at: string | null;
}
interface LigneCout {
  id: string;
  equipement_id: string;
  type_ligne: string;
  quantite: number;
  prix_unitaire: number;
}

type PeriodType = "jour" | "semaine" | "mois" | "annee" | "custom";

export default function RapportsPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lignesCout, setLignesCout] = useState<LigneCout[]>([]);
  const [coefficients, setCoefficients] = useState<CoefficientTravail[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("mois");
  const [downloading, setDownloading] = useState(false);
  const [mainTab, setMainTab] = useState<"activite" | "performance" | "financier" | "client">("activite");

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const load = async () => {
      const [eqRes, passRes, atRes, opRes, sessRes, coutRes, coefRes] = await Promise.all([
        supabase.from("equipements").select("id, client_name, type_equipement, code_faratec, statut, created_at, pourcentage_global, puissance_kw, nature_travaux, date_debut_intervention, date_fin_intervention").is("deleted_at", null),
        supabase.from("journal_passages").select("id, equipement_id, atelier_id, operateur_id, pourcentage, passage_date").is("deleted_at", null).order("passage_date", { ascending: true }),
        supabase.from("ateliers").select("id, name"),
        supabase.from("operateurs").select("id, full_name"),
        supabase.from("interventions_operateurs").select("id, equipement_id, operateur_id, started_at, ended_at"),
        supabase.from("lignes_cout").select("id, equipement_id, type_ligne, quantite, prix_unitaire"),
        supabase.from("coefficients_travaux").select("id, type_travail, puissance_min, puissance_max, temps_attendu_jours, tolerance_pourcentage"),
      ]);
      setEquipements((eqRes.data as Equipement[]) || []);
      setPassages((passRes.data as Passage[]) || []);
      setAteliers((atRes.data as Atelier[]) || []);
      setOperateurs((opRes.data as Operateur[]) || []);
      setSessions((sessRes.data as Session[]) || []);
      setLignesCout((coutRes.data as LigneCout[]) || []);
      setCoefficients((coefRes.data as CoefficientTravail[]) || []);
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
      semaine: { start: monday, end: saturdayNoon, label: `Du ${monday.toLocaleDateString("fr-FR")} au ${saturdayNoon.toLocaleDateString("fr-FR")}` },
      mois: { start: startOfMonth, end: endOfMonth, label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) },
      annee: { start: startOfYear, end: endOfYear, label: `Annee ${now.getFullYear()}` },
      custom: { start: cS, end: cE, label: `Du ${cS.toLocaleDateString("fr-FR")} au ${cE.toLocaleDateString("fr-FR")}` },
    };
  }, [customStart, customEnd, now]);

  const inRange = (iso: string, range: { start: Date; end: Date }) => {
    const d = new Date(iso);
    return d >= range.start && d <= range.end;
  };

  const currentRange = bounds[period];

  const passagesInPeriod = useMemo(() => passages.filter((p) => inRange(p.passage_date, currentRange)), [passages, currentRange]);
  const sessionsInPeriod = useMemo(() => sessions.filter((s) => inRange(s.started_at, currentRange)), [sessions, currentRange]);
  const equipementsInPeriod = useMemo(() => equipements.filter((e) => inRange(e.created_at, currentRange)), [equipements, currentRange]);
  const lignesCoutInPeriod = useMemo(() => lignesCout.filter((l) => {
    const eq = equipements.find((e) => e.id === l.equipement_id);
    return eq && inRange(eq.created_at, currentRange);
  }), [lignesCout, equipements, currentRange]);

  const vusIds = useMemo(() => new Set(passagesInPeriod.map((p) => p.equipement_id)), [passagesInPeriod]);
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

  // --- KPIs ACTIVITÉ ---
  const kpisActivite = useMemo(() => {
    const vus = vusIds.size;
    const passagesCount = passagesInPeriod.length;
    const nouveaux = equipementsInPeriod.length;
    const nonVus = equipementsActifs.filter((e) => !vusIds.has(e.id)).length;
    const totalActifs = equipementsActifs.length;
    const stagnationRate = totalActifs > 0 ? Math.round((stagnantIds.size / totalActifs) * 100) : 0;
    return { vus, passagesCount, nouveaux, nonVus, stagnationRate };
  }, [vusIds, passagesInPeriod, equipementsInPeriod, equipementsActifs, stagnantIds]);

  // --- KPIs PERFORMANCE ---
  const kpisPerformance = useMemo(() => {
    const sessionsByEquipement = new Map<string, SessionAnalyse[]>();
    sessions.forEach((s) => {
      if (!sessionsByEquipement.has(s.equipement_id)) sessionsByEquipement.set(s.equipement_id, []);
      sessionsByEquipement.get(s.equipement_id)!.push(s);
    });

    const analyses = equipementsInPeriod
      .filter((eq) => isEquipementTermine(eq as EquipementAnalyse))
      .map((eq) => {
        const sess = sessionsByEquipement.get(eq.id) || [];
        const analyse = analyserEquipement(eq as EquipementAnalyse, sess, coefficients);
        return { eq, analyse };
      })
      .filter((x) => x.analyse.temps_reel_jours > 0 && x.analyse.efficacite > 0);

    const efficaciteMoyenne = analyses.length > 0
      ? Math.round(analyses.reduce((sum, x) => sum + x.analyse.efficacite, 0) / analyses.length)
      : 0;

    const surDurees = equipementsInPeriod.map((eq) => {
      const sess = sessionsByEquipement.get(eq.id) || [];
      const analyse = analyserEquipement(eq as EquipementAnalyse, sess, coefficients);
      return { eq, analyse };
    }).filter((x) => x.analyse.est_sur_duree && x.analyse.temps_reel_jours > 0);

    const operateursMap = new Map<string, string>();
    operateurs.forEach((o) => operateursMap.set(o.id, o.full_name));

    const parOperateur = new Map<string, {
      equipementsTouches: Set<string>;
      tempsReelMin: number;
      tempsAttenduJours: number;
    }>();

    sessionsInPeriod.forEach((s) => {
      const eq = equipements.find((e) => e.id === s.equipement_id);
      if (!eq || !isEquipementTermine(eq as EquipementAnalyse)) return;

      if (!parOperateur.has(s.operateur_id)) {
        parOperateur.set(s.operateur_id, {
          equipementsTouches: new Set(),
          tempsReelMin: 0,
          tempsAttenduJours: 0,
        });
      }
      const entry = parOperateur.get(s.operateur_id)!;
      entry.tempsReelMin += calculerTempsTravail(s.started_at, s.ended_at);

      if (!entry.equipementsTouches.has(s.equipement_id)) {
        entry.equipementsTouches.add(s.equipement_id);
        const coef = coefficients.find((c) => {
          const type = (eq.nature_travaux || "").toLowerCase();
          const matchType = type.includes("rebobinage") || type.includes("bobinage") ? "rebobinage" :
            type.includes("mecanique") || type.includes("mécanique") ? "mecanique" :
            type.includes("equilibrage") || type.includes("équilibrage") ? "equilibrage" :
            type.includes("peinture") ? "peinture" : "revision";
          return c.type_travail === matchType &&
            (eq.puissance_kw || 0) >= c.puissance_min &&
            (eq.puissance_kw || 0) < c.puissance_max;
        });
        if (coef) entry.tempsAttenduJours += Number(coef.temps_attendu_jours);
      }
    });

    const topOperateurs = Array.from(parOperateur.entries()).map(([opId, data]) => {
      const tempsReelJours = data.tempsReelMin / (8 * 60);
      const efficacite = tempsReelJours > 0 && data.tempsAttenduJours > 0
        ? Math.round((data.tempsAttenduJours / tempsReelJours) * 100)
        : 0;
      return {
        operateur_id: opId,
        nom: operateursMap.get(opId) || "Inconnu",
        nb_equipements: data.equipementsTouches.size,
        temps_reel_jours: Math.round(tempsReelJours * 10) / 10,
        temps_attendu_jours: Math.round(data.tempsAttenduJours * 10) / 10,
        efficacite,
      };
    }).filter((o) => o.nb_equipements >= SEUIL_MIN_EQUIPEMENTS).sort((a, b) => b.efficacite - a.efficacite);

    return { efficaciteMoyenne, nbTermines: analyses.length, surDurees, topOperateurs };
  }, [equipementsInPeriod, equipements, sessions, sessionsInPeriod, coefficients, operateurs]);

  // --- KPIs FINANCIER ---
  const kpisFinancier = useMemo(() => {
    const totalParType = {
      piece: 0,
      sous_traitance: 0,
      transport: 0,
      consommable: 0,
      main_oeuvre: 0,
    };

    lignesCoutInPeriod.forEach((l) => {
      const total = Number(l.quantite) * Number(l.prix_unitaire);
      if (totalParType[l.type_ligne as keyof typeof totalParType] !== undefined) {
        totalParType[l.type_ligne as keyof typeof totalParType] += total;
      }
    });

    const totalHT = Object.values(totalParType).reduce((s, v) => s + v, 0);

    const parEquipement = new Map<string, number>();
    lignesCoutInPeriod.forEach((l) => {
      const total = Number(l.quantite) * Number(l.prix_unitaire);
      parEquipement.set(l.equipement_id, (parEquipement.get(l.equipement_id) || 0) + total);
    });

    const topEquipementsChers = Array.from(parEquipement.entries())
      .map(([eqId, total]) => {
        const eq = equipements.find((e) => e.id === eqId);
        return { equipement: eq, total };
      })
      .filter((x) => x.equipement)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const coutMoyen = parEquipement.size > 0 ? totalHT / parEquipement.size : 0;

    return { totalParType, totalHT, topEquipementsChers, coutMoyen, nbEquipementsAvecCouts: parEquipement.size };
  }, [lignesCoutInPeriod, equipements]);

  // --- KPIs CLIENT ---
  const kpisClient = useMemo(() => {
    const parClient = new Map<string, {
      nbEquipements: number;
      nbEnCours: number;
      nbLivres: number;
      tempsTotalMin: number;
      coutTotal: number;
    }>();

    equipementsInPeriod.forEach((e) => {
      if (!parClient.has(e.client_name)) {
        parClient.set(e.client_name, {
          nbEquipements: 0,
          nbEnCours: 0,
          nbLivres: 0,
          tempsTotalMin: 0,
          coutTotal: 0,
        });
      }
      const entry = parClient.get(e.client_name)!;
      entry.nbEquipements += 1;
      if (e.statut === "livre") entry.nbLivres += 1;
      else entry.nbEnCours += 1;

      const eqSessions = sessions.filter((s) => s.equipement_id === e.id);
      eqSessions.forEach((s) => {
        entry.tempsTotalMin += calculerTempsTravail(s.started_at, s.ended_at);
      });

      const eqCouts = lignesCout.filter((l) => l.equipement_id === e.id);
      eqCouts.forEach((l) => {
        entry.coutTotal += Number(l.quantite) * Number(l.prix_unitaire);
      });
    });

    return Array.from(parClient.entries()).map(([clientName, data]) => ({
      client_name: clientName,
      ...data,
    })).sort((a, b) => b.nbEquipements - a.nbEquipements);
  }, [equipementsInPeriod, sessions, lignesCout]);

  // --- AUTRES STATS ---
  const passagesParMois = useMemo(() => {
    const arr = Array(12).fill(0);
    passages.filter((p) => new Date(p.passage_date).getFullYear() === now.getFullYear())
      .forEach((p) => { arr[new Date(p.passage_date).getMonth()]++; });
    return arr;
  }, [passages, now]);

  const chargeParAtelier = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    ateliers.forEach((a) => {
      const count = passagesInPeriod.filter((p) => p.atelier_id === a.id).length;
      const existing = map.get(a.name);
      if (existing) existing.count += count;
      else map.set(a.name, { id: a.id, name: a.name, count });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [ateliers, passagesInPeriod]);

  const chargeParOperateur = useMemo(() => {
    return operateurs.map((t) => ({
      id: t.id,
      name: t.full_name,
      count: passagesInPeriod.filter((p) => p.operateur_id === t.id).length,
    })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
  }, [operateurs, passagesInPeriod]);

  // --- PDF ---
  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const title = `Rapport ${period === "jour" ? "journalier" : period === "semaine" ? "hebdomadaire" : period === "mois" ? "mensuel" : period === "annee" ? "annuel" : "personnalise"}`;
      const periodLabel = currentRange.label;

      const kpiList = [
        { label: "Vus", value: String(kpisActivite.vus), color: [245, 158, 11] as [number, number, number] },
        { label: "Passages", value: String(kpisActivite.passagesCount), color: [37, 99, 235] as [number, number, number] },
        { label: "Nouveaux", value: String(kpisActivite.nouveaux), color: [22, 163, 74] as [number, number, number] },
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

      const sections: { heading: string; rows: [string, string][] }[] = [
        {
          heading: "Synthese activite",
          rows: [
            ["Indicateur", "Valeur"] as [string, string],
            ["Equipements vus", String(kpisActivite.vus)],
            ["Total passages", String(kpisActivite.passagesCount)],
            ["Nouveaux equipements", String(kpisActivite.nouveaux)],
            ["Equipements non vus", String(kpisActivite.nonVus)],
            ["Taux de stagnation", `${kpisActivite.stagnationRate}%`],
          ],
        },
        {
          heading: "Performance",
          rows: [
            ["Indicateur", "Valeur"] as [string, string],
            ["Efficacite moyenne", `${kpisPerformance.efficaciteMoyenne}%`],
            ["Equipements termines", String(kpisPerformance.nbTermines)],
            ["Sur-durees detectees", String(kpisPerformance.surDurees.length)],
          ],
        },
        {
          heading: "Top operateurs",
          rows: [
            ["Operateur", "Efficacite"] as [string, string],
            ...kpisPerformance.topOperateurs.slice(0, 10).map((o) => [`${o.nom} (${o.nb_equipements} eq.)`, `${o.efficacite}%`] as [string, string]),
          ],
        },
        {
          heading: "Repartition financiere",
          rows: [
            ["Categorie", "Montant HT"] as [string, string],
            ["Pieces de rechange", `${kpisFinancier.totalParType.piece.toFixed(2)} DH`],
            ["Main d'oeuvre", `${kpisFinancier.totalParType.main_oeuvre.toFixed(2)} DH`],
            ["Sous-traitance", `${kpisFinancier.totalParType.sous_traitance.toFixed(2)} DH`],
            ["Transport", `${kpisFinancier.totalParType.transport.toFixed(2)} DH`],
            ["Consommables", `${kpisFinancier.totalParType.consommable.toFixed(2)} DH`],
            ["TOTAL", `${kpisFinancier.totalHT.toFixed(2)} DH`],
          ],
        },
        {
          heading: "Stats par client",
          rows: [
            ["Client", "Nb equipements"] as [string, string],
            ...kpisClient.slice(0, 20).map((c) => [`${c.client_name} (${c.nbEnCours} en cours)`, String(c.nbEquipements)] as [string, string]),
          ],
        },
        {
          heading: "Charge par atelier",
          rows: [["Atelier", "Passages"] as [string, string], ...chargeParAtelier.map((a) => [a.name, String(a.count)] as [string, string])],
        },
        {
          heading: "Charge par operateur",
          rows: [["Operateur", "Passages"] as [string, string], ...chargeParOperateur.map((t) => [t.name, String(t.count)] as [string, string])],
        },
      ];

      const doc = await buildRapportPdf(title, periodLabel, sections, kpiList, charts);
      doc.save(`FARATEC_${title.replace(/\s/g, "_")}_${todayStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const handleExportCsv = () => {
    const rows: string[][] = [
      ["FARATEC - Rapport"],
      [currentRange.label],
      [],
      ["ACTIVITE"],
      ["Equipements vus", String(kpisActivite.vus)],
      ["Total passages", String(kpisActivite.passagesCount)],
      ["Nouveaux", String(kpisActivite.nouveaux)],
      ["Non vus", String(kpisActivite.nonVus)],
      [],
      ["PERFORMANCE"],
      ["Efficacite moyenne", `${kpisPerformance.efficaciteMoyenne}%`],
      ["Equipements termines", String(kpisPerformance.nbTermines)],
      ["Sur-durees", String(kpisPerformance.surDurees.length)],
      [],
      ["FINANCIER"],
      ["Pieces", `${kpisFinancier.totalParType.piece.toFixed(2)} DH`],
      ["Main d'oeuvre", `${kpisFinancier.totalParType.main_oeuvre.toFixed(2)} DH`],
      ["Sous-traitance", `${kpisFinancier.totalParType.sous_traitance.toFixed(2)} DH`],
      ["Transport", `${kpisFinancier.totalParType.transport.toFixed(2)} DH`],
      ["Consommables", `${kpisFinancier.totalParType.consommable.toFixed(2)} DH`],
      ["TOTAL", `${kpisFinancier.totalHT.toFixed(2)} DH`],
      [],
      ["CLIENTS"],
      ["Client", "Nb equipements", "En cours", "Livres"],
      ...kpisClient.map((c) => [c.client_name, String(c.nbEquipements), String(c.nbEnCours), String(c.nbLivres)]),
    ];
    buildCsv(rows, `FARATEC_Rapport_${todayStr}.csv`);
  };

  const periodTabs: { key: PeriodType; label: string; icon: any }[] = [
    { key: "jour", label: "Jour", icon: Calendar },
    { key: "semaine", label: "Semaine", icon: CalendarDays },
    { key: "mois", label: "Mois", icon: CalendarClock },
    { key: "annee", label: "Annee", icon: CalendarRange },
    { key: "custom", label: "Personnalise", icon: Target },
  ];

  const mainTabs: { key: "activite" | "performance" | "financier" | "client"; label: string; icon: any }[] = [
    { key: "activite", label: "Activite", icon: Activity },
    { key: "performance", label: "Performance", icon: Gauge },
    { key: "financier", label: "Financier", icon: Coins },
    { key: "client", label: "Client", icon: Users },
  ];

  const moisLabels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Juil", "Aou", "Sep", "Oct", "Nov", "Dec"];

  if (loading) {
    return <p className="text-sm text-slate-400 p-6">Chargement...</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Rapports & Analyses</h1>
          <p className="text-sm text-slate-500">{currentRange.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCsv} className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm">
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button onClick={handleDownloadPdf} disabled={downloading} className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-4 py-2 bg-neutral-900 text-amber-500 hover:bg-neutral-800 disabled:opacity-50 shadow-sm">
            <FileDown size={14} />
            {downloading ? "Generation..." : "Telecharger PDF"}
          </button>
        </div>
      </div>

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

      <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        {mainTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 transition ${
              mainTab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ACTIVITE */}
      {mainTab === "activite" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equipements vus</p>
              <p className="text-2xl font-bold text-slate-800">{kpisActivite.vus}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Passages</p>
              <p className="text-2xl font-bold text-slate-800">{kpisActivite.passagesCount}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Nouveaux</p>
              <p className="text-2xl font-bold text-slate-800">{kpisActivite.nouveaux}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Taux stagnation</p>
              <p className="text-2xl font-bold text-slate-800">{kpisActivite.stagnationRate}%</p>
            </div>
          </div>

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
                    <div className="w-full bg-gradient-to-t from-amber-400 to-amber-500 rounded-t" style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? "4px" : "2px" }} />
                    <span className="text-[10px] text-slate-400">{moisLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Factory size={16} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-sm">Charge par atelier</h2>
              </div>
              {chargeParAtelier.filter((a) => a.count > 0).map((a) => {
                const max = Math.max(...chargeParAtelier.map((x) => x.count), 1);
                return (
                  <div key={a.id} className="space-y-1 mb-2">
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
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-amber-600" />
                <h2 className="font-semibold text-slate-700 text-sm">Charge par operateur</h2>
              </div>
              {chargeParOperateur.map((t) => {
                const max = Math.max(...chargeParOperateur.map((x) => x.count), 1);
                return (
                  <div key={t.id} className="space-y-1 mb-2">
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
          </div>
        </>
      )}

      {/* PERFORMANCE */}
      {mainTab === "performance" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emerald-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Target size={10} /> Efficacite moyenne
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-2xl font-bold text-slate-800">{kpisPerformance.efficaciteMoyenne}%</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${getEfficaciteColor(kpisPerformance.efficaciteMoyenne).bg} ${getEfficaciteColor(kpisPerformance.efficaciteMoyenne).text}`}>
                  {getEfficaciteColor(kpisPerformance.efficaciteMoyenne).label}
                </span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <CheckCircle2 size={10} /> Equipements termines
              </p>
              <p className="text-2xl font-bold text-slate-800">{kpisPerformance.nbTermines}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <AlertTriangle size={10} /> Sur-durees
              </p>
              <p className="text-2xl font-bold text-slate-800">{kpisPerformance.surDurees.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Users size={10} /> Top operateurs
              </p>
              <p className="text-2xl font-bold text-slate-800">{kpisPerformance.topOperateurs.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
              <h2 className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
                <Award size={16} />
                Top operateurs par efficacite ({kpisPerformance.topOperateurs.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Minimum {SEUIL_MIN_EQUIPEMENTS} equipements termines</p>
            </div>
            {kpisPerformance.topOperateurs.length === 0 ? (
              <div className="p-8 text-center">
                <Users size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">Aucun operateur classe sur cette periode.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {kpisPerformance.topOperateurs.map((op, i) => {
                  const color = getEfficaciteColor(op.efficacite);
                  const podium = ["bg-amber-500 text-white", "bg-slate-300 text-slate-800", "bg-amber-700 text-white"];
                  return (
                    <div key={op.operateur_id} className="p-4 flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? podium[i] : "bg-slate-100 text-slate-600"}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{op.nom}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {op.nb_equipements} equipement{op.nb_equipements > 1 ? "s" : ""} · {op.temps_reel_jours}j reel / {op.temps_attendu_jours}j attendu
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${color.text}`}>{op.efficacite}%</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>
                          {color.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {kpisPerformance.surDurees.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-red-500">
              <h2 className="font-semibold text-red-800 text-sm mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                Equipements en sur-duree ({kpisPerformance.surDurees.length})
              </h2>
              <div className="divide-y divide-slate-100">
                {kpisPerformance.surDurees.slice(0, 10).map(({ eq, analyse }) => (
                  <div key={eq.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-800">
                      <strong>{eq.code_faratec || "—"}</strong> · {eq.client_name}
                      <span className="text-slate-400 text-xs"> ({getTranchePuissance(eq.puissance_kw)})</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">{analyse.temps_reel_jours}j</span>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
                        +{analyse.depassement_pourcentage}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* FINANCIER */}
      {mainTab === "financier" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500 col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Coins size={10} /> Total HT
              </p>
              <p className="text-2xl font-bold text-slate-800">{kpisFinancier.totalHT.toFixed(2)} DH</p>
              <p className="text-[10px] text-slate-400 mt-1">{kpisFinancier.nbEquipementsAvecCouts} equipements avec couts</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emerald-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cout moyen</p>
              <p className="text-2xl font-bold text-slate-800">{kpisFinancier.coutMoyen.toFixed(0)} DH</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Lignes de cout</p>
              <p className="text-2xl font-bold text-slate-800">{lignesCoutInPeriod.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-700 text-sm mb-4 flex items-center gap-2">
              <Coins size={16} className="text-amber-600" />
              Repartition par categorie
            </h2>
            <div className="space-y-3">
              {[
                { key: "piece", label: "Pieces de rechange", icon: Package, color: "bg-blue-500" },
                { key: "main_oeuvre", label: "Main d'oeuvre", icon: Users, color: "bg-red-500" },
                { key: "sous_traitance", label: "Sous-traitance", icon: Wrench, color: "bg-purple-500" },
                { key: "transport", label: "Transport", icon: Truck, color: "bg-amber-500" },
                { key: "consommable", label: "Consommables", icon: Droplet, color: "bg-teal-500" },
              ].map((cat) => {
                const Icon = cat.icon;
                const montant = kpisFinancier.totalParType[cat.key as keyof typeof kpisFinancier.totalParType];
                const pct = kpisFinancier.totalHT > 0 ? (montant / kpisFinancier.totalHT) * 100 : 0;
                return (
                  <div key={cat.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 font-medium flex items-center gap-1.5">
                        <Icon size={12} className="text-slate-500" />
                        {cat.label}
                      </span>
                      <span className="font-bold text-slate-800">{montant.toFixed(2)} DH <span className="text-xs text-slate-400">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${cat.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {kpisFinancier.topEquipementsChers.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-600" />
                Top 10 equipements les plus chers
              </h2>
              <div className="divide-y divide-slate-100">
                {kpisFinancier.topEquipementsChers.map((x, i) => (
                  <div key={x.equipement?.id} className="py-2 flex items-center gap-3 text-sm">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? "bg-amber-500 text-white" :
                      i === 1 ? "bg-slate-300 text-slate-700" :
                      i === 2 ? "bg-amber-700 text-white" :
                      "bg-slate-100 text-slate-500"
                    }`}>{i + 1}</span>
                    <span className="flex-1 text-slate-800 truncate">
                      <strong>{x.equipement?.code_faratec || "—"}</strong> · {x.equipement?.client_name}
                    </span>
                    <span className="font-bold text-amber-700 shrink-0">{x.total.toFixed(2)} DH</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* CLIENT */}
      {mainTab === "client" && (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm flex items-start gap-2">
            <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              <strong>Info :</strong> Statistiques globales par client sur la periode. Pour un rapport PDF detaille d'un client, utilisez la page <strong>Vue Client</strong>.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-slate-400">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Clients</p>
              <p className="text-2xl font-bold text-slate-800">{kpisClient.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equipements</p>
              <p className="text-2xl font-bold text-slate-800">{kpisClient.reduce((s, c) => s + c.nbEquipements, 0)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">En cours</p>
              <p className="text-2xl font-bold text-slate-800">{kpisClient.reduce((s, c) => s + c.nbEnCours, 0)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Livres</p>
              <p className="text-2xl font-bold text-slate-800">{kpisClient.reduce((s, c) => s + c.nbLivres, 0)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                <Users size={16} className="text-amber-600" />
                Statistiques par client ({kpisClient.length})
              </h2>
            </div>
            {kpisClient.length === 0 ? (
              <div className="p-8 text-center">
                <Users size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">Aucun client sur cette periode.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {kpisClient.map((c, i) => (
                  <div key={c.client_name} className="p-4 flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? "bg-amber-500 text-white" :
                      i === 1 ? "bg-slate-300 text-slate-700" :
                      i === 2 ? "bg-amber-700 text-white" :
                      "bg-slate-100 text-slate-500"
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.client_name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {c.nbEnCours} en cours · {c.nbLivres} livre{c.nbLivres > 1 ? "s" : ""} · {Math.round(c.tempsTotalMin / 60)}h de travail
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-amber-700">{c.nbEquipements}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Equipements</p>
                    </div>
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