import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Users, Plus, Edit3, X, Loader2, Check, Phone, Trash2 } from "lucide-react";

interface Atelier {
  id: string;
  name: string;
}
interface Operateur {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  owner_id: string | null;
}

export default function OperateursPage() {
  const { user } = useAuth();
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [selectedAteliers, setSelectedAteliers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Édition
  const [editing, setEditing] = useState<Operateur | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Suppression
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: opData }, { data: atelierData }, { data: assignData }] = await Promise.all([
      supabase.from("operateurs").select("*").order("full_name"),
      supabase.from("ateliers").select("id, name").order("name"),
      supabase.from("operateur_ateliers").select("operateur_id, atelier_id"),
    ]);
    setOperateurs((opData as Operateur[]) || []);
    setAteliers((atelierData as Atelier[]) || []);
    const grouped: Record<string, string[]> = {};
    (assignData || []).forEach((row: any) => {
      if (!grouped[row.operateur_id]) grouped[row.operateur_id] = [];
      grouped[row.operateur_id].push(row.atelier_id);
    });
    setAssignments(grouped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleAtelier = (id: string) => {
    setSelectedAteliers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError("Le nom de l'opérateur est obligatoire.");
      return;
    }
    if (!user) return;
    const { data: newOp, error: insertError } = await supabase
      .from("operateurs")
      .insert({ full_name: newName.trim(), phone: newPhone.trim() || null, owner_id: user.id, is_active: true })
      .select()
      .single();
    if (insertError || !newOp) return;

    if (selectedAteliers.length > 0) {
      await supabase.from("operateur_ateliers").insert(
        selectedAteliers.map((atelier_id) => ({ operateur_id: newOp.id, atelier_id, owner_id: user.id }))
      );
    }
    setNewName("");
    setNewPhone("");
    setSelectedAteliers([]);
    setError("");
    load();
  };

  const openEdit = (op: Operateur) => {
    setEditing(op);
    setEditName(op.full_name);
    setEditPhone(op.phone || "");
  };

  const closeEdit = () => {
    setEditing(null);
    setEditName("");
    setEditPhone("");
  };

  const handleSaveEdit = async () => {
    if (!editing || !editName.trim()) return;
    setEditSaving(true);
    setOperateurs((prev) => prev.map((o) => (o.id === editing.id ? { ...o, full_name: editName.trim(), phone: editPhone.trim() || null } : o)));
    await supabase.from("operateurs").update({
      full_name: editName.trim(),
      phone: editPhone.trim() || null,
    }).eq("id", editing.id);
    setEditSaving(false);
    closeEdit();
  };

  const handleDelete = async (id: string) => {
    const op = operateurs.find((o) => o.id === id);
    if (!op || op.owner_id !== user?.id) return;

    // Optimistic update
    setOperateurs((prev) => prev.filter((o) => o.id !== id));
    setConfirmDelete(null);

    // Supprimer d'abord les associations aux ateliers
    await supabase.from("operateur_ateliers").delete().eq("operateur_id", id);

    // Puis supprimer l'opérateur lui-même
    await supabase.from("operateurs").delete().eq("id", id);
  };

  const atelierNames = (operateurId: string) => {
    const ids = assignments[operateurId] || [];
    return ateliers.filter((a) => ids.includes(a.id)).map((a) => a.name).join(", ") || "—";
  };

  const filteredOperateurs = operateurs.filter((o) =>
    o.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Opérateurs</h1>
        <p className="text-sm text-slate-500">Gérez les opérateurs et leurs ateliers de spécialité.</p>
      </div>

      {/* --- AJOUT --- */}
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

      {/* --- LISTE --- */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-semibold text-slate-700 text-sm">
            Liste des opérateurs <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold ml-2">{operateurs.length}</span>
          </h2>
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48"
          />
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : filteredOperateurs.length === 0 ? (
          <div className="text-center py-8">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucun opérateur trouvé.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredOperateurs.map((o) => {
              const isOwnOperateur = o.owner_id === user?.id;
              const isDeleting = confirmDelete === o.id;
              return (
                <div key={o.id} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/40 transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{o.full_name}</p>
                      {!o.owner_id && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                          GLOBAL
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{atelierNames(o.id)}</p>
                    {o.phone && (
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Phone size={10} /> {o.phone}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(o)}
                      className="text-blue-600 hover:bg-blue-50 rounded-lg p-2 transition"
                      title="Modifier"
                    >
                      <Edit3 size={14} />
                    </button>

                    {isOwnOperateur && (
                      <>
                        {isDeleting ? (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(o.id)}
                              className="text-red-600 text-xs font-semibold bg-red-50 hover:bg-red-100 rounded px-2 py-1 transition"
                            >
                              Confirmer
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="text-slate-400 hover:text-slate-600 p-1">
                              <X size={12} />
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(o.id)}
                            className="text-red-500 hover:bg-red-50 rounded-lg p-2 transition"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- MODALE ÉDITION --- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Edit3 size={16} className="text-blue-600" /> Modifier l'opérateur
              </h3>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 p-1 transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Nom complet *</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Téléphone</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={closeEdit} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving || !editName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 transition"
              >
                {editSaving ? <><Loader2 className="animate-spin" size={14} /> Enregistrement...</> : <><Check size={14} /> Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}