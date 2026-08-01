import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { FileBarChart, Calendar, CalendarDays, CalendarRange, FileDown } from "lucide-react";
import { buildRapportPdf } from "../lib/reportPdf";

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
interface Atelier {
  id: string;
  name: string;
}
interface Technicien {
  id: string;
  full_name: string;
}

type PeriodType = "jour" | "semaine" | "annee";

export default function RapportsPage() {
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("jour");

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

  // --- Bornes de la semaine (lundi -> samedi midi) ---
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // lundi=1 ... dimanche=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const saturdayNoon = new Date(monday);
  saturdayNoon.setDate(monday.getDate() + 5);
  saturdayNoon.setHours(12, 0, 0, 0);

  const inWeek = (iso: string) => {
    const d = new Date(iso);
    return d >= monday && d <= saturdayNoon;
  };
  const inToday = (iso: string) => iso.slice(0, 10) === todayStr;
  const inYear = (iso: string) => new Date(iso).getFullYear() === now.getFullYear();

  // =========================================================
  // RAPPORT JOURNALIER
  // =========================================================
  const passagesToday = passages.filter((p) => inToday(p.passage_date));
  const equipementsVusToday = [...new Set(passagesToday.map((p) => p.equipement_id))];
  const nouveauxToday = equipements.filter((e) => inToday(e.created_at));
  const equipementsActifs = equipements.filter((e) => e.statut === "en_attente" || e.statut === "en_reparation");
  const nonVusToday = equipementsActifs.filter((e) => !equipementsVusToday.includes(e.id));
  const termineLivreToday = equipements.filter((e) => (e.statut === "termine" || e.statut === "livre") && inToday(e.created_at));

  const progressionJour = (equipementId: string) => {
    const obs = passagesToday.filter((p) => p.equipement_id === equipementId).sort((a, b) => a.passage_date.localeCompare(b.passage_date));
    if (obs.length === 0) return null;
    return { debut: obs[0].pourcentage, fin: obs[obs.length - 1].pourcentage, nbTournees: obs.length };
  };

  // =========================================================
  // RAPPORT HEBDOMADAIRE
  // =========================================================
  const passagesWeek = passages.filter((p) => inWeek(p.passage_date));
  const equipementsActifsWeek = [...new Set(passagesWeek.map((p) => p.equipement_id))]
    .map((id) => equipements.find((e) => e.id === id))
    .filter(Boolean) as Equipement[];

  const chargeParAtelier = ateliers.map((a) => ({
    name: a.name,
    count: passagesWeek.filter((p) => p.atelier_id === a.id).length,
  })).sort((a, b) => b.count - a.count);

  const chargeParTechnicien = techniciens.map((t) => ({
    name: t.full_name,
    count: passagesWeek.filter((p) => p.technicien_id === t.id).length,
  })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);

  const bloquesSemaine = equipementsActifsWeek.filter((e) => {
    const obs = passagesWeek.filter((p) => p.equipement_id === e.id);
    return obs.length >= 2 && obs.every((p) => p.pourcentage === obs[0].pourcentage);
  });

  const nouveauxSemaine = equipements.filter((e) => inWeek(e.created_at));
  // Corrigé : "sortisSemaine" comptait TOUS les terminés/livrés de tous temps
  // (pas juste cette semaine) — on ne peut pas encore savoir QUAND un
  // équipement est sorti tant qu'on ne trace pas de vraie date de sortie
  // (le champ existe dans la base mais rien ne le renseigne encore dans
  // l'app). Libellé rendu honnête plutôt que trompeur, en attendant.
  const sortisTotalHistorique = equipements.filter((e) => e.statut === "termine" || e.statut === "livre");

  // Progression par équipement CETTE semaine (départ -> fin), et moyenne
  const progressionSemaineParEquipement = equipementsActifsWeek.map((e) => {
    const obs = passagesWeek.filter((p) => p.equipement_id === e.id).sort((a, b) => a.passage_date.localeCompare(b.passage_date));
    return { equipement: e, debut: obs[0]?.pourcentage ?? 0, fin: obs[obs.length - 1]?.pourcentage ?? 0 };
  });
  const progressionMoyenneSemaine =
    progressionSemaineParEquipement.length > 0
      ? Math.round(
          progressionSemaineParEquipement.reduce((s, p) => s + (p.fin - p.debut), 0) / progressionSemaineParEquipement.length
        )
      : 0;

  // =========================================================
  // RAPPORT ANNUEL
  // =========================================================
  const equipementsAnnee = equipements.filter((e) => inYear(e.created_at));

  // "Âge moyen" des équipements encore actifs, depuis leur entrée — un proxy
  // honnête (PAS un vrai "temps moyen de réparation", qui nécessiterait de
  // tracer une vraie date de sortie qu'on ne collecte pas encore dans l'app).
  const equipementsActifsAnnee = equipements.filter((e) => e.statut === "en_attente" || e.statut === "en_reparation");
  const ageMoyenJours =
    equipementsActifsAnnee.length > 0
      ? Math.round(
          equipementsActifsAnnee.reduce((s, e) => s + (now.getTime() - new Date(e.date_entree).getTime()) / 86400000, 0) /
            equipementsActifsAnnee.length
        )
      : 0;
  const parType: Record<string, number> = {};
  equipementsAnnee.forEach((e) => { parType[e.type_equipement] = (parType[e.type_equipement] || 0) + 1; });
  const parClient: Record<string, number> = {};
  equipementsAnnee.forEach((e) => { parClient[e.client_name] = (parClient[e.client_name] || 0) + 1; });

  const chargeAtelierAnnee = ateliers.map((a) => ({
    name: a.name,
    count: passages.filter((p) => inYear(p.passage_date) && p.atelier_id === a.id).length,
  })).sort((a, b) => b.count - a.count);

  const chargeTechnicienAnnee = techniciens.map((t) => ({
    name: t.full_name,
    count: passages.filter((p) => inYear(p.passage_date) && p.technicien_id === t.id).length,
  })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);

  const parMois: number[] = Array(12).fill(0);
  passages.filter((p) => inYear(p.passage_date)).forEach((p) => { parMois[new Date(p.passage_date).getMonth()]++; });
  const moisLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      let title = "";
      let periodLabel = "";
      let sections: { heading: string; rows: [string, string][] }[] = [];

      if (period === "jour") {
        title = "Rapport journalier";
        periodLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        sections = [
          {
            heading: "Indicateurs du jour",
            rows: [
              ["Équipements vus", String(equipementsVusToday.length)],
              ["Non vus", String(nonVusToday.length)],
              ["Nouveaux équipements", String(nouveauxToday.length)],
              ["Terminés / Livrés", String(termineLivreToday.length)],
            ],
          },
          {
            heading: "Progression du jour",
            rows: equipementsVusToday.map((id) => {
              const eq = equipements.find((e) => e.id === id);
              const prog = progressionJour(id);
              return [
                `${eq?.client_name} - ${eq?.type_equipement}`,
                prog ? `${prog.debut}% -> ${prog.fin}% (${prog.nbTournees} tournée${prog.nbTournees > 1 ? "s" : ""})` : "-",
              ] as [string, string];
            }),
          },
          {
            heading: "Équipements non vus aujourd'hui",
            rows: nonVusToday.map((e) => [`${e.client_name} - ${e.type_equipement}`, `${e.pourcentage_global}%`] as [string, string]),
          },
          {
            heading: "Nouveaux équipements entrés aujourd'hui",
            rows: nouveauxToday.map((e) => [`${e.client_name} - ${e.type_equipement}`, e.reference || "Sans référence"] as [string, string]),
          },
          {
            heading: "Terminés / Livrés aujourd'hui",
            rows: termineLivreToday.map((e) => [`${e.client_name} - ${e.type_equipement}`, e.statut === "livre" ? "Livré" : "Terminé"] as [string, string]),
          },
          {
            heading: "Répartition des passages par atelier (aujourd'hui)",
            rows: ateliers
              .map((a) => [a.name, String(passagesToday.filter((p) => p.atelier_id === a.id).length)] as [string, string])
              .filter(([, count]) => count !== "0"),
          },
        ];
      } else if (period === "semaine") {
        title = "Rapport hebdomadaire";
        periodLabel = `Du ${monday.toLocaleDateString("fr-FR")} au ${saturdayNoon.toLocaleDateString("fr-FR")} (samedi midi)`;
        sections = [
          {
            heading: "Indicateurs de la semaine",
            rows: [
              ["Équipements actifs (vus cette semaine)", String(equipementsActifsWeek.length)],
              ["Progression moyenne cette semaine", `${progressionMoyenneSemaine > 0 ? "+" : ""}${progressionMoyenneSemaine}%`],
              ["Équipements bloqués", String(bloquesSemaine.length)],
              ["Nouveaux entrés cette semaine", String(nouveauxSemaine.length)],
              ["Total terminés/livrés (historique)", String(sortisTotalHistorique.length)],
            ],
          },
          {
            heading: "Progression par équipement (début -> fin de semaine)",
            rows: progressionSemaineParEquipement.map((p) => [
              `${p.equipement.client_name} - ${p.equipement.type_equipement}`,
              `${p.debut}% -> ${p.fin}%`,
            ] as [string, string]),
          },
          {
            heading: "Nouveaux équipements entrés cette semaine",
            rows: nouveauxSemaine.map((e) => [`${e.client_name} - ${e.type_equipement}`, e.reference || "Sans référence"] as [string, string]),
          },
          { heading: "Charge par atelier", rows: chargeParAtelier.map((a) => [a.name, String(a.count)] as [string, string]) },
          { heading: "Charge par technicien", rows: chargeParTechnicien.map((t) => [t.name, String(t.count)] as [string, string]) },
          { heading: "Équipements bloqués toute la semaine", rows: bloquesSemaine.map((e) => [`${e.client_name} - ${e.type_equipement}`, `${e.pourcentage_global}%`] as [string, string]) },
        ];
      } else {
        title = "Rapport annuel";
        periodLabel = `Année ${now.getFullYear()}`;
        sections = [
          {
            heading: "Indicateurs de l'année",
            rows: [
              ["Équipements traités", String(equipementsAnnee.length)],
              ["Types différents", String(Object.keys(parType).length)],
              ["Clients différents", String(Object.keys(parClient).length)],
              ["Total passages", String(passages.filter((p) => inYear(p.passage_date)).length)],
              ["Âge moyen des équipements actifs", `${ageMoyenJours} jour${ageMoyenJours > 1 ? "s" : ""}`],
            ],
          },
          {
            heading: "Évolution mensuelle (nombre de passages)",
            rows: moisLabels.map((label, i) => [label, String(parMois[i])] as [string, string]),
          },
          { heading: "Répartition par type d'équipement", rows: Object.entries(parType).sort((a, b) => b[1] - a[1]).map(([t, c]) => [t, String(c)] as [string, string]) },
          { heading: "Répartition par client", rows: Object.entries(parClient).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, String(n)] as [string, string]) },
          { heading: "Charge par atelier (année)", rows: chargeAtelierAnnee.map((a) => [a.name, String(a.count)] as [string, string]) },
          { heading: "Techniciens les plus actifs (année)", rows: chargeTechnicienAnnee.map((t) => [t.name, String(t.count)] as [string, string]) },
        ];
      }

      const doc = await buildRapportPdf(title, periodLabel, sections);
      doc.save(`FARATEC_${title.replace(/\s/g, "_")}_${todayStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Rapports</h1>
        <p className="text-sm text-slate-500">Rapports internes — journalier, hebdomadaire, annuel.</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {[
            { key: "jour" as const, label: "Journalier", icon: Calendar },
            { key: "semaine" as const, label: "Hebdomadaire", icon: CalendarDays },
            { key: "annee" as const, label: "Annuel", icon: CalendarRange },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 ${
                period === p.key ? "bg-amber-500 text-neutral-900" : "bg-white text-slate-600 shadow-sm"
              }`}
            >
              <p.icon size={14} />
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading || loading}
          className="flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 bg-neutral-900 text-amber-500 hover:bg-neutral-800 disabled:opacity-50"
        >
          <FileDown size={14} />
          {downloading ? "Génération..." : "Télécharger PDF"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : period === "jour" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Équipements vus</p>
              <p className="text-lg font-bold text-slate-800">{equipementsVusToday.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Non vus</p>
              <p className="text-lg font-bold text-amber-600">{nonVusToday.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Nouveaux</p>
              <p className="text-lg font-bold text-slate-800">{nouveauxToday.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Terminés/Livrés</p>
              <p className="text-lg font-bold text-slate-800">{termineLivreToday.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-700 text-sm mb-3">Progression du jour, par équipement vu</h2>
            {equipementsVusToday.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Aucune observation aujourd'hui.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {equipementsVusToday.map((id) => {
                  const eq = equipements.find((e) => e.id === id);
                  const prog = progressionJour(id);
                  if (!eq || !prog) return null;
                  return (
                    <div key={id} className="py-2 flex items-center justify-between text-sm">
                      <span className="text-slate-800">{eq.client_name} — {eq.type_equipement}</span>
                      <span className="text-slate-600">
                        {prog.debut}% → <span className="font-semibold text-amber-700">{prog.fin}%</span>
                        <span className="text-slate-400 ml-2">({prog.nbTournees} tournée{prog.nbTournees > 1 ? "s" : ""})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {nonVusToday.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Non vus aujourd'hui</h2>
              <div className="divide-y divide-slate-100">
                {nonVusToday.map((e) => (
                  <div key={e.id} className="py-2 text-sm text-slate-700">{e.client_name} — {e.type_equipement}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : period === "semaine" ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Semaine du {monday.toLocaleDateString("fr-FR")} au {saturdayNoon.toLocaleDateString("fr-FR")} (samedi midi)
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Équipements actifs</p>
              <p className="text-lg font-bold text-slate-800">{equipementsActifsWeek.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Bloqués</p>
              <p className="text-lg font-bold text-amber-600">{bloquesSemaine.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Nouveaux</p>
              <p className="text-lg font-bold text-slate-800">{nouveauxSemaine.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Terminés/livrés (historique)</p>
              <p className="text-lg font-bold text-slate-800">{sortisTotalHistorique.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Charge par atelier</h2>
              {chargeParAtelier.every((a) => a.count === 0) ? (
                <p className="text-sm text-slate-400">Aucun passage cette semaine.</p>
              ) : (
                <div className="space-y-2">
                  {chargeParAtelier.map((a) => (
                    <div key={a.name} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{a.name}</span>
                      <span className="font-semibold text-slate-800">{a.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Charge par technicien</h2>
              {chargeParTechnicien.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun passage cette semaine.</p>
              ) : (
                <div className="space-y-2">
                  {chargeParTechnicien.map((t) => (
                    <div key={t.name} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{t.name}</span>
                      <span className="font-semibold text-slate-800">{t.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {bloquesSemaine.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Équipements bloqués toute la semaine</h2>
              <div className="divide-y divide-slate-100">
                {bloquesSemaine.map((e) => (
                  <div key={e.id} className="py-2 text-sm text-slate-700">{e.client_name} — {e.type_equipement} ({e.pourcentage_global}%)</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Équipements traités ({now.getFullYear()})</p>
              <p className="text-lg font-bold text-slate-800">{equipementsAnnee.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Types différents</p>
              <p className="text-lg font-bold text-slate-800">{Object.keys(parType).length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Clients différents</p>
              <p className="text-lg font-bold text-slate-800">{Object.keys(parClient).length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Total passages</p>
              <p className="text-lg font-bold text-slate-800">{passages.filter((p) => inYear(p.passage_date)).length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Âge moyen (actifs)</p>
              <p className="text-lg font-bold text-slate-800">{ageMoyenJours}j</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-700 text-sm mb-3">Passages par mois</h2>
            <div className="flex items-end gap-1 h-32">
              {parMois.map((count, i) => {
                const max = Math.max(...parMois, 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-amber-500 rounded-t" style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? "4px" : "0" }} />
                    <span className="text-[10px] text-slate-400">{moisLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Répartition par type d'équipement</h2>
              <div className="space-y-2">
                {Object.entries(parType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{type}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Répartition par client</h2>
              <div className="space-y-2">
                {Object.entries(parClient).sort((a, b) => b[1] - a[1]).map(([client, count]) => (
                  <div key={client} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{client}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Atelier le plus sollicité</h2>
              <div className="space-y-2">
                {chargeAtelierAnnee.map((a) => (
                  <div key={a.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{a.name}</span>
                    <span className="font-semibold text-slate-800">{a.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Techniciens les plus actifs</h2>
              <div className="space-y-2">
                {chargeTechnicienAnnee.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{t.name}</span>
                    <span className="font-semibold text-slate-800">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && equipements.length === 0 && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <FileBarChart size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">Pas encore assez de données pour générer un rapport.</p>
        </div>
      )}
    </div>
  );
}
