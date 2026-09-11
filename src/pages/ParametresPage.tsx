import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Settings, RefreshCw, AlertTriangle, Trash2, Loader2, Check,
  Package, ClipboardList, Users, Factory, Lock, Database
} from "lucide-react";

interface Stats {
  equipements: number;
  passages: number;
  tournees: number;
  operateurs: number;
  ateliers: number;
  types_equipement: number;
  types_travaux: number;
}

export default function ParametresPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ equipements: 0, passages: 0, tournees: 0, operateurs: 0, ateliers: 0, types_equipement: 0, types_travaux: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [resetMode, setResetMode] = useState<"partiel" | "complet" | null>(null);
  const [confirmationStep, setConfirmationStep] = useState(1);
  const [understood, setUnderstood] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [, setResetRunning] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const loadStats = async () => {
    setRefreshing(true);
    const [eqRes, passRes, tourRes, opRes, atRes, teRes, ttRes] = await Promise.all([
      supabase.from("equipements").select("*", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("journal_passages").select("*", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("tournees").select("*", { count: "exact", head: true }),
      supabase.from("operateurs").select("*", { count: "exact", head: true }),
      supabase.from("ateliers").select("*", { count: "exact", head: true }),
      supabase.from("types_equipement").select("*", { count: "exact", head: true }),
      supabase.from("types_travaux").select("*", { count: "exact", head: true }),
    ]);
    setStats({
      equipements: eqRes.count || 0,
      passages: passRes.count || 0,
      tournees: tourRes.count || 0,
      operateurs: opRes.count || 0,
      ateliers: atRes.count || 0,
      types_equipement: teRes.count || 0,
      types_travaux: ttRes.count || 0,
    });
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadStats(); }, []);

  const openReset = (mode: "partiel" | "complet") => {
    setResetMode(mode);
    setConfirmationStep(1);
    setUnderstood(false);
    setCodeInput("");
    setResetDone(false);
  };

  const closeReset = () => {
    setResetMode(null);
    setConfirmationStep(1);
    setUnderstood(false);
    setCodeInput("");
    setResetDone(false);
  };

  const getExpectedCode = () => {
    if (resetMode === "partiel") return "EFFACER-MES-DONNEES";
    if (resetMode === "complet") return "FARATEC-RESET-TOTAL";
    return "";
  };

  const handleReset = async () => {
    if (!resetMode) return;
    if (codeInput.trim() !== getExpectedCode()) return;
    if (!understood) return;

    setResetRunning(true);
    setConfirmationStep(3);

    const fnName = resetMode === "partiel" ? "reset_travail" : "reset_complet";
    const { error } = await supabase.rpc(fnName);

    if (error) {
      alert("Erreur lors de la réinitialisation : " + error.message);
      setResetRunning(false);
      setConfirmationStep(2);
      return;
    }

    setResetRunning(false);
    setResetDone(true);
    setConfirmationStep(4);
    loadStats();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings size={20} className="text-amber-600" />
            Paramètres
          </h1>
          <p className="text-sm text-slate-500">Configuration et gestion de l'application.</p>
        </div>
        <button
          onClick={loadStats}
          disabled={refreshing}
          className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-700 text-sm mb-4 flex items-center gap-2">
          <Database size={16} className="text-amber-600" />
          Informations sur la base de données
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-amber-500" size={24} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-amber-500">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                <Package size={12} /> Équipements
              </div>
              <p className="text-2xl font-bold text-slate-800">{stats.equipements}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-blue-500">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                <ClipboardList size={12} /> Passages
              </div>
              <p className="text-2xl font-bold text-slate-800">{stats.passages}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-violet-500">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                <RefreshCw size={12} /> Tournées
              </div>
              <p className="text-2xl font-bold text-slate-800">{stats.tournees}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-green-500">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                <Users size={12} /> Opérateurs
              </div>
              <p className="text-2xl font-bold text-slate-800">{stats.operateurs}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-pink-500">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                <Factory size={12} /> Ateliers
              </div>
              <p className="text-2xl font-bold text-slate-800">{stats.ateliers}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-cyan-500">
              <div className="text-slate-500 text-xs mb-1">Types équipement</div>
              <p className="text-2xl font-bold text-slate-800">{stats.types_equipement}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-orange-500">
              <div className="text-slate-500 text-xs mb-1">Types travaux</div>
              <p className="text-2xl font-bold text-slate-800">{stats.types_travaux}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-l-4 border-slate-400">
              <div className="text-slate-500 text-xs mb-1">Utilisateur</div>
              <p className="text-xs font-medium text-slate-700 truncate">{user?.email}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm border-2 border-red-200">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} className="text-red-500" />
          <h2 className="font-bold text-red-700 text-sm">Zone de danger</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Les actions ci-dessous suppriment définitivement des données. À utiliser <strong>uniquement</strong> avant de démarrer une utilisation réelle de l'application. <strong>Aucune donnée ne peut être récupérée après suppression.</strong>
        </p>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
            <div>
              <p className="font-semibold text-slate-800 text-sm">🧹 Effacer mes données de travail</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Supprime vos équipements, passages, tournées, interventions, opérateurs personnels et ateliers personnels. <strong>Garde</strong> les listes de référence.
              </p>
            </div>
            <button
              onClick={() => openReset("partiel")}
              className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap transition"
            >
              <Trash2 size={12} /> Effacer mes données
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-red-300 bg-red-50">
            <div>
              <p className="font-semibold text-red-800 text-sm">🔥 Réinitialisation complète</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Supprime <strong>TOUTES</strong> les données de travail (de tous les utilisateurs). <strong>Garde</strong> uniquement les listes de référence. L'application revient à son état d'installation.
              </p>
            </div>
            <button
              onClick={() => openReset("complet")}
              className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap transition"
            >
              <Trash2 size={12} /> Réinitialiser tout
            </button>
          </div>
        </div>
      </div>

      {resetMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={confirmationStep < 3 ? closeReset : undefined} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {confirmationStep === 1 && (
              <>
                <div className="p-5 border-b border-slate-100 bg-red-50">
                  <h3 className="font-bold text-red-700 flex items-center gap-2">
                    <AlertTriangle size={18} /> Attention — Action irréversible
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-sm text-slate-700">Cette action va <strong>définitivement supprimer</strong> :</p>
                  <ul className="text-sm text-slate-600 space-y-1 pl-4">
                    <li>• <strong>{stats.equipements}</strong> équipements</li>
                    <li>• <strong>{stats.passages}</strong> passages</li>
                    <li>• <strong>{stats.tournees}</strong> tournées</li>
                  </ul>
                  <p className="text-sm font-semibold text-red-600">⚠️ Ces données ne pourront PAS être récupérées.</p>
                </div>
                <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={closeReset} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">Annuler</button>
                  <button onClick={() => setConfirmationStep(2)} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">Continuer →</button>
                </div>
              </>
            )}

            {confirmationStep === 2 && (
              <>
                <div className="p-5 border-b border-slate-100 bg-red-50">
                  <h3 className="font-bold text-red-700 flex items-center gap-2">
                    <Lock size={18} /> Confirmation finale
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                    <span className="text-xs text-slate-700">Je comprends que cette action est <strong>irréversible</strong> et que toutes les données seront <strong>définitivement perdues</strong>.</span>
                  </label>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-2">
                      Tapez <code className="bg-slate-100 px-1.5 py-0.5 rounded text-red-600 font-mono text-[11px]">{getExpectedCode()}</code> pour confirmer :
                    </label>
                    <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Tapez le code ici..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none font-mono" />
                  </div>
                </div>
                <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={closeReset} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">Annuler</button>
                  <button onClick={handleReset} disabled={!understood || codeInput.trim() !== getExpectedCode()} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                    <Trash2 size={14} /> Supprimer définitivement
                  </button>
                </div>
              </>
            )}

            {confirmationStep === 3 && (
              <>
                <div className="p-5 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Loader2 className="animate-spin" size={18} /> Suppression en cours...
                  </h3>
                </div>
                <div className="p-8 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-red-500" size={32} />
                  <p className="text-sm text-slate-600 text-center">Suppression des données en cours.<br />Ne fermez pas cette fenêtre.</p>
                </div>
              </>
            )}

            {confirmationStep === 4 && resetDone && (
              <>
                <div className="p-5 border-b border-slate-100 bg-green-50">
                  <h3 className="font-bold text-green-700 flex items-center gap-2">
                    <Check size={18} /> Réinitialisation terminée
                  </h3>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-700">Les données ont été supprimées avec succès. L'application est prête pour une nouvelle utilisation.</p>
                </div>
                <div className="p-5 border-t border-slate-100 flex justify-end">
                  <button onClick={closeReset} className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">Fermer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}