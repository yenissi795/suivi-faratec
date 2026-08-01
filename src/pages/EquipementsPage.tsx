import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Package, Plus } from "lucide-react";

interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  reference: string | null;
  date_entree: string;
  statut: string;
  pourcentage_global: number;
}

const statusLabels: Record<string, string> = {
  en_attente: "En attente",
  en_reparation: "En réparation",
  termine: "Terminé",
  livre: "Livré",
};
const statusColors: Record<string, string> = {
  en_attente: "bg-slate-100 text-slate-600",
  en_reparation: "bg-amber-100 text-amber-700",
  termine: "bg-green-100 text-green-700",
  livre: "bg-amber-100 text-amber-700",
};

export default function EquipementsPage() {
  const { user } = useAuth();
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [loading, setLoading] = useState(true);

  const [clientName, setClientName] = useState("");
  const [typeEquipement, setTypeEquipement] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("equipements")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setEquipements((data as Equipement[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!clientName.trim()) errs.clientName = "Le nom du client est obligatoire.";
    if (!typeEquipement.trim()) errs.typeEquipement = "Le type d'équipement est obligatoire.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = async () => {
    if (!validate() || !user) return;
    setSaving(true);
    await supabase.from("equipements").insert({
      client_name: clientName.trim(),
      type_equipement: typeEquipement.trim(),
      reference: reference.trim() || null,
      owner_id: user.id,
    });
    setClientName("");
    setTypeEquipement("");
    setReference("");
    setErrors({});
    setSaving(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Équipements</h1>
        <p className="text-sm text-slate-500">Machines en cours de réparation, tous ateliers confondus.</p>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-slate-700 text-sm">Nouvel équipement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <input
              placeholder="Nom du client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.clientName ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.clientName && <p className="text-xs text-red-600 mt-1">{errors.clientName}</p>}
          </div>
          <div>
            <input
              placeholder="Type (ex: Moteur électrique)"
              value={typeEquipement}
              onChange={(e) => setTypeEquipement(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.typeEquipement ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.typeEquipement && <p className="text-xs text-red-600 mt-1">{errors.typeEquipement}</p>}
          </div>
          <input
            placeholder="Référence / N° série (optionnel)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button onClick={handleAdd} disabled={saving} className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          <Plus size={16} />
          {saving ? "Enregistrement..." : "Ajouter"}
        </button>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-slate-700 text-sm mb-3">Liste des équipements</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : equipements.length === 0 ? (
          <div className="text-center py-8">
            <Package size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucun équipement pour l'instant.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-separate" style={{ borderSpacing: "0 4px" }}>
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="pb-2 pr-4 font-medium">Client</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Référence</th>
                <th className="pb-2 pr-4 font-medium">Entrée</th>
                <th className="pb-2 pr-4 font-medium">Statut</th>
                <th className="pb-2 font-medium text-right">Avancement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {equipements.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-4 font-medium text-slate-800">{e.client_name}</td>
                  <td className="py-2 pr-4 text-slate-600">{e.type_equipement}</td>
                  <td className="py-2 pr-4 text-slate-500">{e.reference || "—"}</td>
                  <td className="py-2 pr-4 text-slate-500">{new Date(e.date_entree).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[e.statut]}`}>
                      {statusLabels[e.statut] || e.statut}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${e.pourcentage_global}%` }} />
                      </div>
                      <span className="font-medium text-slate-700 w-10 text-right">{e.pourcentage_global}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
