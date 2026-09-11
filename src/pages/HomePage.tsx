import { Link } from "react-router-dom";
import tileDashboard from "../assets/tile-dashboard.jpg";
import tileJournal from "../assets/tile-journal.jpg";
import tileEquipements from "../assets/tile-equipements.jpg";
import tileAteliers from "../assets/tile-ateliers.jpg";
import tileTechniciens from "../assets/tile-techniciens.jpg";
import tileRapports from "../assets/tile-rapports.jpg";

const modules = [
  { to: "/dashboard", label: "Tableau de bord", image: tileDashboard },
  { to: "/journal", label: "Journal / Tournée", image: tileJournal },
  { to: "/equipements", label: "Équipements", image: tileEquipements },
  { to: "/ateliers", label: "Ateliers", image: tileAteliers },
  { to: "/operateurs", label: "Opérateurs", image: tileTechniciens },
  { to: "/rapports", label: "Rapports", image: tileRapports },
];

function Tile({ to, label, image }: { to: string; label: string; image: string }) {
  return (
    <Link to={to} className="group relative aspect-square rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border-b-4 border-amber-500">
      <img
        src={image}
        alt={label}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      <span className="absolute bottom-2 left-2 right-2 text-white text-xs sm:text-sm font-semibold drop-shadow leading-tight">
        {label}
      </span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 capitalize">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h1>
        <p className="text-sm text-slate-500">Suivi des travaux d'atelier — FARATEC.</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {modules.map((m) => (
          <Tile key={m.to} to={m.to} label={m.label} image={m.image} />
        ))}
      </div>
    </div>
  );
}