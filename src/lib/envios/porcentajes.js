// Porcentaje máximo de la factura que se puede gastar en flete, por municipio
// de destino (Excel "PORCENTAJE DE ENVIOS"). Aplica a cualquier transportadora.
// Se guarda en config_envios.datos.pct_flete_municipios como
// { "<código DANE>": { pct, municipio, departamento } }, con pct en % (5 = 5%).
import * as XLSX from "xlsx";
import { normalizar, resolverMunicipio } from "./municipios.js";

// 0.05 -> 5 ; "5.0%" -> 5 ; "5,5" -> 5.5 ; 5 -> 5
export function leerPorcentaje(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v <= 1 ? round(v * 100) : round(v);
  const s = String(v).trim();
  const n = parseFloat(s.replace("%", "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  if (s.includes("%")) return round(n);
  return n <= 1 ? round(n * 100) : round(n);
}

const round = (n) => Math.round(n * 1000) / 1000;

/** filas: [[municipio, departamento, porcentaje], ...] con su número de fila. */
export function procesarFilasPorcentajes(filas) {
  const tabla = {};
  const errores = [];
  const avisos = [];
  const filaDe = {};
  for (const { fila, municipio, departamento, porcentaje } of filas) {
    if (!normalizar(municipio)) continue;
    const pct = leerPorcentaje(porcentaje);
    if (pct === null || Number.isNaN(pct) || pct <= 0 || pct > 100) {
      errores.push({ fila, municipio, problema: `Porcentaje inválido: "${porcentaje ?? ""}"` });
      continue;
    }
    const r = resolverMunicipio(municipio, departamento);
    if (r.estado === "ambiguo") {
      errores.push({ fila, municipio, problema: `Existe en varios departamentos (${r.opciones.map((o) => o.departamento).join(", ")}); el departamento "${departamento || ""}" no corresponde a ninguno.` });
      continue;
    }
    if (r.estado !== "ok") {
      errores.push({ fila, municipio, problema: "No se encontró en el listado DANE." });
      continue;
    }
    const dptoExcel = normalizar(departamento);
    if (dptoExcel && !normalizar(r.departamento).startsWith(dptoExcel.slice(0, 5)))
      avisos.push({ fila, municipio, problema: `El Excel dice ${departamento}, pero ${r.nombre} es de ${r.departamento}. Se usó ${r.departamento}.` });
    const previo = tabla[r.codigo];
    if (previo && previo.pct !== pct)
      avisos.push({ fila, municipio, problema: `Repetido (fila ${filaDe[r.codigo]}) con otro porcentaje (${previo.pct}%); se usó ${pct}%.` });
    tabla[r.codigo] = { pct, municipio: r.nombre, departamento: r.departamento };
    filaDe[r.codigo] = fila;
  }
  return { tabla, errores, avisos };
}

export function leerExcelPorcentajes(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: true });
  const iTit = filas.findIndex((f) => f.some((c) => normalizar(c).startsWith("MUNICIPIO") || normalizar(c).startsWith("CIUDAD")));
  if (iTit < 0) throw new Error('No se encontró la columna "MUNICIPIO" en el Excel.');
  const tit = filas[iTit].map((t) => normalizar(t));
  const iMun = tit.findIndex((t) => t.startsWith("MUNICIPIO") || t.startsWith("CIUDAD"));
  const iDep = tit.findIndex((t) => t.startsWith("DEPARTAMENTO"));
  const iPct = tit.findIndex((t) => t.startsWith("PORCENTAJE") || t === "%");
  if (iPct < 0) throw new Error('No se encontró la columna "PORCENTAJE" en el Excel.');
  const datos = [];
  for (let r = iTit + 1; r < filas.length; r++) {
    const f = filas[r];
    datos.push({ fila: r + 1, municipio: f[iMun], departamento: iDep >= 0 ? f[iDep] : "", porcentaje: f[iPct] });
  }
  return procesarFilasPorcentajes(datos);
}

export function descargarPorcentajes(tabla, nombre = "porcentaje_envios.xlsx") {
  const filas = Object.entries(tabla || {})
    .map(([codigo, t]) => [t.municipio, t.departamento, t.pct / 100, codigo])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const ws = XLSX.utils.aoa_to_sheet([["MUNICIPIO", "DEPARTAMENTO", "PORCENTAJE", "CODIGO DANE"], ...filas]);
  for (let i = 0; i < filas.length; i++) {
    const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: 2 })];
    if (c) c.z = "0.0%";
  }
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 13 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PORCENTAJES");
  XLSX.writeFile(wb, nombre);
}
