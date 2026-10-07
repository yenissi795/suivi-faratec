import { useState, useRef } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { compresserImage, genererNomFichier } from "../lib/utils";
import { supabase } from "../lib/supabase";

interface PhotoUploadMultipleProps {
  currentUrls: string[];
  onUploaded: (url: string) => void;
  onRemoved: (url: string) => void;
  maxPhotos?: number;
  bucketName?: string;
  folderName?: string;
}

export default function PhotoUploadMultiple({
  currentUrls,
  onUploaded,
  onRemoved,
  maxPhotos = 3,
  bucketName = "journal-photos",
  folderName = "equipements",
}: PhotoUploadMultipleProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (currentUrls.length >= maxPhotos) {
      setError(`Maximum ${maxPhotos} photos`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Compression
      const compressedBlob = await compresserImage(file, 2400, 2400, 0.92);

      // Upload
      const fileName = genererNomFichier(file.name);
      const filePath = `${folderName}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, compressedBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // URL publique
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      onUploaded(urlData.publicUrl);
    } catch (err: any) {
      setError(err.message || "Erreur d'upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-2">
        Photos ({currentUrls.length}/{maxPhotos})
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Photos existantes */}
        {currentUrls.map((url, i) => (
          <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onRemoved(url)}
              className="absolute top-1.5 right-1.5 bg-white hover:bg-red-50 text-red-600 rounded-full p-1.5 shadow-md transition"
              title="Supprimer"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* Bouton ajouter */}
        {currentUrls.length < maxPhotos && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-square border-2 border-dashed border-slate-300 hover:border-amber-400 hover:bg-amber-50/30 rounded-xl flex flex-col items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={24} className="text-amber-500 animate-spin" />
                <p className="text-[10px] text-slate-500">Upload...</p>
              </>
            ) : (
              <>
                <Camera size={24} className="text-slate-400" />
                <p className="text-xs font-medium text-slate-600">Ajouter</p>
                <p className="text-[10px] text-slate-400">JPG, PNG</p>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <p className="text-xs text-red-600 mt-2">⚠️ {error}</p>}
    </div>
  );
}