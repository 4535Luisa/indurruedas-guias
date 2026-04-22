import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PillEstado } from "../components/UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function TransportadorGuias() {
  const { perfil, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("en_transito");
  const [modalEntrega, setModalEntrega] = useState(null);
  const [modalNovedad, setModalNovedad] = useState(null);
  const [modalFoto, setModalFoto] = useState(null);
  const [fechaEntrega, setFechaEntrega] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [novedadDesc, setNovedadDesc] = useState("");
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (perfil) cargarGuias();
  }, [perfil]);

  async function cargarGuias() {
    setLoading(true);
    const { data } = await supabase
      .from("guias")
      .select(
        "id, numero_guia, factura_indurruedas, estado, estado_transportadora, fecha_guia, fecha_entrega, dias_habiles, ciudad_destino, direccion_entrega, destinatario, foto_evidencia, novedad_descripcion, transportadora_nombre, clientes(nombre)",
      )
      .eq("transportadora_id", perfil.transportadora_id)
      .order("fecha_guia", { ascending: false });
    setGuias(data || []);
    setLoading(false);
  }

  async function marcarEntregado(guia) {
    setGuardando(true);
    let fotoUrl = null;

    // Subir foto si hay
    if (fotoFile) {
      const ext = fotoFile.name.split(".").pop();
      const path = `evidencias/${guia.id}_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("evidencias")
        .upload(path, fotoFile, { upsert: true });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage
          .from("evidencias")
          .getPublicUrl(path);
        fotoUrl = urlData.publicUrl;
      }
    }

    const fechaGuia = guia.fecha_guia ? new Date(guia.fecha_guia) : new Date();
    const dias = Math.floor((new Date(fechaEntrega) - fechaGuia) / 86400000);

    await supabase
      .from("guias")
      .update({
        estado: "entregado",
        fecha_entrega: fechaEntrega,
        dias_habiles: dias,
        activa: false,
        ...(fotoUrl && { foto_evidencia: fotoUrl }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", guia.id);

    await supabase.from("historial_estados").insert({
      guia_id: guia.id,
      estado_anterior: guia.estado,
      estado_nuevo: "entregado",
      fuente: "transportador",
    });

    setModalEntrega(null);
    setFotoFile(null);
    setFotoPreview(null);
    cargarGuias();
    setGuardando(false);
  }

  async function reportarNovedad(guia) {
    if (!novedadDesc.trim()) return;
    setGuardando(true);

    await supabase
      .from("guias")
      .update({
        estado: "novedad",
        novedad_descripcion: novedadDesc,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guia.id);

    await supabase.from("historial_estados").insert({
      guia_id: guia.id,
      estado_anterior: guia.estado,
      estado_nuevo: "novedad",
      fuente: "transportador",
    });

    setModalNovedad(null);
    setNovedadDesc("");
    cargarGuias();
    setGuardando(false);
  }

  function seleccionarFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    // Si selecciona foto, abrir modal de entrega automáticamente
    if (!modalEntrega) {
      setFechaEntrega(new Date().toISOString().split("T")[0]);
    }
  }

  async function subirSoloFoto(guia) {
    if (!fotoFile) return;
    setGuardando(true);
    const ext = fotoFile.name.split(".").pop();
    const path = `evidencias/${guia.id}_${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from("evidencias")
      .upload(path, fotoFile, { upsert: true });

    if (uploadErr) {
      setGuardando(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("evidencias")
      .getPublicUrl(path);
    const fotoUrl = urlData.publicUrl;

    const fechaGuia = guia.fecha_guia ? new Date(guia.fecha_guia) : new Date();
    const dias = Math.floor((new Date(fechaEntrega) - fechaGuia) / 86400000);

    await supabase
      .from("guias")
      .update({
        estado: "entregado",
        fecha_entrega: fechaEntrega,
        dias_habiles: dias,
        activa: false,
        foto_evidencia: fotoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guia.id);

    await supabase.from("historial_estados").insert({
      guia_id: guia.id,
      estado_anterior: guia.estado,
      estado_nuevo: "entregado",
      fuente: "transportador",
    });

    setModalFoto(null);
    setFotoFile(null);
    setFotoPreview(null);
    cargarGuias();
    setGuardando(false);
  }

  const filtradas = guias.filter((g) => {
    const txt = filtroTexto.toLowerCase();
    const matchTxt =
      !txt ||
      g.factura_indurruedas?.toLowerCase().includes(txt) ||
      g.destinatario?.toLowerCase().includes(txt) ||
      g.ciudad_destino?.toLowerCase().includes(txt);
    const matchEstado = !filtroEstado || g.estado === filtroEstado;
    return matchTxt && matchEstado;
  });

  const activas = guias.filter((g) => g.estado === "en_transito").length;
  const entregadas = guias.filter((g) => g.estado === "entregado").length;
  const novedad = guias.filter((g) => g.estado === "novedad").length;
  const iniciales =
    perfil?.nombre
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("") || "TR";

  return (
    <div style={{ minHeight: "100vh", background: "var(--blk)" }}>
      {/* Header */}
      <div
        style={{
          background: "var(--blk2)",
          borderBottom: "1px solid var(--blk4)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "#AA88FF",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: "700",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            T
          </div>
          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "500",
                color: "var(--wht)",
              }}
            >
              Mis entregas
            </div>
            <div style={{ fontSize: "10px", color: "var(--gray)" }}>
              {perfil?.nombre}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={toggleTheme}
            style={{
              background: "transparent",
              border: "1px solid var(--blk5)",
              borderRadius: "6px",
              color: "var(--gray)",
              fontSize: "14px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "#2a1a44",
              border: "1px solid #AA88FF44",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: "#AA88FF",
              fontWeight: "700",
            }}
          >
            {iniciales}
          </div>
          <button
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid var(--blk5)",
              borderRadius: "6px",
              color: "var(--gray)",
              fontSize: "11px",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Salir
          </button>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: "900px", margin: "0 auto" }}>
        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[
            { label: "Por entregar", value: activas, color: "#AA88FF" },
            { label: "Entregadas", value: entregadas, color: "var(--m)" },
            { label: "Con novedad", value: novedad, color: "var(--warn)" },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  marginBottom: "5px",
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "500",
                  fontFamily: "var(--font-mono)",
                  color: k.color,
                }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "14px",
            flexWrap: "wrap",
          }}
        >
          <input
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="Buscar factura, cliente, ciudad..."
            style={{ flex: 1, minWidth: "180px" }}
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ minWidth: "160px" }}
          >
            <option value="">Todas</option>
            <option value="en_transito">Por entregar</option>
            <option value="entregado">Entregadas</option>
            <option value="novedad">Con novedad</option>
          </select>
        </div>

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
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtradas.map((g) => {
              const dias =
                g.dias_habiles ??
                (g.fecha_guia
                  ? Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000)
                  : 0);
              return (
                <div
                  key={g.id}
                  style={{
                    background: "var(--blk2)",
                    border: `1px solid ${g.estado === "novedad" ? "var(--warn)" : "var(--blk4)"}`,
                    borderRadius: "10px",
                    padding: "14px",
                    borderLeft: `3px solid ${g.estado === "entregado" ? "var(--m)" : g.estado === "novedad" ? "var(--warn)" : "#AA88FF"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                      flexWrap: "wrap",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          fontWeight: "700",
                          color: "var(--wht)",
                        }}
                      >
                        {g.factura_indurruedas || g.numero_guia}
                      </span>
                      <PillEstado estado={g.estado} />
                    </div>
                    {g.estado === "en_transito" && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => {
                            setModalNovedad(g);
                            setNovedadDesc("");
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "5px 10px",
                            background: "transparent",
                            color: "var(--warn)",
                            border: "1px solid var(--warn)",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          ⚠️ Novedad
                        </button>
                        <button
                          onClick={() => {
                            setModalFoto(g);
                            setFechaEntrega(
                              new Date().toISOString().split("T")[0],
                            );
                            setFotoFile(null);
                            setFotoPreview(null);
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "5px 10px",
                            background: "#1a3300",
                            color: "var(--m)",
                            border: "1px solid var(--m)",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          📸 Foto
                        </button>
                        <button
                          onClick={() => {
                            setModalEntrega(g);
                            setFechaEntrega(
                              new Date().toISOString().split("T")[0],
                            );
                            setFotoFile(null);
                            setFotoPreview(null);
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "5px 12px",
                            background: "var(--m)",
                            color: "var(--blk)",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "500",
                          }}
                        >
                          ✓ Entregado
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--wht)",
                      fontWeight: "500",
                      marginBottom: "6px",
                    }}
                  >
                    {g.clientes?.nombre || g.destinatario || "—"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px",
                      fontSize: "11px",
                      color: "var(--gray)",
                    }}
                  >
                    <span>📍 {g.ciudad_destino || "—"}</span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.direccion_entrega || "—"}
                    </span>
                    <span>
                      {g.fecha_guia
                        ? format(parseISO(g.fecha_guia), "d MMM yyyy", {
                            locale: es,
                          })
                        : "—"}
                    </span>
                    <span
                      style={{
                        color:
                          dias >= 10
                            ? "var(--danger)"
                            : dias >= 6
                              ? "var(--warn)"
                              : "var(--m)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: "500",
                      }}
                    >
                      {dias} días
                    </span>
                  </div>
                  {g.novedad_descripcion && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "6px 10px",
                        background: "rgba(255,170,0,0.1)",
                        borderRadius: "6px",
                        fontSize: "11px",
                        color: "var(--warn)",
                      }}
                    >
                      ⚠️ {g.novedad_descripcion}
                    </div>
                  )}
                  {g.foto_evidencia && (
                    <div style={{ marginTop: "8px" }}>
                      <a
                        href={g.foto_evidencia}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={g.foto_evidencia}
                          alt="Evidencia"
                          style={{
                            width: "80px",
                            height: "80px",
                            objectFit: "cover",
                            borderRadius: "6px",
                            border: "1px solid var(--blk4)",
                            cursor: "pointer",
                          }}
                        />
                      </a>
                    </div>
                  )}
                  {g.estado === "entregado" && g.fecha_entrega && (
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "11px",
                        color: "var(--m)",
                      }}
                    >
                      ✓ Entregado el{" "}
                      {format(parseISO(g.fecha_entrega), "d MMM yyyy", {
                        locale: es,
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filtradas.length === 0 && (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "var(--gray)",
                  fontSize: "12px",
                }}
              >
                No se encontraron guías
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal foto = entregado */}
      {modalFoto && (
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
          onClick={() => setModalFoto(null)}
        >
          <div
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "420px",
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
              📸 Foto de entrega
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--gray)",
                marginBottom: "20px",
              }}
            >
              {modalFoto.factura_indurruedas} —{" "}
              {modalFoto.clientes?.nombre || modalFoto.destinatario}
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
                Fecha de entrega
              </label>
              <input
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                style={{ width: "100%", fontSize: "14px", padding: "10px" }}
              />
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
                Toma la foto de la factura firmada
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={seleccionarFoto}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "8px",
                  background: "var(--blk3)",
                  border: "2px dashed var(--m)",
                  borderRadius: "8px",
                  color: "var(--wht2)",
                  cursor: "pointer",
                }}
              />
              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Preview"
                  style={{
                    marginTop: "10px",
                    width: "100%",
                    maxHeight: "250px",
                    objectFit: "contain",
                    borderRadius: "8px",
                    border: "1px solid var(--blk4)",
                  }}
                />
              )}
            </div>

            <div
              style={{
                background: "var(--m-dim)",
                border: "1px solid var(--m-dim2)",
                borderRadius: "7px",
                padding: "10px",
                marginBottom: "16px",
                fontSize: "11px",
                color: "var(--m)",
              }}
            >
              ✅ Al subir la foto, la guía quedará marcada como{" "}
              <strong>Entregada</strong> automáticamente
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => subirSoloFoto(modalFoto)}
                disabled={guardando || !fotoFile}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: fotoFile ? "var(--m)" : "var(--blk4)",
                  color: fotoFile ? "var(--blk)" : "var(--gray)",
                  border: "none",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: fotoFile ? "pointer" : "not-allowed",
                }}
              >
                {guardando
                  ? "Subiendo..."
                  : fotoFile
                    ? "📸 Subir foto y marcar entregado"
                    : "Selecciona una foto"}
              </button>
              <button
                onClick={() => setModalFoto(null)}
                style={{
                  padding: "10px 14px",
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

      {/* Modal entrega sin foto */}
      {modalEntrega && (
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
          onClick={() => setModalEntrega(null)}
        >
          <div
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "420px",
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
              Confirmar entrega
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--gray)",
                marginBottom: "20px",
              }}
            >
              {modalEntrega.factura_indurruedas} —{" "}
              {modalEntrega.clientes?.nombre || modalEntrega.destinatario}
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
                Fecha de entrega
              </label>
              <input
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                style={{ width: "100%", fontSize: "14px", padding: "10px" }}
              />
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
                📸 Foto de factura firmada (opcional)
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={seleccionarFoto}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "6px",
                  background: "var(--blk3)",
                  border: "1px solid var(--blk5)",
                  borderRadius: "6px",
                  color: "var(--wht2)",
                  cursor: "pointer",
                }}
              />
              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Preview"
                  style={{
                    marginTop: "8px",
                    width: "100%",
                    maxHeight: "200px",
                    objectFit: "contain",
                    borderRadius: "8px",
                    border: "1px solid var(--blk4)",
                  }}
                />
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => marcarEntregado(modalEntrega)}
                disabled={guardando}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--m)",
                  color: "var(--blk)",
                  border: "none",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                {guardando ? "Guardando..." : "✓ Confirmar entrega"}
              </button>
              <button
                onClick={() => setModalEntrega(null)}
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

      {/* Modal novedad */}
      {modalNovedad && (
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
          onClick={() => setModalNovedad(null)}
        >
          <div
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "420px",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: "500",
                color: "var(--warn)",
                marginBottom: "4px",
              }}
            >
              ⚠️ Reportar novedad
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--gray)",
                marginBottom: "20px",
              }}
            >
              {modalNovedad.factura_indurruedas} —{" "}
              {modalNovedad.clientes?.nombre || modalNovedad.destinatario}
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
                ¿Qué pasó?
              </label>
              <textarea
                value={novedadDesc}
                onChange={(e) => setNovedadDesc(e.target.value)}
                placeholder="Describe el problema: cliente ausente, dirección incorrecta, mercancía dañada..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "var(--blk3)",
                  border: "1px solid var(--blk5)",
                  borderRadius: "7px",
                  color: "var(--wht2)",
                  fontSize: "13px",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "var(--font-body)",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => reportarNovedad(modalNovedad)}
                disabled={guardando || !novedadDesc.trim()}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: novedadDesc.trim()
                    ? "var(--warn)"
                    : "var(--blk4)",
                  color: novedadDesc.trim() ? "var(--blk)" : "var(--gray)",
                  border: "none",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: novedadDesc.trim() ? "pointer" : "not-allowed",
                }}
              >
                {guardando ? "Guardando..." : "⚠️ Reportar novedad"}
              </button>
              <button
                onClick={() => setModalNovedad(null)}
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
