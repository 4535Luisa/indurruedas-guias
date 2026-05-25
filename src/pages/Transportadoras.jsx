import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Btn, Table, Th, Td } from "../components/UI";

export default function Transportadoras() {
  const [transportadoras, setTransportadoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({
    nombre: "",
    nit: "",
    contacto: "",
    celular: "",
  });
  const [crearUsuario, setCrearUsuario] = useState(false);
  const [formUsuario, setFormUsuario] = useState({ email: "", password: "" });

  useEffect(() => {
    cargarTransportadoras();
  }, []);

  async function cargarTransportadoras() {
    setLoading(true);
    const { data } = await supabase
      .from("transportadoras")
      .select(`*, usuarios(id, nombre, email, activo)`)
      .order("nombre");
    setTransportadoras(data || []);
    setLoading(false);
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      setMsg({ tipo: "error", texto: "El nombre es requerido" });
      return;
    }
    setSaving(true);
    setMsg(null);

    try {
      let transId = editando?.id;

      if (editando) {
        await supabase
          .from("transportadoras")
          .update({
            nombre: form.nombre.trim(),
            nit: form.nit.trim(),
            contacto: form.contacto.trim(),
            celular: form.celular.trim(),
          })
          .eq("id", editando.id);
        setMsg({
          tipo: "ok",
          texto: `${form.nombre} actualizada correctamente`,
        });
      } else {
        const { data, error } = await supabase
          .from("transportadoras")
          .insert({
            nombre: form.nombre.trim(),
            nit: form.nit.trim(),
            contacto: form.contacto.trim(),
            celular: form.celular.trim(),
            activa: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        transId = data.id;

        // Crear usuario si se solicitó
        if (crearUsuario && formUsuario.email && formUsuario.password) {
          const { data: authData, error: authError } =
            await supabase.auth.admin?.createUser({
              email: formUsuario.email,
              password: formUsuario.password,
              email_confirm: true,
            });

          if (!authError && authData?.user) {
            await supabase.from("usuarios").insert({
              id: authData.user.id,
              email: formUsuario.email,
              nombre: form.nombre.trim(),
              rol: "transportador",
              transportadora_id: transId,
              activo: true,
            });
            setMsg({
              tipo: "ok",
              texto: `${form.nombre} creada con acceso para ${formUsuario.email}`,
            });
          } else {
            // Si admin API no está disponible, mostrar SQL
            setMsg({
              tipo: "ok",
              texto: `Transportadora creada. Para crear el usuario ejecuta en Supabase → Authentication → Add user: email: ${formUsuario.email}`,
            });
          }
        } else {
          setMsg({ tipo: "ok", texto: `${form.nombre} creada correctamente` });
        }
      }

      setCreando(false);
      setEditando(null);
      setForm({ nombre: "", nit: "", contacto: "", celular: "" });
      setFormUsuario({ email: "", password: "" });
      setCrearUsuario(false);
      cargarTransportadoras();
    } catch (err) {
      setMsg({ tipo: "error", texto: "Error: " + err.message });
    }
    setSaving(false);
  }

  async function toggleActiva(trans) {
    await supabase
      .from("transportadoras")
      .update({ activa: !trans.activa })
      .eq("id", trans.id);
    setTransportadoras((prev) =>
      prev.map((t) => (t.id === trans.id ? { ...t, activa: !t.activa } : t)),
    );
  }

  function iniciarEdicion(trans) {
    setEditando(trans);
    setForm({
      nombre: trans.nombre || "",
      nit: trans.nit || "",
      contacto: trans.contacto || "",
      celular: trans.celular || "",
    });
    setCreando(true);
    setMsg(null);
  }

  const sqlVincularUsuario =
    formUsuario.email && form.nombre
      ? `
INSERT INTO public.usuarios (id, email, nombre, rol, transportadora_id)
SELECT id, email, '${form.nombre}', 'transportador', 
  (SELECT id FROM public.transportadoras WHERE nombre = '${form.nombre}' LIMIT 1)
FROM auth.users WHERE email = '${formUsuario.email}';`
      : "";

  return (
    <div>
      <PageHeader
        title="Transportadoras"
        subtitle={`${transportadoras.length} registradas`}
      >
        <Btn
          onClick={() => {
            setCreando(true);
            setEditando(null);
            setForm({ nombre: "", nit: "", contacto: "", celular: "" });
            setMsg(null);
            setCrearUsuario(false);
          }}
        >
          + Nueva transportadora
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

      {/* Formulario */}
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
            {editando ? "Editar transportadora" : "Nueva transportadora"}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            {[
              {
                label: "Nombre *",
                key: "nombre",
                placeholder: "TRANSPORTADORA HUBER FRANCO S A",
              },
              { label: "NIT", key: "nit", placeholder: "900644625" },
              {
                label: "Contacto",
                key: "contacto",
                placeholder: "Nombre del encargado",
              },
              { label: "Celular", key: "celular", placeholder: "3001234567" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
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
                  {label}
                </label>
                <input
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>

          {/* Crear usuario de acceso */}
          {!editando && (
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--wht2)",
                  marginBottom: "10px",
                }}
              >
                <input
                  type="checkbox"
                  checked={crearUsuario}
                  onChange={(e) => setCrearUsuario(e.target.checked)}
                />
                Crear acceso al sistema para esta transportadora
              </label>

              {crearUsuario && (
                <div
                  style={{
                    background: "var(--blk3)",
                    borderRadius: "8px",
                    padding: "14px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
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
                      Email de acceso
                    </label>
                    <input
                      type="email"
                      value={formUsuario.email}
                      onChange={(e) =>
                        setFormUsuario((f) => ({ ...f, email: e.target.value }))
                      }
                      placeholder="transportadora@ejemplo.com"
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
                      value={formUsuario.password}
                      onChange={(e) =>
                        setFormUsuario((f) => ({
                          ...f,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      style={{ width: "100%" }}
                    />
                  </div>

                  {/* SQL de respaldo */}
                  {sqlVincularUsuario && (
                    <div
                      style={{
                        gridColumn: "1/-1",
                        background: "var(--blk2)",
                        borderRadius: "6px",
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--gray)",
                          marginBottom: "5px",
                        }}
                      >
                        Si el usuario se crea manualmente en Supabase, ejecuta
                        este SQL para vincularlo:
                      </div>
                      <pre
                        style={{
                          fontSize: "10px",
                          color: "var(--m)",
                          fontFamily: "var(--font-mono)",
                          whiteSpace: "pre-wrap",
                          userSelect: "all",
                          margin: 0,
                        }}
                      >
                        {sqlVincularUsuario}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <Btn onClick={guardar} disabled={saving}>
              {saving
                ? "Guardando..."
                : editando
                  ? "Guardar cambios"
                  : "Crear transportadora"}
            </Btn>
            <Btn
              onClick={() => {
                setCreando(false);
                setEditando(null);
                setMsg(null);
              }}
            >
              Cancelar
            </Btn>
          </div>
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
          Cargando...
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
                <Th>NIT</Th>
                <Th>Contacto</Th>
                <Th>Celular</Th>
                <Th>Usuario sistema</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {transportadoras.map((t) => (
                <tr
                  key={t.id}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--hover-bg)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <Td style={{ color: "var(--wht)", fontWeight: "500" }}>
                    {t.nombre}
                  </Td>
                  <Td
                    style={{
                      color: "var(--gray)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                    }}
                  >
                    {t.nit || "—"}
                  </Td>
                  <Td style={{ color: "var(--gray)" }}>{t.contacto || "—"}</Td>
                  <Td
                    style={{
                      color: "var(--gray)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                    }}
                  >
                    {t.celular || "—"}
                  </Td>
                  <Td>
                    {t.usuarios?.length > 0 ? (
                      <span style={{ fontSize: "11px", color: "var(--m)" }}>
                        ✓ {t.usuarios[0].email}
                      </span>
                    ) : (
                      <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                        Sin acceso
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span
                      style={{
                        fontSize: "10px",
                        color: t.activa ? "var(--m)" : "var(--danger)",
                      }}
                    >
                      {t.activa ? "● Activa" : "● Inactiva"}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => iniciarEdicion(t)}
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
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActiva(t)}
                        style={{
                          fontSize: "10px",
                          padding: "3px 8px",
                          border: `1px solid ${t.activa ? "#440000" : "#1a3300"}`,
                          borderRadius: "4px",
                          background: "transparent",
                          color: t.activa ? "var(--danger)" : "var(--m)",
                          cursor: "pointer",
                        }}
                      >
                        {t.activa ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {transportadoras.length === 0 && (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "var(--gray)",
                fontSize: "12px",
              }}
            >
              No hay transportadoras registradas
            </div>
          )}
        </div>
      )}
    </div>
  );
}
