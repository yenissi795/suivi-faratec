import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Users, Plus } from "lucide-react";

interface Atelier {
  id: string;
  name: string;
}
interface Technicien {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

export default function TechniciensPage() {
  const { user } = useAuth();
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [selectedAteliers, setSelectedAteliers] = useState<string[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: techData }, { data: atelierData }, { data: assignData }] = await Promise.all([
      supabase.from("techniciens").select("*").order("full_name"),
      supabase.from("ateliers").select("id, name").order("name"),
      supabase.from("technicien_ateliers").select("technicien_id, atelier_id"),
    ]);
    setTechniciens((techData as Technicien[]) || []);
    setAteliers((atelierData as Atelier[]) || []);
    const grouped: Record<string, string[]> = {};
    (assignData || []).forEach((row: any) => {
      if (!grouped[row.technicien_id]) grouped[row.technicien_id] = [];
      grouped[row.technicien_id].push(row.atelier_id);
    });
    setAssignments(grouped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAtelier = (id: string) => {
    setSelectedAteliers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError("Le nom de l'opérateur est obligatoire.");
      return;
    }
    if (!user) return;
    const { data: newTech, error: insertError } = await supabase
      .from("techniciens")
      .insert({ full_name: newName.trim(), phone: newPhone.trim() || null, owner_id: user.id })
      .select()
      .single();
    if (insertError || !newTech) return;

    if (selectedAteliers.length > 0) {
      await supabase.from("technicien_ateliers").insert(
        selectedAteliers.map((atelier_id) => ({ technicien_id: newTech.id, atelier_id, owner_id: user.id }))
      );
    }
    setNewName("");
    setNewPhone("");
    setSelectedAteliers([]);
    setError("");
    load();
  };

  const atelierNames = (technicienId: string) => {
    const ids = assignments[technicienId] || [];
    return ateliers.filter((a) => ids.includes(a.id)).map((a) => a.name).join(", ") || "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Opérateurs</h1>
        <p className="text-sm text-slate-500">Gérez les opérateurs et leurs ateliers de spécialité.</p>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-slate-700 text-sm">Ajouter un opérateur</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            placeholder="Nom complet"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-sm ${error ? "border-red-400" : "border-slate-200"}`}
          />
          <input
            placeholder="Téléphone (optionnel)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Ateliers de spécialité (plusieurs possibles)</label>
          <div className="flex flex-wrap gap-2">
            {ateliers.map((a) => (
              <label
                key={a.id}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                  selectedAteliers.includes(a.id) ? "bg-amber-50 border-amber-400 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                <input type="checkbox" checked={selectedAteliers.includes(a.id)} onChange={() => toggleAtelier(a.id)} className="w-3.5 h-3.5" />
                {a.name}
              </label>
            ))}
            {ateliers.length === 0 && <p className="text-xs text-slate-400">Créez d'abord des ateliers.</p>}
          </div>
        </div>

        <button onClick={handleAdd} className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-4 py-2 text-sm font-medium">
          <Plus size={16} />
          Ajouter l'opérateur
        </button>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-700 text-sm mb-3">Liste des opérateurs</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : techniciens.length === 0 ? (
          <div className="text-center py-8">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucun opérateur pour l'instant.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {techniciens.map((t) => (
              <div key={t.id} className="py-2.5">
                <p className="text-sm font-medium text-slate-800">{t.full_name}</p>
                <p className="text-xs text-slate-500">{atelierNames(t.id)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}