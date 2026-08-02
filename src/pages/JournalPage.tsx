import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ClipboardList, Camera, X, Plus } from "lucide-react";

interface Equipement {
  id: string;
  client_name: string;
  type_equipement: string;
  pourcentage_global: number;
}
interface Atelier {
  id: string;
  name: string;
}
interface Technicien {
  id: string;
  full_name: string;
}
interface Passage {
  id: string;
  equipement_id: string;
  atelier_id: string;
  technicien_id: string | null;
  pourcentage: number;
  commentaire: string | null;
  photo_url: string | null;
  passage_date: string;
  equipements: { client_name: string; type_equipement: string } | null;
  ateliers: { name: string } | null;
  techniciens: { full_name: string } | null;
}

export default function JournalPage() {
  const { user } = useAuth();
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- Équipement : existant OU nouveau (créé à la volée) ---
  const [equipementMode, setEquipementMode] = useState<"existing" | "new">("existing");
  const [equipementId, setEquipementId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newTypeEquipement, setNewTypeEquipement] = useState("");
  const [newReference, setNewReference] = useState("");

  const [atelierId, setAtelierId] = useState("");
  const [technicienId, setTechnicienId] = useState("");
  const [pourcentage, setPourcentage] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: eqData }, { data: atData }, { data: techData }, { data: passData }] = await Promise.all([
      supabase.from("equipements").select("id, client_name, type_equipement, pourcentage_global").is("deleted_at", null).order("client_name"),
      supabase.from("ateliers").select("id, name").order("name"),
      supabase.from("techniciens").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase
        .from("journal_passages")
        .select("*, equipements(client_name, type_equipement), ateliers(name), techniciens(full_name)")
        .is("deleted_at", null)
        .order("passage_date", { ascending: false })
        .limit(30),
    ]);
    setEquipements((eqData as Equipement[]) || []);
    setAteliers((atData as Atelier[]) || []);
    setTechniciens((techData as Technicien[]) || []);
    setPassages((passData as unknown as Passage[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (equipementMode === "existing" && !equipementId) errs.equipementId = "Sélectionne un équipement.";
    if (equipementMode === "new") {
      if (!newClientName.trim()) errs.newClientName = "Le nom du client est obligatoire.";
      if (!newTypeEquipement.trim()) errs.newTypeEquipement = "Le type d'équipement est obligatoire.";
    }
    if (!atelierId) errs.atelierId = "Sélectionne un atelier.";
    if (pourcentage === "") errs.pourcentage = "Le pourcentage est obligatoire.";
    else if (Number(pourcentage) < 0 || Number(pourcentage) > 100) errs.pourcentage = "Doit être entre 0 et 100.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    const newPct = Number(pourcentage);

    let finalEquipementId = equipementId;

    if (equipementMode === "existing") {
      const currentEquipement = equipements.find((e) => e.id === equipementId);
      if (currentEquipement && newPct < currentEquipement.pourcentage_global && !warning) {
        setWarning(
          `⚠️ Vous descendez de ${currentEquipement.pourcentage_global}% à ${newPct}%. Cliquez à nouveau sur "Enregistrer" pour confirmer, ou modifiez la valeur.`
        );
        return;
      }
    }
    setWarning("");
    setSaving(true);

    if (equipementMode === "new") {
      const { data: newEq, error: newEqError } = await supabase
        .from("equipements")
        .insert({
          client_name: newClientName.trim(),
          type_equipement: newTypeEquipement.trim(),
          reference: newReference.trim() || null,
          owner_id: user.id,
        })
        .select()
        .single();
      if (newEqError || !newEq) {
        setSaving(false);
        setErrors({ newClientName: "Erreur lors de la création de l'équipement." });
        return;
      }
      finalEquipementId = newEq.id;
    }

    let photoUrl: string | null = null;
    if (photoFile) {
      const fileName = `${user.id}/${Date.now()}_${photoFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("journal-photos")
        .upload(fileName, photoFile);
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from("journal-photos").getPublicUrl(uploadData.path);
        photoUrl = urlData.publicUrl;
      }
    }

    await supabase.from("journal_passages").insert({
      owner_id: user.id,
      equipement_id: finalEquipementId,
      atelier_id: atelierId,
      technicien_id: technicienId || null,
      pourcentage: newPct,
      commentaire: commentaire.trim() || null,
      photo_url: photoUrl,
    });

    // Statut automatique : en_attente -> en_reparation dès la 1ère observation,
    // puis -> termine dès que le pourcentage atteint 100%. "Livré" reste une
    // action manuelle distincte (le client doit être réellement venu le
    // récupérer, ça ne se déduit pas automatiquement du %).
    const nouveauStatut = newPct >= 100 ? "termine" : "en_reparation";
    await supabase.from("equipements").update({ pourcentage_global: newPct, statut: nouveauStatut }).eq("id", finalEquipementId);

    setEquipementMode("existing");
    setEquipementId("");
    setNewClientName("");
    setNewTypeEquipement("");
    setNewReference("");
    setAtelierId("");
    setTechnicienId("");
    setPourcentage("");
    setCommentaire("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setErrors({});
    setSaving(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Journal / Tournée</h1>
        <p className="text-sm text-slate-500">Enregistrez ce que vous observez à chaque passage en atelier.</p>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-slate-700 text-sm">Nouvelle observation</h2>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setEquipementMode("existing"); setErrors({}); }}
            className={`text-xs font-medium rounded-lg px-3 py-1.5 ${equipementMode === "existing" ? "bg-amber-500 text-neutral-900" : "bg-slate-100 text-slate-600"}`}
          >
            Équipement existant
          </button>
          <button
            type="button"
            onClick={() => { setEquipementMode("new"); setErrors({}); }}
            className={`flex items-center gap-1 text-xs font-medium rounded-lg px-3 py-1.5 ${equipementMode === "new" ? "bg-amber-500 text-neutral-900" : "bg-slate-100 text-slate-600"}`}
          >
            <Plus size={12} />
            Nouvel équipement
          </button>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {equipementMode === "existing" ? (
            <div className="flex-1 min-w-[220px]">
              <select
                value={equipementId}
                onChange={(e) => { setEquipementId(e.target.value); setErrors((p) => ({ ...p, equipementId: "" })); }}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.equipementId ? "border-red-400" : "border-slate-200"}`}
              >
                <option value="">Équipement</option>
                {equipements.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.client_name} — {eq.type_equipement} ({eq.pourcentage_global}%)
                  </option>
                ))}
              </select>
              {errors.equipementId && <p className="text-xs text-red-600 mt-1">{errors.equipementId}</p>}
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-[140px]">
                <input
                  placeholder="Nom du client"
                  value={newClientName}
                  onChange={(e) => { setNewClientName(e.target.value); setErrors((p) => ({ ...p, newClientName: "" })); }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.newClientName ? "border-red-400" : "border-slate-200"}`}
                />
                {errors.newClientName && <p className="text-xs text-red-600 mt-1">{errors.newClientName}</p>}
              </div>
              <div className="flex-1 min-w-[140px]">
                <input
                  placeholder="Type d'équipement"
                  value={newTypeEquipement}
                  onChange={(e) => { setNewTypeEquipement(e.target.value); setErrors((p) => ({ ...p, newTypeEquipement: "" })); }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.newTypeEquipement ? "border-red-400" : "border-slate-200"}`}
                />
                {errors.newTypeEquipement && <p className="text-xs text-red-600 mt-1">{errors.newTypeEquipement}</p>}
              </div>
              <input
                placeholder="Référence (optionnel)"
                value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                className="flex-1 min-w-[140px] border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </>
          )}

          <div className="min-w-[160px]">
            <select
              value={atelierId}
              onChange={(e) => { setAtelierId(e.target.value); setErrors((p) => ({ ...p, atelierId: "" })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.atelierId ? "border-red-400" : "border-slate-200"}`}
            >
              <option value="">Atelier</option>
              {ateliers.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.atelierId && <p className="text-xs text-red-600 mt-1">{errors.atelierId}</p>}
          </div>

          <select value={technicienId} onChange={(e) => setTechnicienId(e.target.value)} className="min-w-[150px] border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Technicien</option>
            {techniciens.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>

          <div className="w-28">
            <input
              type="number"
              min={0}
              max={100}
              placeholder="%"
              value={pourcentage}
              onChange={(e) => { setPourcentage(e.target.value); setErrors((p) => ({ ...p, pourcentage: "" })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.pourcentage ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.pourcentage && <p className="text-xs text-red-600 mt-1">{errors.pourcentage}</p>}
          </div>

          <input
            placeholder="Commentaire (optionnel)"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 whitespace-nowrap">
            <Camera size={16} />
            Photo
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </label>

          <button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 whitespace-nowrap">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>

        {photoPreview && (
          <div className="relative w-24">
            <img src={photoPreview} alt="Aperçu" className="w-24 h-24 object-cover rounded-lg" />
            <button
              onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
              className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow"
            >
              <X size={14} className="text-red-500" />
            </button>
          </div>
        )}

        {warning && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{warning}</p>}
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-700 text-sm mb-3">Dernières observations</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : passages.length === 0 ? (
          <div className="text-center py-8">
            <ClipboardList size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Aucune observation pour l'instant.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {passages.map((p) => (
              <div key={p.id} className="py-3 flex items-start gap-3">
                {p.photo_url && (
                  <img src={p.photo_url} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {p.equipements?.client_name} — {p.equipements?.type_equipement}
                    </p>
                    <span className="text-sm font-bold text-amber-700 shrink-0">{p.pourcentage}%</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {p.ateliers?.name} {p.techniciens?.full_name ? `· ${p.techniciens.full_name}` : ""} · {new Date(p.passage_date).toLocaleString("fr-FR")}
                  </p>
                  {p.commentaire && <p className="text-xs text-slate-600 mt-1">{p.commentaire}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
