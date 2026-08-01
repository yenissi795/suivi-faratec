import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Factory, Plus, X } from "lucide-react";

interface Atelier {
  id: string;
  name: string;
  created_at: string;
}

export default function AteliersPage() {
  const { user } = useAuth();
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ateliers").select("*").order("name");
    setAteliers((data as Atelier[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError("Le nom de l'atelier est obligatoire.");
      return;
    }
    if (!user) return;
    await supabase.from("ateliers").insert({ name: newName.trim(), owner_id: user.id });
    setNewName("");
    setError("");
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ateliers").delete().eq("id", id);
    setConfirmDelete(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Ateliers</h1>
        <p className="text-sm text-slate-500">Référentiel des ateliers — vous pouvez en ajouter à tout moment.</p>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-slate-700 text-sm">Ajouter un atelier</h2>
        <div className="flex gap-2">
          <input
            placeholder="Nom de l'atelier (ex: Sablage)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={`flex-1 border rounded-lg px-3 py-2 text-sm ${error ? "border-red-400" : "border-slate-200"}`}
          />
          <button onClick={handleAdd} className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-4 py-2 text-sm font-medium">
            <Plus size={16} />
            Ajouter
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-700 text-sm mb-3">Liste des ateliers</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : ateliers.length === 0 ? (
          <div className="text-center py-8">
            <Factory size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucun atelier pour l'instant.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ateliers.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{a.name}</span>
                {confirmDelete === a.id ? (
                  <span className="flex gap-2">
                    <button onClick={() => handleDelete(a.id)} className="text-red-600 text-xs font-semibold">Confirmer</button>
                    <button onClick={() => setConfirmDelete(null)} className="text-slate-400 text-xs">
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(a.id)} className="text-red-500 text-xs hover:underline">
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
