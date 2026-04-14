import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase, normalizarEstadoTCC } from "../lib/supabase";
import {
  PillEstado,
  PillTransportadora,
  DiasActiva,
  PageHeader,
  Btn,
  Table,
  Th,
  Td,
} from "../components/UI";
import DetalleGuia from "../components/DetalleGuia";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const POR_PAGINA = 50;

const MAPEO_ESTELAR = {
  cumplido: "entregado",
  entregado: "entregado",
  "en transito": "en_transito",
  "en tránsito": "en_transito",
  novedad: "novedad",
  "con novedad": "novedad",
  devuelto: "novedad",
  pendiente: "pendiente",
  "en bodega": "pendiente",
};

function normalizarEstadoEstelar(raw) {
  if (!raw) return "en_transito";
  const lower = raw.toLowerCase().trim();
  for (const [k, v] of Object.entries(MAPEO_ESTELAR)) {
    if (lower.includes(k)) return v;
  }
  return "en_transito";
}

function extraerFacturaEstelar(anexos) {
  if (!anexos) return null;
  const match = String(anexos).match(/FB[GC]-?\s*\d+/gi);
  return match ? match.map((m) => m.replace(/\s/g, "")).join(", ") : null;
}

function parsearFechaEstelar(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (s.includes("-")) return s.split("T")[0];
  if (s.includes("/")) {
    const [d, m, y] = s.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parsearFechaTCC(str) {
  if (!str) return null;
  const [d, m, y] = String(str).split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export default function Guias() {
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroTransp, setFiltroTransp] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [asesores, setAsesores] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [guiaDetalle, setGuiaDetalle] = useState(null);
  const [exportando, setExportando] = useState(false);
  const fileEstelarRef = useRef();
  const fileTccRef = useRef();

  useEffect(() => {
    cargarAsesores();
  }, []);
  useEffect(() => {
    cargarGuias();
  }, [pagina, busqueda, filtroTransp, filtroEstado, filtroAsesor]);
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(filtroTexto);
      setPagina(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filtroTexto]);

  async function cargarAsesores() {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .eq("rol", "asesor")
      .order("nombre");
    setAsesores(data || []);
  }

  async function cargarGuias() {
    setLoading(true);
    const desde = (pagina - 1) * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;

    let q = supabase
      .from("guias")
      .select(
        `id, numero_guia, transportadora, factura_indurruedas, estado,
        fecha_guia, ciudad_destino, direccion_entrega, destinatario,
        clientes(id, nombre, nit, asesor_id, usuarios(id, nombre))`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(desde, hasta);

    if (busqueda)
      q = q.or(
        `numero_guia.ilike.%${busqueda}%,factura_indurruedas.ilike.%${busqueda}%,destinatario.ilike.%${busqueda}%,ciudad_destino.ilike.%${busqueda}%`,
      );
    if (filtroTransp) q = q.eq("transportadora", filtroTransp);
    if (filtroEstado) q = q.eq("estado", filtroEstado);

    const { data, count } = await q;
    let resultado = data || [];
    if (filtroAsesor)
      resultado = resultado.filter(
        (g) => g.clientes?.usuarios?.id === filtroAsesor,
      );

    setGuias(resultado);
    setTotal(count || 0);
    setLoading(false);
  }

  async function buscarCliente(nit, nombre) {
    if (nit && nit !== "nan" && String(nit).length > 3) {
      const { data } = await supabase
        .from("clientes")
        .select("id")
        .eq("nit", String(nit).trim())
        .limit(1);
      if (data?.[0]) return data[0].id;
    }
    if (nombre) {
      const palabras = String(nombre).trim().split(" ").slice(0, 2).join(" ");
      const { data } = await supabase
        .from("clientes")
        .select("id")
        .ilike("nombre", `%${palabras}%`)
        .limit(1);
      if (data?.[0]) return data[0].id;
    }
    return null;
  }

  async function procesarExcelEstelar(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    let nuevas = 0,
      actualizadas = 0,
      errores = 0;
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
      });

      for (const row of rows) {
        const numeroGuia = String(row["GUIA"] || "").trim();
        if (!numeroGuia) continue;
        const estado = normalizarEstadoEstelar(String(row["ESTADO"] || ""));
        const factura = extraerFacturaEstelar(row["ANEXOS"]);
        const fechaGuia = parsearFechaEstelar(row["DIA AFORO"]);
        const fechaEntrega = row["FECHA ENTREGA"]
          ? parsearFechaEstelar(row["FECHA ENTREGA"])
          : null;
        const diasEntrega = parseInt(row["DIAS ENTREGA"]) || null;
        const destinatario = String(row["DESTINATARIO"] || "").trim();
        const nit = String(row["DOCUMENTO DESTINATARIO"] || "").trim();
        const ciudad = String(row["CIUDAD DESTINO"] || "").trim();
        const direccion = String(row["DIRECCION DESTINO"] || "").trim();
        const clienteId = await buscarCliente(nit, destinatario);

        const { data: existing } = await supabase
          .from("guias")
          .select("id, estado")
          .eq("numero_guia", numeroGuia)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("guias")
            .update({
              estado,
              factura_indurruedas: factura || existing.factura_indurruedas,
              fecha_entrega: fechaEntrega,
              dias_habiles: diasEntrega,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          actualizadas++;
        } else {
          const { error } = await supabase
            .from("guias")
            .insert({
              numero_guia: numeroGuia,
              transportadora: "estelar",
              factura_indurruedas: factura,
              estado,
              cliente_id: clienteId,
              destinatario,
              direccion_entrega: direccion,
              ciudad_destino: ciudad,
              fecha_guia: fechaGuia,
              fecha_entrega: fechaEntrega,
              dias_habiles: diasEntrega,
              activa: estado !== "entregado",
            });
          if (!error) nuevas++;
          else errores++;
        }
      }
      await supabase
        .from("sync_log")
        .insert({
          transportadora: "estelar",
          guias_nuevas: nuevas,
          guias_actualizadas: actualizadas,
          errores,
          detalle: { archivo: file.name, filas: rows.length },
        });
      setUploadResult({
        nuevas,
        actualizadas,
        errores,
        total: rows.length,
        trans: "Estelar Express",
      });
      cargarGuias();
    } catch (err) {
      setUploadResult({ error: "Error Estelar: " + err.message });
    }
    setUploading(false);
    fileEstelarRef.current.value = "";
  }

  async function procesarExcelTCC(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    let nuevas = 0,
      actualizadas = 0,
      errores = 0;
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
      });

      for (const row of rows) {
        const numeroGuia = String(row["Nro. de Remision TCC"] || "").trim();
        if (!numeroGuia) continue;
        const factura = String(row["Documento Cliente"] || "").trim() || null;
        const fechaGuia = parsearFechaTCC(row["Fecha(dd/mm/aaaa)"]);
        const estado = normalizarEstadoTCC(
          String(row["Donde esta su paquete ?"] || ""),
        );
        const destinatario = String(row["Destinatario"] || "").trim();
        const direccion = String(row["Direccion"] || "").trim();
        const destino = String(row["Destino"] || "")
          .split("-")[0]
          .trim();
        const diasHabiles = parseInt(row["Dias de entrega (habiles)"]) || null;
        const clienteId = await buscarCliente(null, destinatario);

        const { data: existing } = await supabase
          .from("guias")
          .select("id, estado")
          .eq("numero_guia", numeroGuia)
          .maybeSingle();
        if (existing) {
          if (existing.estado !== estado) {
            await supabase
              .from("guias")
              .update({
                estado,
                dias_habiles: diasHabiles,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            actualizadas++;
          }
        } else {
          const { error } = await supabase
            .from("guias")
            .insert({
              numero_guia: numeroGuia,
              transportadora: "tcc",
              factura_indurruedas: factura,
              estado,
              cliente_id: clienteId,
              destinatario,
              direccion_entrega: direccion,
              ciudad_destino: destino,
              fecha_guia: fechaGuia,
              dias_habiles: diasHabiles,
              activa: estado !== "entregado",
            });
          if (!error) nuevas++;
          else errores++;
        }
      }
      await supabase
        .from("sync_log")
        .insert({
          transportadora: "tcc",
          guias_nuevas: nuevas,
          guias_actualizadas: actualizadas,
          errores,
          detalle: { archivo: file.name, filas: rows.length },
        });
      setUploadResult({
        nuevas,
        actualizadas,
        errores,
        total: rows.length,
        trans: "TCC",
      });
      cargarGuias();
    } catch (err) {
      setUploadResult({ error: "Error TCC: " + err.message });
    }
    setUploading(false);
    fileTccRef.current.value = "";
  }

  async function exportarExcel() {
    setExportando(true);
    let q = supabase
      .from("guias")
      .select(
        `numero_guia, transportadora, factura_indurruedas, estado, fecha_guia, ciudad_destino, direccion_entrega, destinatario, clientes(nombre, nit, usuarios(nombre))`,
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (filtroTransp) q = q.eq("transportadora", filtroTransp);
    if (filtroEstado) q = q.eq("estado", filtroEstado);
    if (busqueda)
      q = q.or(
        `numero_guia.ilike.%${busqueda}%,destinatario.ilike.%${busqueda}%`,
      );

    const { data } = await q;
    if (!data) {
      setExportando(false);
      return;
    }

    const rows = data.map((g) => ({
      "N° Guía": g.numero_guia,
      Transportadora:
        g.transportadora === "estelar" ? "Estelar Express" : "TCC",
      Factura: g.factura_indurruedas || "",
      Cliente: g.clientes?.nombre || g.destinatario || "",
      NIT: g.clientes?.nit || "",
      Asesor: g.clientes?.usuarios?.nombre || "",
      Ciudad: g.ciudad_destino || "",
      Dirección: g.direccion_entrega || "",
      "Fecha guía": g.fecha_guia || "",
      "Días activa": g.fecha_guia
        ? Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000)
        : "",
      Estado: g.estado,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Guías");
    XLSX.writeFile(
      wb,
      `guias_indurruedas_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    setExportando(false);
  }

  async function actualizarEstado(guiaId, nuevoEstado) {
    await supabase
      .from("guias")
      .update({ estado: nuevoEstado })
      .eq("id", guiaId);
    setGuias((prev) =>
      prev.map((g) => (g.id === guiaId ? { ...g, estado: nuevoEstado } : g)),
    );
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  return (
    <div>
      <PageHeader
        title="Guías de envío"
        subtitle={`${total.toLocaleString()} guías · página ${pagina} de ${Math.max(1, totalPaginas)}`}
      >
        <Btn onClick={exportarExcel} disabled={exportando}>
          {exportando ? "Exportando..." : "↓ Exportar Excel"}
        </Btn>
        <Btn
          onClick={() => fileEstelarRef.current.click()}
          disabled={uploading}
        >
          {uploading ? "Procesando..." : "↑ Excel Estelar"}
        </Btn>
        <Btn onClick={() => fileTccRef.current.click()} disabled={uploading}>
          {uploading ? "Procesando..." : "↑ Excel TCC"}
        </Btn>
        <input
          ref={fileEstelarRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={procesarExcelEstelar}
        />
        <input
          ref={fileTccRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={procesarExcelTCC}
        />
      </PageHeader>

      {uploadResult && (
        <div
          style={{
            background: uploadResult.error ? "#2a0000" : "#0d1f00",
            border: `1px solid ${uploadResult.error ? "#440000" : "#1a3300"}`,
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "12px",
            color: uploadResult.error ? "var(--danger)" : "var(--m)",
          }}
        >
          {uploadResult.error
            ? uploadResult.error
            : `✓ ${uploadResult.trans} — ${uploadResult.nuevas} nuevas · ${uploadResult.actualizadas} actualizadas · ${uploadResult.errores} errores · ${uploadResult.total} filas`}
          <button
            onClick={() => setUploadResult(null)}
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

      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <input
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Buscar guía, factura, cliente, ciudad..."
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select
          value={filtroTransp}
          onChange={(e) => {
            setFiltroTransp(e.target.value);
            setPagina(1);
          }}
          style={{ minWidth: "160px" }}
        >
          <option value="">Todas las transportadoras</option>
          <option value="estelar">Estelar Express</option>
          <option value="tcc">TCC</option>
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => {
            setFiltroEstado(e.target.value);
            setPagina(1);
          }}
          style={{ minWidth: "160px" }}
        >
          <option value="">Todos los estados</option>
          <option value="en_transito">En tránsito</option>
          <option value="entregado">Entregado</option>
          <option value="pendiente">Pendiente recogida</option>
          <option value="novedad">Con novedad</option>
          <option value="informada">Informada TCC</option>
          <option value="no_despachada">No despachada</option>
        </select>
        <select
          value={filtroAsesor}
          onChange={(e) => {
            setFiltroAsesor(e.target.value);
            setPagina(1);
          }}
          style={{ minWidth: "180px" }}
        >
          <option value="">Todos los asesores</option>
          {asesores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div
          style={{
            color: "var(--m)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
          }}
        >
          Cargando guías...
        </div>
      ) : (
        <>
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
                  <Th>N° Guía</Th>
                  <Th>Transp.</Th>
                  <Th>Factura</Th>
                  <Th>Cliente</Th>
                  <Th>Ciudad</Th>
                  <Th>Asesor</Th>
                  <Th>Fecha</Th>
                  <Th>Días</Th>
                  <Th>Estado</Th>
                  <Th>Actualizar</Th>
                </tr>
              </thead>
              <tbody>
                {guias.map((g) => {
                  const dias = g.fecha_guia
                    ? Math.floor(
                        (new Date() - new Date(g.fecha_guia)) / 86400000,
                      )
                    : 0;
                  return (
                    <tr
                      key={g.id}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--hover-bg)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <Td>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            color: "var(--m)",
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                          onClick={() => setGuiaDetalle(g)}
                        >
                          {g.numero_guia}
                        </span>
                      </Td>
                      <Td>
                        <PillTransportadora transportadora={g.transportadora} />
                      </Td>
                      <Td
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--gray)",
                        }}
                      >
                        {g.factura_indurruedas || "—"}
                      </Td>
                      <Td style={{ color: "var(--wht)" }}>
                        {g.clientes?.nombre || g.destinatario || "—"}
                      </Td>
                      <Td style={{ whiteSpace: "nowrap" }}>
                        {g.ciudad_destino || "—"}
                      </Td>
                      <Td style={{ color: "var(--gray)", fontSize: "11px" }}>
                        {g.clientes?.usuarios?.nombre || "—"}
                      </Td>
                      <Td
                        style={{
                          color: "var(--gray)",
                          fontSize: "11px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.fecha_guia
                          ? format(parseISO(g.fecha_guia), "d MMM yy", {
                              locale: es,
                            })
                          : "—"}
                      </Td>
                      <Td>
                        <span
                          style={{
                            color:
                              dias >= 10
                                ? "var(--danger)"
                                : dias >= 6
                                  ? "var(--warn)"
                                  : "var(--m)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            fontWeight: "500",
                          }}
                        >
                          {dias}
                        </span>
                      </Td>
                      <Td>
                        <PillEstado estado={g.estado} />
                      </Td>
                      <Td>
                        <select
                          value={g.estado}
                          onChange={(e) =>
                            actualizarEstado(g.id, e.target.value)
                          }
                          style={{
                            fontSize: "10px",
                            padding: "3px 6px",
                            minWidth: "110px",
                          }}
                        >
                          <option value="en_transito">En tránsito</option>
                          <option value="entregado">Entregado</option>
                          <option value="pendiente">Pendiente</option>
                          <option value="novedad">Con novedad</option>
                          <option value="informada">Informada TCC</option>
                          <option value="no_despachada">No despachada</option>
                        </select>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {guias.length === 0 && (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center",
                  color: "var(--gray)",
                  fontSize: "12px",
                }}
              >
                No se encontraron guías
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "14px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--gray)" }}>
              Mostrando {Math.min((pagina - 1) * POR_PAGINA + 1, total)}–
              {Math.min(pagina * POR_PAGINA, total)} de {total.toLocaleString()}{" "}
              guías
            </span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <Btn onClick={() => setPagina(1)} disabled={pagina === 1}>
                «
              </Btn>
              <Btn
                onClick={() => setPagina((p) => p - 1)}
                disabled={pagina === 1}
              >
                ‹ Ant
              </Btn>
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let p;
                if (totalPaginas <= 5) p = i + 1;
                else if (pagina <= 3) p = i + 1;
                else if (pagina >= totalPaginas - 2) p = totalPaginas - 4 + i;
                else p = pagina - 2 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPagina(p)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      cursor: "pointer",
                      background: p === pagina ? "var(--m)" : "transparent",
                      color: p === pagina ? "var(--blk)" : "var(--gray)",
                      border:
                        p === pagina
                          ? "1px solid var(--m)"
                          : "1px solid var(--blk5)",
                      fontWeight: p === pagina ? "500" : "400",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <Btn
                onClick={() => setPagina((p) => p + 1)}
                disabled={pagina >= totalPaginas}
              >
                Sig ›
              </Btn>
              <Btn
                onClick={() => setPagina(totalPaginas)}
                disabled={pagina >= totalPaginas}
              >
                »
              </Btn>
            </div>
          </div>
        </>
      )}

      {guiaDetalle && (
        <DetalleGuia guia={guiaDetalle} onClose={() => setGuiaDetalle(null)} />
      )}
    </div>
  );
}
