import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Calculator, Search, Plus, X, Trash2, Edit3, Loader2, FileDown,
  Package, Wrench, Truck, Droplet, Users,
  Save, RotateCcw, Coins
} from "lucide-react";

// --- TYPES ---
interface Equipement {
  id: string;
  code_faratec: string | null;
  client_name: string;
  type_equipement: string;
  marque: string | null;
  puissance_kw: number | null;
}
interface Operateur {
  id: string;
  full_name: string;
}
interface LigneCout {
  id: string;
  equipement_id: string;
  type_ligne: "piece" | "sous_traitance" | "transport" | "consommable" | "main_oeuvre";
  description: string;
  reference: string | null;
  quantite: number;
  prix_unitaire: number;
  operateur_id: string | null;
  heures: number | null;
  ordre: number;
  operateurs?: { full_name: string } | null;
}

// --- CONFIG DES SECTIONS ---
const SECTIONS: { key: LigneCout["type_ligne"]; label: string; icon: any; color: string; bg: string; border: string }[] = [
  { key: "piece", label: "Pièces de rechange", icon: Package, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  { key: "sous_traitance", label: "Sous-traitance", icon: Wrench, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  { key: "transport", label: "Transport", icon: Truck, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "consommable", label: "Consommables", icon: Droplet, color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
  { key: "main_oeuvre", label: "Main d'œuvre & Opérations", icon: Users, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
];

export default function CoutsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [lignes, setLignes] = useState<LigneCout[]>([]);

  const [selectedEquipementId, setSelectedEquipementId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showEquipementList, setShowEquipementList] = useState(false);

  // Édition inline
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<Partial<LigneCout>>({});

  // Nouvelle ligne
  const [addingTo, setAddingTo] = useState<LigneCout["type_ligne"] | null>(null);
  const [newLine, setNewLine] = useState<Partial<LigneCout>>({});

  // --- CHARGEMENT GÉNÉRAL ---
  const load = async () => {
    setLoading(true);
    const [eqRes, opRes] = await Promise.all([
      supabase.from("equipements").select("id, code_faratec, client_name, type_equipement, marque, puissance_kw").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("operateurs").select("id, full_name").eq("is_active", true).order("full_name"),
    ]);
    setEquipements((eqRes.data as Equipement[]) || []);
    setOperateurs((opRes.data as Operateur[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // --- LIRE LE PARAMÈTRE URL "eq" ---
  useEffect(() => {
    const eqId = searchParams.get("eq");
    if (eqId) setSelectedEquipementId(eqId);
  }, [searchParams]);

  // --- CHARGER LES LIGNES QUAND UN ÉQUIPEMENT EST SÉLECTIONNÉ ---
  useEffect(() => {
    const loadLignes = async () => {
      if (!selectedEquipementId) {
        setLignes([]);
        return;
      }
      const { data } = await supabase
        .from("lignes_cout")
        .select("*, operateurs(full_name)")
        .eq("equipement_id", selectedEquipementId)
        .order("ordre", { ascending: true })
        .order("created_at", { ascending: true });
      setLignes((data as unknown as LigneCout[]) || []);
    };
    loadLignes();
  }, [selectedEquipementId]);

  const selectedEquipement = useMemo(
    () => equipements.find((e) => e.id === selectedEquipementId),
    [equipements, selectedEquipementId]
  );

  const filteredEquipements = useMemo(() => {
    if (!searchTerm) return equipements.slice(0, 50);
    const s = searchTerm.toLowerCase();
    return equipements.filter((e) =>
      (e.code_faratec && e.code_faratec.toLowerCase().includes(s)) ||
      e.client_name.toLowerCase().includes(s) ||
      e.type_equipement.toLowerCase().includes(s)
    ).slice(0, 50);
  }, [equipements, searchTerm]);

  // --- CALCULS ---
  const getLignesParSection = (type: LigneCout["type_ligne"]) =>
    lignes.filter((l) => l.type_ligne === type);

  const getTotalSection = (type: LigneCout["type_ligne"]) =>
    getLignesParSection(type).reduce((sum, l) => sum + (Number(l.quantite) * Number(l.prix_unitaire)), 0);

  const totalHT = useMemo(
    () => lignes.reduce((sum, l) => sum + (Number(l.quantite) * Number(l.prix_unitaire)), 0),
    [lignes]
  );

  const formatPrice = (n: number) =>
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH";

  // --- AJOUT DE LIGNE ---
  const startAddLine = (type: LigneCout["type_ligne"]) => {
    setAddingTo(type);
    setNewLine({
      type_ligne: type,
      description: "",
      reference: "",
      quantite: 1,
      prix_unitaire: 0,
      operateur_id: null,
      heures: null,
    });
  };

  const cancelAddLine = () => {
    setAddingTo(null);
    setNewLine({});
  };

  const handleSaveNewLine = async () => {
    if (!user || !selectedEquipementId || !addingTo) return;
    if (!newLine.description?.trim()) return;

    setSaving(true);
    const ligneData = {
      equipement_id: selectedEquipementId,
      type_ligne: addingTo,
      description: newLine.description.trim(),
      reference: newLine.reference?.trim() || null,
      quantite: Number(newLine.quantite) || 1,
      prix_unitaire: Number(newLine.prix_unitaire) || 0,
      operateur_id: newLine.operateur_id || null,
      heures: newLine.heures ? Number(newLine.heures) : null,
      ordre: getLignesParSection(addingTo).length,
      owner_id: user.id,
    };

    const { data, error } = await supabase
      .from("lignes_cout")
      .insert(ligneData)
      .select("*, operateurs(full_name)")
      .single();

    if (error || !data) {
      setSaving(false);
      alert("Erreur : " + error?.message);
      return;
    }

    setLignes((prev) => [...prev, data as unknown as LigneCout]);
    setSaving(false);
    cancelAddLine();
  };

  // --- ÉDITION INLINE ---
  const startEdit = (ligne: LigneCout) => {
    setEditingLineId(ligne.id);
    setEditLine({ ...ligne });
  };

  const cancelEdit = () => {
    setEditingLineId(null);
    setEditLine({});
  };

  const handleSaveEdit = async () => {
    if (!editingLineId) return;
    setSaving(true);

    const updates = {
      description: editLine.description || "",
      reference: editLine.reference || null,
      quantite: Number(editLine.quantite) || 1,
      prix_unitaire: Number(editLine.prix_unitaire) || 0,
      operateur_id: editLine.operateur_id || null,
      heures: editLine.heures ? Number(editLine.heures) : null,
    };

    setLignes((prev) =>
      prev.map((l) => (l.id === editingLineId ? { ...l, ...updates } as LigneCout : l))
    );

    await supabase.from("lignes_cout").update(updates).eq("id", editingLineId);

    setSaving(false);
    cancelEdit();
  };

  // --- SUPPRESSION ---
  const handleDeleteLine = async (id: string) => {
    if (!confirm("Supprimer cette ligne ?")) return;
    setLignes((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("lignes_cout").delete().eq("id", id);
  };

  // --- PDF (placeholder) ---
    // --- GÉNÉRATION PDF ---
  const handleDownloadPdf = async () => {
    if (!selectedEquipement) return;

    const sections = SECTIONS.map((s) => ({
      label: s.label,
      lignes: getLignesParSection(s.key).map((l) => ({
        description: l.description,
        reference: l.reference,
        quantite: Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire),
        operateur_name: l.operateurs?.full_name || null,
        heures: l.heures,
      })),
      total: getTotalSection(s.key),
    }));

    const { buildFicheCoutPdf } = await import("../lib/reportPdf");
    const doc = await buildFicheCoutPdf({
      code_faratec: selectedEquipement.code_faratec || "",
      client_name: selectedEquipement.client_name || "",
      type_equipement: selectedEquipement.type_equipement || "",
      marque: selectedEquipement.marque,
      puissance_kw: selectedEquipement.puissance_kw,
      sections,
      totalHT,
    });

    const filename = `FARATEC_Cout_${(selectedEquipement.code_faratec || "sans-code").replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-amber-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* --- EN-TÊTE --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Calculator size={20} className="text-amber-600" />
            Calcul des coûts
          </h1>
          <p className="text-sm text-slate-500">Fiche de calcul de la remise en état par équipement.</p>
        </div>
        {selectedEquipement && (
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-amber-500 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition"
          >
            <FileDown size={14} /> Télécharger PDF
          </button>
        )}
      </div>

      {/* --- SÉLECTEUR D'ÉQUIPEMENT --- */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        {selectedEquipement ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Équipement sélectionné</p>
              <p className="font-bold text-slate-800">
                {selectedEquipement.code_faratec || "—"}
                <span className="text-slate-500 font-normal"> · {selectedEquipement.client_name}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedEquipement.type_equipement}
                {selectedEquipement.marque && ` · ${selectedEquipement.marque}`}
                {selectedEquipement.puissance_kw && ` · ${selectedEquipement.puissance_kw} kW`}
              </p>
            </div>
            <button
              onClick={() => { setSelectedEquipementId(""); setSearchTerm(""); setShowEquipementList(false); }}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 shrink-0"
            >
              <RotateCcw size={12} /> Changer
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Sélectionner un équipement</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher par code Faratec, client ou type..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowEquipementList(true); }}
                onFocus={() => setShowEquipementList(true)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {showEquipementList && (
              <div className="mt-2 max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {filteredEquipements.length === 0 ? (
                  <p className="text-sm text-slate-400 p-4 text-center">Aucun équipement trouvé.</p>
                ) : (
                  filteredEquipements.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { setSelectedEquipementId(e.id); setShowEquipementList(false); }}
                      className="w-full text-left p-3 hover:bg-amber-50/50 transition"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {e.code_faratec || "—"} <span className="text-slate-500 font-normal">· {e.client_name}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{e.type_equipement}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- FICHE COÛT --- */}
      {selectedEquipement && (
        <>
          {/* Titre fiche */}
          <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 rounded-xl p-5 shadow-lg border-b-4 border-amber-500">
            <h2 className="text-white font-bold text-lg">Calcul des coûts de la remise en état</h2>
            <p className="text-amber-500 text-sm mt-1">
              Dossier : <strong>{selectedEquipement.code_faratec || "—"}</strong>
              {selectedEquipement.puissance_kw && <> · {selectedEquipement.puissance_kw} KW</>}
            </p>
            <p className="text-slate-300 text-sm mt-0.5">
              Client : <strong>{selectedEquipement.client_name}</strong>
            </p>
          </div>

          {/* Sections */}
          {SECTIONS.map((section) => {
            const sectionLignes = getLignesParSection(section.key);
            const sectionTotal = getTotalSection(section.key);
            const Icon = section.icon;
            const isAdding = addingTo === section.key;

            return (
              <div key={section.key} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Header section */}
                <div className={`p-4 border-b ${section.border} ${section.bg} flex items-center justify-between`}>
                  <h3 className={`font-bold text-sm flex items-center gap-2 ${section.color}`}>
                    <Icon size={16} />
                    {section.label}
                    <span className="text-xs bg-white/70 px-2 py-0.5 rounded-full font-bold">
                      {sectionLignes.length}
                    </span>
                  </h3>
                  <button
                    onClick={() => startAddLine(section.key)}
                    className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white hover:shadow-md transition ${section.color}`}
                  >
                    <Plus size={12} /> Ajouter
                  </button>
                </div>

                {/* Tableau */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        {section.key !== "main_oeuvre" && (
                          <th className="p-2 text-left font-semibold">Référence</th>
                        )}
                        <th className="p-2 text-left font-semibold">
                          {section.key === "main_oeuvre" ? "Opération" : "Description"}
                        </th>
                        {section.key === "main_oeuvre" && (
                          <>
                            <th className="p-2 text-left font-semibold">Opérateur</th>
                            <th className="p-2 text-center font-semibold">Heures</th>
                          </>
                        )}
                        {section.key !== "main_oeuvre" && (
                          <th className="p-2 text-center font-semibold w-20">Qté</th>
                        )}
                        <th className="p-2 text-right font-semibold w-28">P.U HT</th>
                        <th className="p-2 text-right font-semibold w-28">Total HT</th>
                        <th className="p-2 text-center font-semibold w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sectionLignes.map((l) => {
                        const isEditing = editingLineId === l.id;
                        const lineTotal = Number(l.quantite) * Number(l.prix_unitaire);
                        return (
                          <tr key={l.id} className="hover:bg-slate-50/50">
                            {isEditing ? (
                              <>
                                {section.key !== "main_oeuvre" && (
                                  <td className="p-1">
                                    <input
                                      value={editLine.reference || ""}
                                      onChange={(e) => setEditLine((p) => ({ ...p, reference: e.target.value }))}
                                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                                      placeholder="Réf."
                                    />
                                  </td>
                                )}
                                <td className="p-1">
                                  <input
                                    value={editLine.description || ""}
                                    onChange={(e) => setEditLine((p) => ({ ...p, description: e.target.value }))}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                                    placeholder="Description"
                                  />
                                </td>
                                {section.key === "main_oeuvre" && (
                                  <>
                                    <td className="p-1">
                                      <select
                                        value={editLine.operateur_id || ""}
                                        onChange={(e) => setEditLine((p) => ({ ...p, operateur_id: e.target.value || null }))}
                                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                                      >
                                        <option value="">—</option>
                                        {operateurs.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <input
                                        type="number"
                                        value={editLine.heures || ""}
                                        onChange={(e) => setEditLine((p) => ({ ...p, heures: Number(e.target.value) || null }))}
                                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-center"
                                        placeholder="h"
                                      />
                                    </td>
                                  </>
                                )}
                                {section.key !== "main_oeuvre" && (
                                  <td className="p-1">
                                    <input
                                      type="number"
                                      value={editLine.quantite || ""}
                                      onChange={(e) => setEditLine((p) => ({ ...p, quantite: Number(e.target.value) || 0 }))}
                                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-center"
                                    />
                                  </td>
                                )}
                                <td className="p-1">
                                  <input
                                    type="number"
                                    value={editLine.prix_unitaire || ""}
                                    onChange={(e) => setEditLine((p) => ({ ...p, prix_unitaire: Number(e.target.value) || 0 }))}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right"
                                  />
                                </td>
                                <td className="p-2 text-right font-bold text-slate-700">
                                  {formatPrice((Number(editLine.quantite) || 0) * (Number(editLine.prix_unitaire) || 0))}
                                </td>
                                <td className="p-1">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={handleSaveEdit}
                                      disabled={saving}
                                      className="text-green-600 hover:bg-green-50 rounded p-1 transition"
                                      title="Enregistrer"
                                    >
                                      <Save size={12} />
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="text-slate-400 hover:bg-slate-100 rounded p-1 transition"
                                      title="Annuler"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                {section.key !== "main_oeuvre" && (
                                  <td className="p-2 text-slate-600">{l.reference || "—"}</td>
                                )}
                                <td className="p-2 text-slate-800 font-medium">{l.description}</td>
                                {section.key === "main_oeuvre" && (
                                  <>
                                    <td className="p-2 text-slate-600">{l.operateurs?.full_name || "—"}</td>
                                    <td className="p-2 text-center text-slate-600">{l.heures || "—"}</td>
                                  </>
                                )}
                                {section.key !== "main_oeuvre" && (
                                  <td className="p-2 text-center text-slate-600">{l.quantite}</td>
                                )}
                                <td className="p-2 text-right text-slate-600">{formatPrice(Number(l.prix_unitaire))}</td>
                                <td className="p-2 text-right font-bold text-slate-800">{formatPrice(lineTotal)}</td>
                                <td className="p-1">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => startEdit(l)}
                                      className="text-blue-600 hover:bg-blue-50 rounded p-1 transition"
                                      title="Modifier"
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLine(l.id)}
                                      className="text-red-500 hover:bg-red-50 rounded p-1 transition"
                                      title="Supprimer"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}

                      {/* Ligne d'ajout */}
                      {isAdding && (
                        <tr className="bg-amber-50/50 border-t-2 border-amber-300">
                          {section.key !== "main_oeuvre" && (
                            <td className="p-1">
                              <input
                                value={newLine.reference || ""}
                                onChange={(e) => setNewLine((p) => ({ ...p, reference: e.target.value }))}
                                className="w-full border border-amber-300 rounded px-2 py-1 text-xs"
                                placeholder="Réf."
                                autoFocus
                              />
                            </td>
                          )}
                          <td className="p-1">
                            <input
                              value={newLine.description || ""}
                              onChange={(e) => setNewLine((p) => ({ ...p, description: e.target.value }))}
                              className="w-full border border-amber-300 rounded px-2 py-1 text-xs"
                              placeholder={section.key === "main_oeuvre" ? "Ex: Démontage" : "Description"}
                            />
                          </td>
                          {section.key === "main_oeuvre" && (
                            <>
                              <td className="p-1">
                                <select
                                  value={newLine.operateur_id || ""}
                                  onChange={(e) => setNewLine((p) => ({ ...p, operateur_id: e.target.value || null }))}
                                  className="w-full border border-amber-300 rounded px-2 py-1 text-xs"
                                >
                                  <option value="">Opérateur</option>
                                  {operateurs.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                                </select>
                              </td>
                              <td className="p-1">
                                <input
                                  type="number"
                                  value={newLine.heures || ""}
                                  onChange={(e) => setNewLine((p) => ({ ...p, heures: Number(e.target.value) || null }))}
                                  className="w-full border border-amber-300 rounded px-2 py-1 text-xs text-center"
                                  placeholder="h"
                                />
                              </td>
                            </>
                          )}
                          {section.key !== "main_oeuvre" && (
                            <td className="p-1">
                              <input
                                type="number"
                                value={newLine.quantite || ""}
                                onChange={(e) => setNewLine((p) => ({ ...p, quantite: Number(e.target.value) || 0 }))}
                                className="w-full border border-amber-300 rounded px-2 py-1 text-xs text-center"
                              />
                            </td>
                          )}
                          <td className="p-1">
                            <input
                              type="number"
                              value={newLine.prix_unitaire || ""}
                              onChange={(e) => setNewLine((p) => ({ ...p, prix_unitaire: Number(e.target.value) || 0 }))}
                              className="w-full border border-amber-300 rounded px-2 py-1 text-xs text-right"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2 text-right font-bold text-slate-700">
                            {formatPrice((Number(newLine.quantite) || 0) * (Number(newLine.prix_unitaire) || 0))}
                          </td>
                          <td className="p-1">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={handleSaveNewLine}
                                disabled={saving || !newLine.description?.trim()}
                                className="text-green-600 hover:bg-green-50 rounded p-1 transition disabled:opacity-30"
                                title="Enregistrer"
                              >
                                <Save size={12} />
                              </button>
                              <button
                                onClick={cancelAddLine}
                                className="text-slate-400 hover:bg-slate-100 rounded p-1 transition"
                                title="Annuler"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Ligne vide si aucune ligne */}
                      {sectionLignes.length === 0 && !isAdding && (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400 italic text-xs">
                            Aucune ligne. Cliquez sur "+ Ajouter" pour commencer.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    {/* Total section */}
                    {sectionLignes.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300">
                          <td colSpan={section.key === "main_oeuvre" ? 5 : 4} className="p-2 text-right font-bold text-slate-700 text-xs uppercase">
                            Total {section.label}
                          </td>
                          <td className="p-2 text-right font-bold text-amber-700 text-sm">
                            {formatPrice(sectionTotal)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })}

          {/* --- TOTAL GÉNÉRAL --- */}
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Coins size={32} className="text-white/90" />
                <div>
                  <p className="text-white/80 text-xs uppercase tracking-wider font-bold">Total prix HT</p>
                  <p className="text-white/70 text-[10px]">{lignes.length} ligne{lignes.length > 1 ? "s" : ""} au total</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{formatPrice(totalHT)}</p>
            </div>
          </div>
        </>
      )}

      {/* --- ÉTAT VIDE --- */}
      {!selectedEquipement && !loading && (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <Calculator size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Sélectionnez un équipement pour commencer.</p>
          <p className="text-xs text-slate-400 mt-1">
            Utilisez la barre de recherche ci-dessus pour trouver un équipement.
          </p>
        </div>
      )}
    </div>
  );
}