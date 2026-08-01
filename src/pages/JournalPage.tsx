import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ClipboardList, Camera, X } from "lucide-react";

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

  const [equipementId, setEquipementId] = useState("");
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
    if (!equipementId) errs.equipementId = "Sélectionne un équipement.";
    if (!atelierId) errs.atelierId = "Sélectionne un atelier.";
    if (pourcentage === "") errs.pourcentage = "Le pourcentage est obligatoire.";
    else if (Number(pourcentage) < 0 || Number(pourcentage) > 100) errs.pourcentage = "Doit être entre 0 et 100.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;

    const currentEquipement = equipements.find((e) => e.id === equipementId);
    const newPct = Number(pourcentage);
    if (currentEquipement && newPct < currentEquipement.pourcentage_global) {
      setWarning(
        `⚠️ Vous descendez de ${currentEquipement.pourcentage_global}% à ${newPct}%. Cliquez à nouveau sur "Enregistrer" pour confirmer, ou modifiez la valeur.`
      );
      return;
    }
    setWarning("");
    setSaving(true);

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
      equipement_id: equipementId,
      atelier_id: atelierId,
      technicien_id: technicienId || null,
      pourcentage: newPct,
      commentaire: commentaire.trim() || null,
      photo_url: photoUrl,
    });

    // Met à jour le % global de l'équipement (dernière observation)
    await supabase.from("equipements").update({ pourcentage_global: newPct }).eq("id", equipementId);

    setEquipementId("");
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <select
              value={equipementId}
              onChange={(e) => { setEquipementId(e.target.value); setErrors((prev) => ({ ...prev, equipementId: "" })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.equipementId ? "border-red-400" : "border-slate-200"}`}
            >
              <option value="">Sélectionner un équipement</option>
              {equipements.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.client_name} — {eq.type_equipement} ({eq.pourcentage_global}%)
                </option>
              ))}
            </select>
            {errors.equipementId && <p className="text-xs text-red-600 mt-1">{errors.equipementId}</p>}
          </div>
          <div>
            <select
              value={atelierId}
              onChange={(e) => { setAtelierId(e.target.value); setErrors((prev) => ({ ...prev, atelierId: "" })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.atelierId ? "border-red-400" : "border-slate-200"}`}
            >
              <option value="">Sélectionner un atelier</option>
              {ateliers.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.atelierId && <p className="text-xs text-red-600 mt-1">{errors.atelierId}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={technicienId} onChange={(e) => setTechnicienId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Technicien (optionnel)</option>
            {techniciens.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          <div>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="Pourcentage d'avancement (%)"
              value={pourcentage}
              onChange={(e) => { setPourcentage(e.target.value); setErrors((prev) => ({ ...prev, pourcentage: "" })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.pourcentage ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.pourcentage && <p className="text-xs text-red-600 mt-1">{errors.pourcentage}</p>}
          </div>
        </div>

        <input
          placeholder="Commentaire (optionnel)"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer w-fit border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
            <Camera size={16} />
            {photoFile ? "Changer la photo" : "Ajouter une photo"}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </label>
          {photoPreview && (
            <div className="relative w-32 mt-2">
              <img src={photoPreview} alt="Aperçu" className="w-32 h-32 object-cover rounded-lg" />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow"
              >
                <X size={14} className="text-red-500" />
              </button>
            </div>
          )}
        </div>

        {warning && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{warning}</p>}

        <button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
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
