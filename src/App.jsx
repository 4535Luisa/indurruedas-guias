import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Guias from "./pages/Guias";
import Clientes from "./pages/Clientes";
import AsesorGuias from "./pages/AsesorGuias";
import Layout from "./components/Layout";

function Loading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "var(--m)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        letterSpacing: ".1em",
      }}
    >
      CARGANDO...
    </div>
  );
}

export default function App() {
  const { user, perfil, loading } = useAuth();

  if (loading) return <Loading />;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!perfil) return <Loading />;

  if (perfil.rol === "admin") {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/guias" element={<Guias />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/mis-guias" element={<AsesorGuias />} />
      <Route path="*" element={<Navigate to="/mis-guias" replace />} />
    </Routes>
  );
}
