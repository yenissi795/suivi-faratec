import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Home, Package, Users, ClipboardList, FileBarChart, LogOut, Menu, X, Factory, Gauge, ArrowLeft,
} from "lucide-react";
import logo from "../assets/logo-faratec.png";

const links = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/dashboard", label: "Tableau de bord", icon: Gauge },
  { to: "/equipements", label: "Équipements", icon: Package },
  { to: "/journal", label: "Journal / Tournée", icon: ClipboardList },
  { to: "/ateliers", label: "Ateliers", icon: Factory },
  { to: "/techniciens", label: "Techniciens", icon: Users },
  { to: "/rapports", label: "Rapports", icon: FileBarChart },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="hidden md:flex md:w-60 flex-col bg-neutral-900 text-white border-r-2 border-amber-500">
        <div className="px-5 py-5 border-b border-white/10">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src={logo} alt="FARATEC" className="w-9 h-9 rounded-full bg-white p-0.5" />
            <span className="text-base font-bold leading-tight text-left">Suivi<br />FARATEC</span>
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-amber-500 text-neutral-900 font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/10 space-y-2">
          <p className="text-xs text-white/50 px-3 truncate">{user?.email}</p>
          <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-white/5">
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-neutral-900 text-white flex flex-col border-r-2 border-amber-500">
            <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <img src={logo} alt="FARATEC" className="w-9 h-9 rounded-full bg-white p-0.5" />
                <span className="text-base font-bold leading-tight">Suivi FARATEC</span>
              </span>
              <button onClick={() => setMobileOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {links.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? "bg-amber-500 text-neutral-900 font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="px-3 py-4 border-t border-white/10 space-y-2">
              <p className="text-xs text-white/50 px-3 truncate">{user?.email}</p>
              <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-white/5">
                <LogOut size={16} />
                Déconnexion
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-neutral-900 border-b-2 border-amber-500 px-4 py-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-white">
            {location.pathname !== "/" && (
              <button
                onClick={() => navigate(-1)}
                className="p-1 -ml-1 text-amber-500 hover:opacity-70 transition-opacity"
                aria-label="Retour"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <img src={logo} alt="FARATEC" className="w-7 h-7 rounded-full bg-white p-0.5" />
            <span className="text-base font-bold">Suivi FARATEC</span>
          </span>
          <button onClick={() => setMobileOpen(true)}>
            <Menu size={22} className="text-amber-500" />
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}