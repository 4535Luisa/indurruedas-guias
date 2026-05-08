import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  supabase,
  normalizarEstadoTCC,
  normalizarEstadoEstelar,
} from "../lib/supabase";
import {
  PillEstado,
  PillTransportadora,
  PageHeader,
  Btn,
  Table,
  Th,
  Td,
} from "../components/UI";
import DetalleGuia from "../components/DetalleGuia";
import AsignarCliente from "../components/AsignarCliente";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const POR_PAGINA = 50;
const SIMON_ID = "d9a0256c-d556-4506-8724-306c33016a22";

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

function BarraProgreso({ progreso }) {
  if (!progreso.activo) return null;
  const pct =
    progreso.total > 0
      ? Math.round((progreso.actual / progreso.total) * 100)
      : 0;
  return (
    <div
      style={{
        background: "var(--blk2)",
        border: "1px solid var(--blk4)",
        borderRadius: "10px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--m)",
            }}
          ></div>
          <span
            style={{ fontSize: "12px", fontWeight: "500", color: "var(--wht)" }}
          >
            Cargando {progreso.trans}
          </span>
        </div>
        <span
          style={{
            fontSize: "16px",
            fontWeight: "700",
            fontFamily: "var(--font-mono)",
            color: "var(--m)",
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: "8px",
          background: "var(--blk3)",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--m)",
            borderRadius: "4px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "var(--gray)",
        }}
      >
        <span>{progreso.texto}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>
          {progreso.actual} / {progreso.total}
        </span>
      </div>
    </div>
  );
}

