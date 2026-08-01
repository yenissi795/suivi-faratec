import { Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage from "./pages/AuthPage";
import AppLayout from "./components/AppLayout";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import EquipementsPage from "./pages/EquipementsPage";
import JournalPage from "./pages/JournalPage";
import AteliersPage from "./pages/AteliersPage";
import TechniciensPage from "./pages/TechniciensPage";
import RapportsPage from "./pages/RapportsPage";

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <AuthPage />;

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="equipements" element={<EquipementsPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="ateliers" element={<AteliersPage />} />
        <Route path="techniciens" element={<TechniciensPage />} />
        <Route path="rapports" element={<RapportsPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
