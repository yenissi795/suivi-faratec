import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo-faratec.png";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password) {
      setError("Tous les champs sont obligatoires.");
      return;
    }
    setLoading(true);
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-sm bg-neutral-800 rounded-xl p-6 space-y-4 border-t-4 border-amber-500">
        <div className="flex flex-col items-center gap-2 mb-2">
          <img src={logo} alt="FARATEC" className="w-16 h-16 rounded-full bg-white p-1" />
          <h1 className="text-lg font-bold text-white">Suivi-FARATEC</h1>
          <p className="text-xs text-neutral-400">Suivi des travaux d'atelier</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 text-sm font-medium rounded-lg py-2 ${mode === "signin" ? "bg-amber-500 text-neutral-900" : "bg-neutral-700 text-neutral-300"}`}
          >
            Connexion
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 text-sm font-medium rounded-lg py-2 ${mode === "signup" ? "bg-amber-500 text-neutral-900" : "bg-neutral-700 text-neutral-300"}`}
          >
            Inscription
          </button>
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-neutral-700 text-white placeholder-neutral-400 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-neutral-700 text-white placeholder-neutral-400 rounded-lg px-3 py-2 text-sm"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-900 rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Patientez..." : mode === "signin" ? "Se connecter" : "Créer le compte"}
        </button>
      </div>
    </div>
  );
}