export default function Guias() {
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [searchParams] = useSearchParams();
  const [filtroCriticas, setFiltroCriticas] = useState(
    searchParams.get("estado") === "criticas",
  );
  const [filtroTexto, setFiltroTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroTransp, setFiltroTransp] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [asesores, setAsesores] = useState([]);
  const [transportadorasFiltro, setTransportadorasFiltro] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [guiaDetalle, setGuiaDetalle] = useState(null);
  const [guiaAsignar, setGuiaAsignar] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [progreso, setProgreso] = useState({
    activo: false,
    actual: 0,
    total: 0,
    texto: "",
    trans: "",
  });
  const [modalFechaEntrega, setModalFechaEntrega] = useState(null);
  const [fechaEntregaModal, setFechaEntregaModal] = useState("");
  const fileEstelarRef = useRef();
  const fileTccRef = useRef();
  const clienteCache = useRef({});

  useEffect(() => {
    cargarAsesores();
    cargarTransportadoras();
  }, []);
  useEffect(() => {
    cargarGuias();
  }, [
    pagina,
    busqueda,
    filtroTransp,
    filtroEstado,
    filtroAsesor,
    filtroCriticas,
  ]);
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

  async function cargarTransportadoras() {
    const { data } = await supabase
      .from("transportadoras")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre");
    setTransportadorasFiltro(data || []);
  }

  async function cargarGuias() {
    setLoading(true);
    const desde = (pagina - 1) * POR_PAGINA;
    let q = supabase
      .from("guias")
      .select(
        "id, numero_guia, transportadora, transportadora_nombre, transportadora_id, factura_indurruedas, estado, estado_transportadora, fecha_guia, fecha_entrega, dias_habiles, ciudad_destino, direccion_entrega, destinatario, clientes(id, nombre, nit, asesor_id, usuarios(id, nombre))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(desde, desde + POR_PAGINA - 1);
    if (busqueda)
      q = q.or(
        `numero_guia.ilike.%${busqueda}%,factura_indurruedas.ilike.%${busqueda}%,destinatario.ilike.%${busqueda}%,ciudad_destino.ilike.%${busqueda}%`,
      );
    if (filtroTransp === "estelar" || filtroTransp === "tcc") {
      q = q.eq("transportadora", filtroTransp);
    } else if (filtroTransp) {
      q = q.eq("transportadora_id", filtroTransp);
    }
    if (filtroEstado) q = q.eq("estado", filtroEstado);
    if (filtroCriticas) {
      const hace6Dias = new Date(Date.now() - 6 * 86400000)
        .toISOString()
        .split("T")[0];
      q = q
        .eq("activa", true)
        .neq("estado", "entregado")
        .neq("estado", "anulada")
        .lt("fecha_guia", hace6Dias);
    }
    const { data, count } = await q;
    let resultado = data || [];
    if (filtroAsesor === "sin_asesor") {
      resultado = resultado.filter((g) => !g.clientes?.usuarios);
    } else if (filtroAsesor) {
      resultado = resultado.filter(
        (g) => g.clientes?.usuarios?.id === filtroAsesor,
      );
    }
    const ORDEN = {
      en_transito: 0,
      pendiente: 1,
      novedad: 2,
      informada: 3,
      entregado: 4,
      no_despachada: 5,
      anulada: 6,
    };
    resultado.sort((a, b) => {
      const oa = ORDEN[a.estado] ?? 7,
        ob = ORDEN[b.estado] ?? 7;
      if (oa !== ob) return oa - ob;
      return new Date(b.fecha_guia || 0) - new Date(a.fecha_guia || 0);
    });
    setGuias(resultado);
    setTotal(count || 0);
    setLoading(false);
  }

  async function buscarClienteConCache(nit, nombre) {
    const key =
      nit && nit !== "nan" && String(nit).length > 3
        ? `nit:${nit}`
        : `nombre:${nombre}`;
    if (clienteCache.current[key] !== undefined)
      return clienteCache.current[key];

    if (nit && nit !== "nan" && String(nit).trim().length > 3) {
      const { data } = await supabase
        .from("clientes")
        .select("id")
        .eq("nit", String(nit).trim())
        .limit(1);
      if (data?.[0]) {
        clienteCache.current[key] = data[0].id;
        return data[0].id;
      }
    }

    if (nombre && nombre.trim().length > 2) {
      const nombreLimpio = nombre.trim();
      const { data: exacto } = await supabase
        .from("clientes")
        .select("id")
        .ilike("nombre", nombreLimpio)
        .limit(1);
      if (exacto?.[0]) {
        clienteCache.current[key] = exacto[0].id;
        return exacto[0].id;
      }
      const { data: parcial } = await supabase
        .from("clientes")
        .select("id")
        .ilike("nombre", `%${nombreLimpio}%`)
        .limit(1);
      if (parcial?.[0]) {
        clienteCache.current[key] = parcial[0].id;
        return parcial[0].id;
      }
    }

    clienteCache.current[key] = null;
    return null;
  }

  async function asignarSimonSiFBC(factura, clienteId) {
    if (!factura || !clienteId) return;
    // Si la factura es FBC (no FBG), asignar a Simon
    if (
      factura.toUpperCase().includes("FBC") &&
      !factura.toUpperCase().includes("FBG")
    ) {
      await supabase
        .from("clientes")
        .update({ asesor_id: SIMON_ID })
        .eq("id", clienteId);
    }
  }

  async function procesarExcelEstelar(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    clienteCache.current = {};
    let nuevas = 0,
      actualizadas = 0,
      errores = 0;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const rows = XLSX.utils
        .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" })
        .filter((r) => String(r["GUIA"] || "").trim());

      setProgreso({
        activo: true,
        actual: 0,
        total: rows.length,
        texto: "Verificando guias existentes...",
        trans: "Estelar Express",
      });

      const numerosGuia = rows
        .map((r) => String(r["GUIA"]).trim())
        .filter(Boolean);
      const { data: existentes } = await supabase
        .from("guias")
        .select("id, numero_guia, estado, factura_indurruedas")
        .in("numero_guia", numerosGuia);
      const existentesMap = {};
      (existentes || []).forEach((g) => {
        existentesMap[g.numero_guia] = g;
      });

      setProgreso((p) => ({ ...p, texto: "Detectando guias nuevas..." }));

      const porInsertar = [];
      const porActualizar = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setProgreso((p) => ({
          ...p,
          actual: i + 1,
          texto: `Preparando ${i + 1} de ${rows.length}...`,
        }));

        const numeroGuia = String(row["GUIA"] || "").trim();
        const estado = normalizarEstadoEstelar(String(row["ESTADO"] || ""));
        const factura = extraerFacturaEstelar(row["ANEXOS"]);
        const fechaGuia = parsearFechaEstelar(row["DIA AFORO"]);
        const fechaEntrega = row["FECHA ENTREGA"]
          ? parsearFechaEstelar(row["FECHA ENTREGA"])
          : null;
        const diasExcel = parseInt(row["DIAS ENTREGA"]) || null;
        const diasHabiles = estado === "entregado" ? diasExcel : null;
        const destinatario = String(row["DESTINATARIO"] || "").trim();
        const nit = String(row["DOCUMENTO DESTINATARIO"] || "").trim();
        const ciudad = String(row["CIUDAD DESTINO"] || "").trim();
        const direccion = String(row["DIRECCION DESTINO"] || "").trim();
        const clienteId = await buscarClienteConCache(nit, destinatario);

        // Asignar Simon si es FBC
        if (clienteId) await asignarSimonSiFBC(factura, clienteId);

        if (existentesMap[numeroGuia]) {
          porActualizar.push({
            id: existentesMap[numeroGuia].id,
            estado,
            factura_indurruedas:
              factura || existentesMap[numeroGuia].factura_indurruedas,
            fecha_entrega: fechaEntrega,
            dias_habiles: diasHabiles,
          });
        } else {
          porInsertar.push({
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
            dias_habiles: diasHabiles,
            activa: estado !== "entregado",
          });
        }
      }

      setProgreso((p) => ({
        ...p,
        texto: "Insertando guias nuevas...",
        actual: 0,
        total: porInsertar.length,
      }));
      const LOTE = 50;
      for (let i = 0; i < porInsertar.length; i += LOTE) {
        const lote = porInsertar.slice(i, i + LOTE);
        const { error } = await supabase.from("guias").insert(lote);
        if (!error) nuevas += lote.length;
        else errores += lote.length;
        setProgreso((p) => ({
          ...p,
          actual: Math.min(i + LOTE, porInsertar.length),
        }));
      }

      setProgreso((p) => ({
        ...p,
        texto: "Actualizando estados...",
        actual: 0,
        total: porActualizar.length,
      }));
      for (let i = 0; i < porActualizar.length; i += LOTE) {
        const lote = porActualizar.slice(i, i + LOTE);
        for (const g of lote) {
          const { id, ...datos } = g;
          await supabase
            .from("guias")
            .update({ ...datos, updated_at: new Date().toISOString() })
            .eq("id", id);
          actualizadas++;
        }
        setProgreso((p) => ({
          ...p,
          actual: Math.min(i + LOTE, porActualizar.length),
        }));
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
    setProgreso({ activo: false, actual: 0, total: 0, texto: "", trans: "" });
    fileEstelarRef.current.value = "";
  }

  async function procesarExcelTCC(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    clienteCache.current = {};
    let nuevas = 0,
      actualizadas = 0,
      errores = 0;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const rows = XLSX.utils
        .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" })
        .filter((r) => String(r["Nro. de Remision TCC"] || "").trim());

      setProgreso({
        activo: true,
        actual: 0,
        total: rows.length,
        texto: "Verificando guias existentes...",
        trans: "TCC",
      });

      const numerosGuia = rows.map((r) =>
        String(r["Nro. de Remision TCC"]).trim(),
      );
      const { data: existentes } = await supabase
        .from("guias")
        .select("id, numero_guia, estado")
        .in("numero_guia", numerosGuia);
      const existentesMap = {};
      (existentes || []).forEach((g) => {
        existentesMap[g.numero_guia] = g;
      });

      const porInsertar = [];
      const porActualizar = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setProgreso((p) => ({
          ...p,
          actual: i + 1,
          texto: `Preparando ${i + 1} de ${rows.length}...`,
        }));

        const numeroGuia = String(row["Nro. de Remision TCC"] || "").trim();
        const factura = String(row["Documento Cliente"] || "").trim() || null;
        const fechaGuia = parsearFechaTCC(row["Fecha(dd/mm/aaaa)"]);
        const estadoRaw = String(row["Donde esta su paquete ?"] || "").trim();
        const estado = normalizarEstadoTCC(estadoRaw);
        const destinatario = String(row["Destinatario"] || "").trim();
        const direccion = String(row["Direccion"] || "").trim();
        const destino = String(row["Destino"] || "")
          .split("-")[0]
          .trim();
        const diasExcel = parseInt(row["Dias de entrega (habiles)"]) || null;
        const diasHabiles = estado === "entregado" ? diasExcel : null;
        const clienteId = await buscarClienteConCache(null, destinatario);

        if (existentesMap[numeroGuia]) {
          porActualizar.push({
            id: existentesMap[numeroGuia].id,
            estado,
            estado_transportadora: estadoRaw,
            dias_habiles: diasHabiles,
          });
        } else {
          const fechaEntregaTCC =
            estado === "entregado" && row["Fecha de Entrega(dd/mm/aaaa)"]
              ? parsearFechaTCC(
                  String(row["Fecha de Entrega(dd/mm/aaaa)"]).split(" ")[0],
                )
              : null;
          porInsertar.push({
            numero_guia: numeroGuia,
            transportadora: "tcc",
            factura_indurruedas: factura,
            estado,
            estado_transportadora: estadoRaw,
            cliente_id: clienteId,
            destinatario,
            direccion_entrega: direccion,
            ciudad_destino: destino,
            fecha_guia: fechaGuia,
            fecha_entrega: fechaEntregaTCC,
            dias_habiles: diasHabiles,
            activa: estado !== "entregado",
          });
        }
      }

      setProgreso((p) => ({
        ...p,
        texto: "Insertando guias nuevas...",
        actual: 0,
        total: porInsertar.length,
      }));
      const LOTE = 50;
      for (let i = 0; i < porInsertar.length; i += LOTE) {
        const lote = porInsertar.slice(i, i + LOTE);
        const { error: insertErr } = await supabase.from("guias").insert(lote);
        if (!insertErr) {
          nuevas += lote.length;
        } else {
          for (const g of lote) {
            const { error: e2 } = await supabase.from("guias").insert([g]);
            if (!e2) nuevas++;
            else errores++;
          }
        }
        setProgreso((p) => ({
          ...p,
          actual: Math.min(i + LOTE, porInsertar.length),
        }));
      }

      setProgreso((p) => ({
        ...p,
        texto: "Actualizando estados...",
        actual: 0,
        total: porActualizar.length,
      }));
      for (let i = 0; i < porActualizar.length; i++) {
        const g = porActualizar[i];
        const { id, ...datos } = g;
        const { error: updateErr } = await supabase
          .from("guias")
          .update({ ...datos, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (!updateErr) actualizadas++;
        else errores++;
        setProgreso((p) => ({ ...p, actual: i + 1 }));
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
    setProgreso({ activo: false, actual: 0, total: 0, texto: "", trans: "" });
    fileTccRef.current.value = "";
  }

  async function exportarExcel() {
    setExportando(true);
    let q = supabase
      .from("guias")
      .select(
        "numero_guia, transportadora, factura_indurruedas, estado, fecha_guia, ciudad_destino, direccion_entrega, destinatario, clientes(nombre, nit, usuarios(nombre))",
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
      "N Guia": g.numero_guia,
      Transportadora:
        g.transportadora === "estelar" ? "Estelar Express" : "TCC",
      Factura: g.factura_indurruedas || "",
      Cliente: g.clientes?.nombre || g.destinatario || "",
      NIT: g.clientes?.nit || "",
      Asesor: g.clientes?.usuarios?.nombre || "",
      Ciudad: g.ciudad_destino || "",
      Direccion: g.direccion_entrega || "",
      Fecha: g.fecha_guia || "",
      "Dias activa": g.fecha_guia
        ? Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000)
        : "",
      Estado: g.estado,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Guias");
    XLSX.writeFile(wb, `guias_${new Date().toISOString().split("T")[0]}.xlsx`);
    setExportando(false);
  }

  async function actualizarEstado(guiaId, nuevoEstado, guia) {
    if (nuevoEstado === "entregado") {
      setFechaEntregaModal(new Date().toISOString().split("T")[0]);
      setModalFechaEntrega({ guiaId, guia });
      return;
    }
    await supabase
      .from("guias")
      .update({ estado: nuevoEstado })
      .eq("id", guiaId);
    setGuias((prev) =>
      prev.map((g) => (g.id === guiaId ? { ...g, estado: nuevoEstado } : g)),
    );
  }

  async function confirmarEntrega() {
    const { guiaId, guia } = modalFechaEntrega;
    const fechaGuia = guia.fecha_guia ? new Date(guia.fecha_guia) : null;
    const dias = fechaGuia
      ? Math.floor((new Date(fechaEntregaModal) - fechaGuia) / 86400000)
      : null;
    await supabase
      .from("guias")
      .update({
        estado: "entregado",
        fecha_entrega: fechaEntregaModal,
        dias_habiles: dias,
        activa: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guiaId);
    await supabase
      .from("historial_estados")
      .insert({
        guia_id: guiaId,
        estado_anterior: guia.estado,
        estado_nuevo: "entregado",
        fuente: "admin",
      });
    setGuias((prev) =>
      prev.map((g) =>
        g.id === guiaId
          ? {
              ...g,
              estado: "entregado",
              fecha_entrega: fechaEntregaModal,
              dias_habiles: dias,
            }
          : g,
      ),
    );
    setModalFechaEntrega(null);
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  return (
    <div>
      <PageHeader
        title="Guias de envio"
        subtitle={`${total.toLocaleString()} guias - pagina ${pagina} de ${Math.max(1, totalPaginas)}`}
      >
        <Btn onClick={exportarExcel} disabled={exportando || uploading}>
          {exportando ? "Exportando..." : "Exportar Excel"}
        </Btn>
        <Btn
          onClick={() => fileEstelarRef.current.click()}
          disabled={uploading}
        >
          {uploading ? "Procesando..." : "Excel Estelar"}
        </Btn>
        <Btn onClick={() => fileTccRef.current.click()} disabled={uploading}>
          {uploading ? "Procesando..." : "Excel TCC"}
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

      <BarraProgreso progreso={progreso} />

      {filtroCriticas && (
        <div
          style={{
            background: "#1a0800",
            border: "1px solid var(--danger)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--danger)" }}>
            🚨 Mostrando solo guías con más de 6 días sin entrega
          </span>
          <button
            onClick={() => setFiltroCriticas(false)}
            style={{
              background: "transparent",
              border: "1px solid var(--danger)",
              borderRadius: "5px",
              color: "var(--danger)",
              fontSize: "11px",
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            Quitar filtro ×
          </button>
        </div>
      )}

      {uploadResult && !progreso.activo && (
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
          {uploadResult.error ||
            `${uploadResult.trans} - ${uploadResult.nuevas} nuevas - ${uploadResult.actualizadas} actualizadas - ${uploadResult.errores} errores`}
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
            x
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
          placeholder="Buscar guia, factura, cliente, ciudad..."
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
          {transportadorasFiltro.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
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
          <option value="anulada">Anulada</option>
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
          <option value="sin_asesor">Sin asesor asignado</option>
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
          Cargando guias...
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
                  <Th>N Guia</Th>
                  <Th>Transp.</Th>
                  <Th>Factura</Th>
                  <Th>Cliente</Th>
                  <Th>Ciudad</Th>
                  <Th>Asesor</Th>
                  <Th>Fecha</Th>
                  <Th>Dias</Th>
                  <Th>Estado</Th>
                  <Th>Actualizar</Th>
                </tr>
              </thead>
              <tbody>
                {guias.map((g) => {
                  let dias = 0;
                  if (g.dias_habiles != null) {
                    dias = g.dias_habiles;
                  } else if (g.fecha_guia) {
                    const fechaFin =
                      g.estado === "entregado" && g.fecha_entrega
                        ? new Date(g.fecha_entrega)
                        : new Date();
                    dias = Math.floor(
                      (fechaFin - new Date(g.fecha_guia)) / 86400000,
                    );
                  }
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
                        {g.transportadora === "otra" ? (
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "2px 7px",
                              borderRadius: "20px",
                              background: "#1a0a2e",
                              border: "1px solid #3d1a66",
                              color: "#AA88FF",
                              whiteSpace: "nowrap",
                              fontWeight: "500",
                            }}
                          >
                            {g.transportadora_nombre
                              ?.split(" ")
                              .slice(0, 2)
                              .join(" ") || "Otra"}
                          </span>
                        ) : (
                          <PillTransportadora
                            transportadora={g.transportadora}
                          />
                        )}
                      </Td>
                      <Td
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--gray)",
                        }}
                      >
                        {g.factura_indurruedas || "-"}
                      </Td>
                      <Td style={{ color: "var(--wht)" }}>
                        {g.clientes?.nombre ? (
                          g.clientes.nombre
                        ) : (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span
                              style={{ color: "var(--gray)", fontSize: "11px" }}
                            >
                              {g.destinatario || "-"}
                            </span>
                            <button
                              onClick={() => setGuiaAsignar(g)}
                              style={{
                                fontSize: "9px",
                                padding: "2px 6px",
                                border: "1px solid var(--m)",
                                borderRadius: "4px",
                                background: "transparent",
                                color: "var(--m)",
                                cursor: "pointer",
                              }}
                            >
                              Asignar
                            </button>
                          </span>
                        )}
                      </Td>
                      <Td style={{ whiteSpace: "nowrap" }}>
                        {g.ciudad_destino || "-"}
                      </Td>
                      <Td style={{ color: "var(--gray)", fontSize: "11px" }}>
                        {g.clientes?.usuarios?.nombre || "-"}
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
                          : "-"}
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
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                          }}
                        >
                          <PillEstado estado={g.estado} />
                          {g.estado_transportadora && (
                            <span
                              style={{
                                fontSize: "9px",
                                color: "var(--gray)",
                                fontStyle: "italic",
                              }}
                            >
                              {g.estado_transportadora}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <select
                          value={g.estado}
                          onChange={(e) =>
                            actualizarEstado(g.id, e.target.value, g)
                          }
                          style={{
                            fontSize: "10px",
                            padding: "3px 6px",
                            minWidth: "130px",
                          }}
                        >
                          <option value="en_transito">En tránsito</option>
                          <option value="entregado">Entregado</option>
                          <option value="pendiente">Pendiente recogida</option>
                          <option value="novedad">Con novedad</option>
                          <option value="informada">Informada TCC</option>
                          <option value="no_despachada">No despachada</option>
                          <option value="anulada">Anulada</option>
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
                No se encontraron guias
              </div>
            )}
          </div>

          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: "220px",
              right: 0,
              zIndex: 10,
              background: "var(--blk2)",
              borderTop: "1px solid var(--blk4)",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--gray)" }}>
              Mostrando {Math.min((pagina - 1) * POR_PAGINA + 1, total)}-
              {Math.min(pagina * POR_PAGINA, total)} de {total.toLocaleString()}{" "}
              guias
            </span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <Btn onClick={() => setPagina(1)} disabled={pagina === 1}>
                «
              </Btn>
              <Btn
                onClick={() => setPagina((p) => p - 1)}
                disabled={pagina === 1}
              >
                Ant
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
                Sig
              </Btn>
              <Btn
                onClick={() => setPagina(totalPaginas)}
                disabled={pagina >= totalPaginas}
              >
                »
              </Btn>
            </div>
          </div>
          <div style={{ height: "52px" }} />
        </>
      )}

      {guiaDetalle && (
        <DetalleGuia guia={guiaDetalle} onClose={() => setGuiaDetalle(null)} />
      )}
      {guiaAsignar && (
        <AsignarCliente
          guia={guiaAsignar}
          onClose={() => setGuiaAsignar(null)}
          onAsignado={() => cargarGuias()}
        />
      )}

      {modalFechaEntrega && (
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
          onClick={() => setModalFechaEntrega(null)}
        >
          <div
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "380px",
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
              ¿Cuándo fue entregado?
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--gray)",
                marginBottom: "20px",
              }}
            >
              {modalFechaEntrega.guia?.clientes?.nombre ||
                modalFechaEntrega.guia?.destinatario ||
                modalFechaEntrega.guia?.numero_guia}
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Fecha de entrega
              </label>
              <input
                type="date"
                value={fechaEntregaModal}
                onChange={(e) => setFechaEntregaModal(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                style={{ width: "100%", fontSize: "14px", padding: "10px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={confirmarEntrega}
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
                ✓ Confirmar entrega
              </button>
              <button
                onClick={() => setModalFechaEntrega(null)}
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
