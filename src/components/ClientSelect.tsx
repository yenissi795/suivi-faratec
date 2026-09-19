import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import SearchableSelect from "./SearchableSelect";

interface Client {
  id: string;
  name: string;
}

interface ClientSelectProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
}

export default function ClientSelect({
  value,
  onChange,
  error = false,
  placeholder = "Selectionner un client...",
}: ClientSelectProps) {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      setClients((data as Client[]) || []);
    };
    load();
  }, []);

  const options = useMemo(
    () => clients.map((c) => ({ value: c.name, label: c.name })),
    [clients]
  );

  const handleCreateClient = async (clientName: string) => {
    if (!user || !clientName.trim()) return;
    const name = clientName.trim();

    // Verifier si existe deja (insensible a la casse)
    const existing = clients.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      onChange(existing.name);
      return;
    }

    const { data, error: err } = await supabase
      .from("clients")
      .insert({ name, owner_id: user.id })
      .select()
      .single();

    if (err) {
      console.error("Erreur creation client:", err);
      // En cas d'erreur, on met quand meme la valeur dans le champ
      onChange(name);
      return;
    }

    if (data) {
      setClients((prev) =>
        [...prev, data as Client].sort((a, b) => a.name.localeCompare(b.name))
      );
      onChange((data as Client).name);
    }
  };

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Rechercher un client..."
      emptyMessage="Aucun client trouve"
      error={error}
      hasOtherOption={true}
      otherLabel="+ Nouveau client"
      onOtherCreate={handleCreateClient}
    />
  );
}