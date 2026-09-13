import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, Plus, ChevronDown, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
  sublabel?: string; // ex: code (DEM, BOB)
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  error?: boolean;
  hasOtherOption?: boolean; // Affiche "+ Autre (créer)"
  otherLabel?: string; // Label du bouton "+ Autre"
  onOtherCreate?: (newValue: string) => Promise<void> | void; // Callback quand on crée un nouveau
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "-- Sélectionner --",
  searchPlaceholder = "Rechercher...",
  emptyMessage = "Aucun résultat",
  disabled = false,
  error = false,
  hasOtherOption = false,
  otherLabel = "+ Autre (créer)",
  onOtherCreate,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreateField, setShowCreateField] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setShowCreateField(false);
        setNewValue("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fermer avec Échap
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        setSearch("");
        setShowCreateField(false);
        setNewValue("");
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Filtrer les options
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const s = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(s) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(s))
    );
  }, [options, search]);

  const selectedOption = options.find((o) => o.value === value);

  const handleCreate = async () => {
    if (!newValue.trim() || !onOtherCreate) return;
    setCreating(true);
    await onOtherCreate(newValue.trim());
    setCreating(false);
    setShowCreateField(false);
    setNewValue("");
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bouton principal */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full text-left border rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2 transition ${
          error
            ? "border-red-400 bg-red-50/30"
            : open
            ? "border-amber-500 ring-2 ring-amber-200"
            : "border-slate-200 hover:border-slate-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={selectedOption ? "text-slate-800" : "text-slate-400 truncate"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
          {/* Barre de recherche */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Liste des options */}
          <div className="max-h-64 overflow-y-auto">
            {/* Option "aucune" */}
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setSearch("");
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition flex items-center justify-between ${
                !value ? "bg-amber-50 text-amber-800 font-medium" : "text-slate-500"
              }`}
            >
              <span className="italic">-- Aucune --</span>
              {!value && <Check size={14} className="text-amber-600" />}
            </button>

            {/* Options filtrées */}
            {filteredOptions.length === 0 && !hasOtherOption ? (
              <p className="text-xs text-slate-400 p-3 text-center">{emptyMessage}</p>
            ) : (
              filteredOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition flex items-center justify-between gap-2 ${
                    o.value === value ? "bg-amber-50 text-amber-800 font-medium" : "text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {o.sublabel && (
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                        {o.sublabel}
                      </span>
                    )}
                    <span className="truncate">{o.label}</span>
                  </div>
                  {o.value === value && <Check size={14} className="text-amber-600 shrink-0" />}
                </button>
              ))
            )}

            {/* Bouton "+ Autre" */}
            {hasOtherOption && !showCreateField && (
              <button
                type="button"
                onClick={() => setShowCreateField(true)}
                className="w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 transition flex items-center gap-2 border-t border-slate-100 font-medium"
              >
                <Plus size={14} />
                {otherLabel}
              </button>
            )}

            {/* Champ de création */}
            {hasOtherOption && showCreateField && (
              <div className="p-2 border-t border-slate-100 bg-amber-50/50 space-y-2">
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Nom du nouveau..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setShowCreateField(false);
                      setNewValue("");
                    }
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex gap-1 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateField(false);
                      setNewValue("");
                    }}
                    className="px-2 py-1 text-xs text-slate-600 hover:bg-white rounded"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newValue.trim() || creating}
                    className="px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded font-semibold disabled:opacity-50"
                  >
                    {creating ? "..." : "Créer"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}