import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// --- IMPORTS DES PAGES ---
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import EquipementsPage from "./pages/EquipementsPage";
import JournalPage from "./pages/JournalPage";
import AteliersPage from "./pages/AteliersPage";
import OperateursPage from "./pages/OperateursPage";
import TempsOperateursPage from "./pages/TempsOperateursPage";
import CoutsPage from "./pages/CoutsPage";
import VueClientPage from "./pages/VueClientPage";
import OptimisationPage from "./pages/OptimisationPage";
import HomePage from "./pages/HomePage";
import RapportsPage from "./pages/RapportsPage";
import ParametresPage from "./pages/ParametresPage";

// --- IMPORT DU LAYOUT ---
import AppLayout from "./components/AppLayout";

export default function App() {
  const { user, loading } = useAuth();

  // 1. Pendant le chargement initial → écran de chargement
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3 font-medium">Chargement...</p>
        </div>
      </div>
    );
  }

  // 2. Si l'utilisateur n'est pas connecté → écran de login
  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // 3. Si l'utilisateur est connecté → application normale
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/equipements" element={<EquipementsPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/ateliers" element={<AteliersPage />} />
        <Route path="/operateurs" element={<OperateursPage />} />
        <Route path="/temps-operateurs" element={<TempsOperateursPage />} />
        <Route path="/couts" element={<CoutsPage />} />
        <Route path="/vue-client" element={<VueClientPage />} />
        <Route path="/optimisation" element={<OptimisationPage />} />
        <Route path="/rapports" element={<RapportsPage />} />
        <Route path="/parametres" element={<ParametresPage />} />
      </Route>

      {/* Si connecté et va sur /auth → redirection vers l'accueil */}
      <Route path="/auth" element={<Navigate to="/" replace />} />

      {/* Toute route inconnue → redirection vers l'accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}