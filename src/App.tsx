import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ParametresPage from "./pages/ParametresPage";
import TempsOperateursPage from "./pages/TempsOperateursPage";
import OptimisationPage from "./pages/OptimisationPage";

// --- IMPORTS DES PAGES ---
import VueClientPage from "./pages/VueClientPage";
import CoutsPage from "./pages/CoutsPage";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import EquipementsPage from "./pages/EquipementsPage";
import JournalPage from "./pages/JournalPage";
import AteliersPage from "./pages/AteliersPage";
import OperateursPage from "./pages/OperateursPage";
import HomePage from "./pages/HomePage";
import RapportsPage from "./pages/RapportsPage";

// --- IMPORT DU LAYOUT ---
import AppLayout from "./components/AppLayout";

export default function App() {
  const { user } = useAuth();

  // Si l'utilisateur n'est pas connecté, on affiche uniquement la page de connexion
  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // Si l'utilisateur est connecté, on affiche l'application avec votre Layout
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/equipements" element={<EquipementsPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/ateliers" element={<AteliersPage />} />
        <Route path="/operateurs" element={<OperateursPage />} />
        <Route path="/rapports" element={<RapportsPage />} />
        <Route path="/parametres" element={<ParametresPage />} />
        <Route path="/temps-operateurs" element={<TempsOperateursPage />} />
        <Route path="/vue-client" element={<VueClientPage />} />
        <Route path="/couts" element={<CoutsPage />} />
        <Route path="/optimisation" element={<OptimisationPage />} />
      </Route>
      
      {/* Si connecté, /auth renvoie vers l'accueil */}
      <Route path="/auth" element={<Navigate to="/" replace />} />
      
      {/* Toute route inconnue renvoie à l'accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}