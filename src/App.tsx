import { useEffect, useState } from "react";
import { getDb } from "@/db";
import { getDataPaths } from "@/platform/backup";

export default function App() {
  const [estado, setEstado] = useState("Abriendo base de datos…");
  useEffect(() => {
    getDb()
      .then(getDataPaths)
      .then((p) => setEstado(`Base de datos lista: ${p.dbPath}`))
      .catch((e) => setEstado(`Error: ${String(e)}`));
  }, []);
  return <div className="p-6">{estado}</div>;
}
