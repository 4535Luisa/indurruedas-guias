import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Btn, Table, Th, Td } from "../components/UI";

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "asesor",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    cargarUsuarios();
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

  async function crearUsuario(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      // Crear en Supabase Auth via API
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/admin/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            email_confirm: true,
          }),
        },
      );

      const authData = await res.json();

      if (!authData.id) {
        // Usar signup normal
        const { data: signupData, error: signupError } =
          await supabase.auth.admin?.createUser({
            email: form.email,
            password: form.password,
            email_confirm: true,
          });
        if (signupError) throw new Error(signupError.message);
      }

      // Obtener el ID del usuario recién creado
      const { data: authUser } = await supabase
        .from("usuarios")
        .select("id")
        .eq("email", form.email)
        .single();

      // Si no existe en public.usuarios, insertarlo
      if (!authUser) {
        // Buscar en auth.users
        const userId = authData.id;
        if (userId) {
          await supabase.from("usuarios").insert({
            id: userId,
            email: form.email,
            nombre: form.nombre,
            rol: form.rol,
            activo: true,
          });
        }
      }

      setMsg({
        tipo: "ok",
        texto: `Usuario ${form.nombre} creado. Debe ejecutar el SQL de vinculación en Supabase.`,
      });
      setForm({ nombre: "", email: "", password: "", rol: "asesor" });
      setCreando(false);
      cargarUsuarios();
    } catch (err) {
      setMsg({ tipo: "error", texto: "Error: " + err.message });
    }
    setSaving(false);
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

  async function cambiarContrasena(email) {
    const nueva = prompt("Nueva contraseña (mínimo 6 caracteres):");
    if (!nueva || nueva.length < 6) return;
    const { error } = await supabase.auth.admin?.updateUserById;
    // Mostrar instrucción SQL
    setMsg({
      tipo: "ok",
      texto: `Para cambiar la contraseña ve a Supabase → Authentication → Users → busca ${email} → "Send password recovery"`,
    });
  }

  const sqlVinculacion = form.email
    ? `INSERT INTO public.usuarios (id, email, nombre, rol)\nSELECT id, email, '${form.nombre}', '${form.rol}'\nFROM auth.users WHERE email = '${form.email}';`
    : "";

  return (
    <div>
      <PageHeader
        title="Gestión de usuarios"
        subtitle={`${usuarios.length} usuarios registrados`}
      >
        <Btn
          variant="primary"
          onClick={() => {
            setCreando(true);
            setMsg(null);
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
                  Nombre completo
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
                  Correo
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
                  Contraseña
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
                  Rol
                </label>
                <select
                  value={form.rol}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rol: e.target.value }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="asesor">Asesor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>

            {/* Instrucciones SQL */}
            <div
              style={{
                background: "var(--blk3)",
                border: "1px solid var(--blk4)",
                borderRadius: "6px",
                padding: "10px 12px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                Después de crear, ejecuta esto en Supabase SQL Editor:
              </div>
              <pre
                style={{
                  fontSize: "11px",
                  color: "var(--m)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "pre-wrap",
                  userSelect: "all",
                }}
              >
                {`INSERT INTO public.usuarios (id, email, nombre, rol)
SELECT id, email, '${form.nombre || "NOMBRE"}', '${form.rol}'
FROM auth.users WHERE email = '${form.email || "correo@indurruedas.com"}';`}
              </pre>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <Btn variant="primary" disabled={saving}>
                {saving ? "Creando..." : "Crear en Supabase Auth"}
              </Btn>
              <Btn onClick={() => setCreando(false)}>Cancelar</Btn>
            </div>
          </form>
        </div>
      )}

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
              {usuarios.map((u) => (
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
                        background:
                          u.rol === "admin" ? "var(--m-dim)" : "var(--blk3)",
                        color: u.rol === "admin" ? "var(--m)" : "var(--gray)",
                        border: `1px solid ${u.rol === "admin" ? "var(--m-dim2)" : "var(--blk5)"}`,
                      }}
                    >
                      {u.rol === "admin" ? "Admin" : "Asesor"}
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
                    <div style={{ display: "flex", gap: "6px" }}>
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
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
