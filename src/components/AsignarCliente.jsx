import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function AsignarCliente({ guia, onClose, onAsignado }) {
  const [busqueda, setBusqueda] = useState(guia?.destinatario || "");
  const [clientes, setClientes] = useState([]);
  const [asesores, setAsesores] = useState([]);
  const [asesorSeleccionado, setAsesorSeleccionado] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  useEffect(() => {
    cargarAsesores();
    if (busqueda.length >= 2) buscarClientes();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (busqueda.length >= 2) buscarClientes();
      else setClientes([]);
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  async function cargarAsesores() {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .eq("rol", "asesor")
      .eq("activo", true)
      .order("nombre");
    setAsesores(data || []);
  }

  async function buscarClientes() {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nit, nombre, asesor_id, usuarios(nombre), sedes(ciudad)")
      .or(`nombre.ilike.%${busqueda}%,nit.ilike.%${busqueda}%`)
      .limit(8);
    setClientes(data || []);
    setLoading(false);
  }

  async function guardar() {
    if (!clienteSeleccionado && !asesorSeleccionado) return;
    setSaving(true);

    if (clienteSeleccionado) {
      // Asignar cliente existente a la guia
      const updates = { cliente_id: clienteSeleccionado.id };
      // Si ademas selecciono un asesor, actualizarlo en el cliente
      if (asesorSeleccionado) {
        await supabase
          .from("clientes")
          .update({ asesor_id: asesorSeleccionado })
          .eq("id", clienteSeleccionado.id);
      }
      await supabase.from("guias").update(updates).eq("id", guia.id);
    } else if (asesorSeleccionado) {
      // Solo crear cliente nuevo y asignar asesor
      const { data: nuevoCliente } = await supabase
        .from("clientes")
        .insert({
          nit:
            guia.destinatario?.replace(/\s/g, "_").substring(0, 20) ||
            "SIN_NIT",
          nombre: guia.destinatario || "Sin nombre",
          asesor_id: asesorSeleccionado,
        })
        .select("id")
        .single();

      if (nuevoCliente) {
        await supabase
          .from("guias")
          .update({ cliente_id: nuevoCliente.id })
          .eq("id", guia.id);
        // Crear sede
        await supabase.from("sedes").insert({
          cliente_id: nuevoCliente.id,
          ciudad: guia.ciudad_destino || "",
          direccion: guia.direccion_entrega || "",
          principal: true,
        });
      }
    }

    onAsignado();
    onClose();
    setSaving(false);
  }

  if (!guia) return null;

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--blk2)",
          border: "1px solid var(--blk4)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "520px",
          padding: "20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "var(--wht)",
              }}
            >
              Asignar cliente y asesor
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--gray)",
                marginTop: "2px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {guia.numero_guia} — {guia.destinatario}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--gray)",
              fontSize: "20px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Buscar cliente existente */}
        <div style={{ marginBottom: "14px" }}>
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
            Buscar cliente existente
          </label>
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setClienteSeleccionado(null);
            }}
            placeholder="Nombre o NIT..."
            style={{ width: "100%" }}
            autoFocus
          />
        </div>

        {/* Resultados */}
        {loading && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--gray)",
              padding: "4px 0 10px",
            }}
          >
            Buscando...
          </div>
        )}

        {clientes.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              maxHeight: "200px",
              overflowY: "auto",
              marginBottom: "14px",
            }}
          >
            {clientes.map((c) => (
              <div
                key={c.id}
                onClick={() =>
                  setClienteSeleccionado(
                    clienteSeleccionado?.id === c.id ? null : c,
                  )
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  background:
                    clienteSeleccionado?.id === c.id
                      ? "var(--m-dim)"
                      : "var(--blk3)",
                  border: `1px solid ${clienteSeleccionado?.id === c.id ? "var(--m)" : "var(--blk4)"}`,
                  borderRadius: "7px",
                  cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "500",
                      color: "var(--wht)",
                    }}
                  >
                    {c.nombre}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--gray)",
                      marginTop: "1px",
                    }}
                  >
                    NIT: {c.nit} · {c.sedes?.[0]?.ciudad || "—"} ·{" "}
                    {c.usuarios?.nombre || "Sin asesor"}
                  </div>
                </div>
                {clienteSeleccionado?.id === c.id && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--m)",
                      fontWeight: "500",
                    }}
                  >
                    ✓
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {busqueda.length >= 2 && clientes.length === 0 && !loading && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--gray)",
              padding: "8px 0 12px",
              textAlign: "center",
            }}
          >
            No se encontró el cliente en la base de datos
          </div>
        )}

        {/* Separador */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: "12px 0",
          }}
        >
          <div
            style={{ flex: 1, height: "1px", background: "var(--blk4)" }}
          ></div>
          <span style={{ fontSize: "10px", color: "var(--gray)" }}>
            {clienteSeleccionado
              ? "y opcionalmente cambiar asesor"
              : "o asignar directamente a un asesor"}
          </span>
          <div
            style={{ flex: 1, height: "1px", background: "var(--blk4)" }}
          ></div>
        </div>

        {/* Seleccionar asesor */}
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
            {clienteSeleccionado
              ? "Cambiar asesor del cliente (opcional)"
              : "Asignar a asesor (crea cliente nuevo)"}
          </label>
          <select
            value={asesorSeleccionado}
            onChange={(e) => setAsesorSeleccionado(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">— Seleccionar asesor —</option>
            {asesores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Botones */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={guardar}
            disabled={saving || (!clienteSeleccionado && !asesorSeleccionado)}
            style={{
              flex: 1,
              padding: "9px",
              background:
                !clienteSeleccionado && !asesorSeleccionado
                  ? "var(--blk4)"
                  : "var(--m)",
              color:
                !clienteSeleccionado && !asesorSeleccionado
                  ? "var(--gray)"
                  : "var(--blk)",
              border: "none",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: "500",
              cursor:
                !clienteSeleccionado && !asesorSeleccionado
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving
              ? "Guardando..."
              : clienteSeleccionado
                ? "Asignar cliente"
                : asesorSeleccionado
                  ? "Crear y asignar"
                  : "Selecciona una opción"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "9px 16px",
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
  );
}
