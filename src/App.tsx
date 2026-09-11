import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// --- IMPORTS DES PAGES ---
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import EquipementsPage from "./pages/EquipementsPage";
import JournalPage from "./pages/JournalPage";
import AteliersPage from "./pages/AteliersPage";
import TechniciensPage from "./pages/TechniciensPage"; // <-- AJOUT
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
        <Route path="/techniciens" element={<TechniciensPage />} /> {/* <-- AJOUT */}
        <Route path="/rapports" element={<RapportsPage />} />
      </Route>
      
      {/* Si connecté, /auth renvoie vers l'accueil */}
      <Route path="/auth" element={<Navigate to="/" replace />} />
      
      {/* Toute route inconnue renvoie à l'accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}