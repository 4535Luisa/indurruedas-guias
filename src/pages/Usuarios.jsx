import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Btn, Table, Th, Td } from "../components/UI";

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [transportadoras, setTransportadoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "asesor",
    transportadora_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modalPassword, setModalPassword] = useState(null);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [cambiandoPass, setCambiandoPass] = useState(false);

  useEffect(() => {
    cargarUsuarios();
    cargarTransportadoras();
  }, []);

  async function cargarUsuarios() {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("*")
      .order("rol")
      .order("nombre");
    setUsuarios(data || []);
    setLoading(false);
  }

  async function cargarTransportadoras() {
    const { data } = await supabase
      .from("transportadoras")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre");
    setTransportadoras(data || []);
  }

  async function crearUsuario(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim() || !form.password.trim()) {
      setMsg({
        tipo: "error",
        texto: "Nombre, correo y contraseña son requeridos",
      });
      return;
    }
    if (form.password.length < 6) {
      setMsg({
        tipo: "error",
        texto: "La contraseña debe tener mínimo 6 caracteres",
      });
      return;
    }
    setSaving(true);
    setMsg(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            password: form.password,
            nombre: form.nombre.trim(),
            rol: form.rol,
            transportadora_id: form.transportadora_id || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear usuario");
      setMsg({
        tipo: "ok",
        texto: `✓ Usuario ${form.nombre} creado correctamente — puede ingresar de inmediato`,
      });
      setForm({
        nombre: "",
        email: "",
        password: "",
        rol: "asesor",
        transportadora_id: "",
      });
      setCreando(false);
      cargarUsuarios();
    } catch (err) {
      if (
        err.message.includes("already registered") ||
        err.message.includes("already exists")
      ) {
        setMsg({
          tipo: "error",
          texto: "Este correo ya tiene una cuenta registrada",
        });
      } else {
        setMsg({ tipo: "error", texto: "Error: " + err.message });
      }
    }
    setSaving(false);
  }

  async function cambiarPassword() {
    if (!nuevaPassword.trim() || nuevaPassword.length < 6) {
      setMsg({
        tipo: "error",
        texto: "La contraseña debe tener mínimo 6 caracteres",
      });
      return;
    }
    setCambiandoPass(true);
    setMsg(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cambiar-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: modalPassword.id,
            password: nuevaPassword,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar contraseña");
      setMsg({
        tipo: "ok",
        texto: `✓ Contraseña de ${modalPassword.nombre} actualizada correctamente`,
      });
      setModalPassword(null);
      setNuevaPassword("");
    } catch (err) {
      setMsg({ tipo: "error", texto: "Error: " + err.message });
    }
    setCambiandoPass(false);
  }

  async function toggleActivo(usuario) {
    await supabase
      .from("usuarios")
      .update({ activo: !usuario.activo })
      .eq("id", usuario.id);
    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, activo: !u.activo } : u)),
    );
  }

  const ROLES = {
    admin: {
      label: "Admin",
      color: "var(--m)",
      bg: "var(--m-dim)",
      border: "var(--m-dim2)",
    },
    asesor: {
      label: "Asesor",
      color: "var(--gray)",
      bg: "var(--blk3)",
      border: "var(--blk5)",
    },
    transportador: {
      label: "Transportador",
      color: "#AA88FF",
      bg: "#1a0a2e",
      border: "#3d1a66",
    },
    visualizador: {
      label: "Visualizador",
      color: "#55AAFF",
      bg: "#001a33",
      border: "#003366",
    },
  };

  return (
    <div>
      <PageHeader
        title="Gestión de usuarios"
        subtitle={`${usuarios.length} usuarios registrados`}
      >
        <Btn
          onClick={() => {
            setCreando(true);
            setMsg(null);
            setForm({
              nombre: "",
              email: "",
              password: "",
              rol: "asesor",
              transportadora_id: "",
            });
          }}
        >
          + Nuevo usuario
        </Btn>
      </PageHeader>

      {msg && (
        <div
          style={{
            background: msg.tipo === "ok" ? "#0d1f00" : "#2a0000",
            border: `1px solid ${msg.tipo === "ok" ? "#1a3300" : "#440000"}`,
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "12px",
            color: msg.tipo === "ok" ? "var(--m)" : "var(--danger)",
          }}
        >
          {msg.texto}
          <button
            onClick={() => setMsg(null)}
            style={{
              float: "right",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Formulario nuevo usuario */}
      {creando && (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "500",
              color: "var(--wht)",
              marginBottom: "16px",
            }}
          >
            Nuevo usuario
          </div>
          <form onSubmit={crearUsuario}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Nombre completo *
                </label>
                <input
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  placeholder="APELLIDO NOMBRE"
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Correo *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="nombre@indurruedas.com"
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Contraseña *
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Rol *
                </label>
                <select
                  value={form.rol}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      rol: e.target.value,
                      transportadora_id: "",
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="asesor">Asesor</option>
                  <option value="admin">Administrador</option>
                  <option value="transportador">Transportador</option>
                  <option value="visualizador">Visualizador</option>
                </select>
              </div>
              {form.rol === "transportador" && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label
                    style={{
                      fontSize: "10px",
                      color: "var(--gray)",
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Transportadora *
                  </label>
                  <select
                    value={form.transportadora_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        transportadora_id: e.target.value,
                      }))
                    }
                    style={{ width: "100%" }}
                    required
                  >
                    <option value="">— Seleccionar transportadora —</option>
                    {transportadoras.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div
              style={{
                background: "var(--blk3)",
                borderRadius: "7px",
                padding: "10px 12px",
                marginBottom: "14px",
                fontSize: "11px",
                color: "var(--gray)",
              }}
            >
              {form.rol === "asesor" &&
                "👤 Puede ver sus guías asignadas y el detalle de cada una."}
              {form.rol === "admin" && "⚙️ Acceso completo al sistema."}
              {form.rol === "transportador" &&
                "🚚 Solo ve las guías de su transportadora y puede marcarlas como entregadas."}
              {form.rol === "visualizador" &&
                "👁️ Puede ver todas las guías y estadísticas pero no puede modificar nada."}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "9px 20px",
                  background: "var(--m)",
                  color: "var(--blk)",
                  border: "none",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Creando..." : "+ Crear usuario"}
              </button>
              <Btn
                onClick={() => {
                  setCreando(false);
                  setMsg(null);
                }}
              >
                Cancelar
              </Btn>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div
          style={{
            color: "var(--m)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
          }}
        >
          Cargando usuarios...
        </div>
      ) : (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const rol = ROLES[u.rol] || ROLES.asesor;
                return (
                  <tr
                    key={u.id}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--hover-bg)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <Td style={{ color: "var(--wht)", fontWeight: "500" }}>
                      {u.nombre}
                    </Td>
                    <Td style={{ color: "var(--gray)", fontSize: "12px" }}>
                      {u.email}
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontWeight: "500",
                          background: rol.bg,
                          color: rol.color,
                          border: `1px solid ${rol.border}`,
                        }}
                      >
                        {rol.label}
                      </span>
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontSize: "10px",
                          color: u.activo ? "var(--m)" : "var(--danger)",
                        }}
                      >
                        {u.activo ? "● Activo" : "● Inactivo"}
                      </span>
                    </Td>
                    <Td>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={() => toggleActivo(u)}
                          style={{
                            fontSize: "10px",
                            padding: "3px 8px",
                            border: `1px solid ${u.activo ? "#440000" : "#1a3300"}`,
                            borderRadius: "4px",
                            background: "transparent",
                            color: u.activo ? "var(--danger)" : "var(--m)",
                            cursor: "pointer",
                          }}
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          onClick={() => {
                            setModalPassword(u);
                            setNuevaPassword("");
                          }}
                          style={{
                            fontSize: "10px",
                            padding: "3px 8px",
                            border: "1px solid var(--blk5)",
                            borderRadius: "4px",
                            background: "transparent",
                            color: "var(--gray)",
                            cursor: "pointer",
                          }}
                        >
                          Cambiar contraseña
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Modal cambiar contraseña */}
      {modalPassword && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setModalPassword(null)}
        >
          <div
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "400px",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: "500",
                color: "var(--wht)",
                marginBottom: "4px",
              }}
            >
              🔑 Cambiar contraseña
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--gray)",
                marginBottom: "20px",
              }}
            >
              {modalPassword.nombre} · {modalPassword.email}
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Nueva contraseña
              </label>
              <input
                type="password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                autoFocus
                style={{ width: "100%", fontSize: "14px", padding: "10px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={cambiarPassword}
                disabled={cambiandoPass || nuevaPassword.length < 6}
                style={{
                  flex: 1,
                  padding: "10px",
                  background:
                    nuevaPassword.length >= 6 ? "var(--m)" : "var(--blk4)",
                  color:
                    nuevaPassword.length >= 6 ? "var(--blk)" : "var(--gray)",
                  border: "none",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: nuevaPassword.length >= 6 ? "pointer" : "not-allowed",
                }}
              >
                {cambiandoPass ? "Cambiando..." : "✓ Cambiar contraseña"}
              </button>
              <button
                onClick={() => {
                  setModalPassword(null);
                  setNuevaPassword("");
                }}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  border: "1px solid var(--blk5)",
                  borderRadius: "7px",
                  color: "var(--gray)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
