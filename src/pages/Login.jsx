import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, perfil } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await login(email, password);
    if (error) {
      setError("Correo o contraseña incorrectos");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--blk)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "340px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <img
            src="/logo-macho.png"
            alt="MACHO"
            style={{
              height: "36px",
              objectFit: "contain",
              margin: "0 auto 14px",
              display: "block",
            }}
          />
          <h1
            style={{
              fontSize: "20px",
              fontWeight: "500",
              color: "var(--wht)",
              marginBottom: "4px",
            }}
          >
            Indurruedas SAS
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
            }}
          >
            <img
              src="/icon-envios.svg"
              alt=""
              style={{ width: "14px", height: "14px", opacity: 0.5 }}
            />
            Sistema de guías de envío
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                color: "var(--gray)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: "6px",
              }}
            >
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@indurruedas.com"
              required
              style={{ width: "100%", fontSize: "13px" }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                color: "var(--gray)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: "6px",
              }}
            >
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: "100%", fontSize: "13px" }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#2a0000",
                border: "1px solid #440000",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                color: "#FF5555",
                marginBottom: "14px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px",
              background: loading ? "var(--blk4)" : "var(--m)",
              color: loading ? "var(--gray)" : "var(--blk)",
              border: "none",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: "500",
              fontFamily: "var(--font-body)",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: ".02em",
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            fontSize: "10px",
            color: "var(--gray)",
            marginTop: "16px",
          }}
        >
          macho.com.co — uso interno
        </p>
      </div>
    </div>
  );
}
