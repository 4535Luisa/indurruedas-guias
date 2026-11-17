// Lectura y escritura del Excel de medidas y pesos (catálogo de productos).
import * as XLSX from "xlsx";
import { normalizar } from "./municipios.js";

export const COLUMNAS = [
  { campo: "referencia", titulo: "Referencia", ayuda: "Código igual al de la factura (ej. 147011)" },
  { campo: "descripcion", titulo: "Descripción" },
  { campo: "unidad_venta", titulo: "Unidad venta", ayuda: "UND, PAR, KIT, C25... como sale en la factura" },
  { campo: "peso_unidad_kg", titulo: "Peso unidad (kg)", ayuda: "Peso de UNA unidad de venta" },
  { campo: "unidades_por_empaque", titulo: "Unidades por empaque", ayuda: "Cuántas unidades de venta trae la caja master" },
  { campo: "tipo_empaque", titulo: "Tipo empaque", ayuda: "CAJA, BULTO, ROLLO, ATADO, SOBRE" },
  { campo: "largo_cm", titulo: "Largo (cm)" },
  { campo: "ancho_cm", titulo: "Ancho (cm)" },
  { campo: "alto_cm", titulo: "Alto (cm)" },
  { campo: "peso_empaque_kg", titulo: "Peso empaque lleno (kg)", ayuda: "Opcional; si se deja vacío se calcula" },
  { campo: "especial", titulo: "Especial (SI/NO)", ayuda: "Frágil, peligroso o sobredimensionado: siempre pide revisión" },
  { campo: "nota_especial", titulo: "Nota especial" },
];

const NUM = ["peso_unidad_kg", "largo_cm", "ancho_cm", "alto_cm", "peso_empaque_kg"];
const BOOL = ["especial"];

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function bool(v, defecto) {
  const s = normalizar(v);
  if (!s) return defecto;
  return ["SI", "S", "X", "TRUE", "1", "VERDADERO"].includes(s);
}

export function leerExcelCatalogo(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
  // Busca la fila de títulos (la que contiene "Referencia")
  const iTit = filas.findIndex((f) => f.some((c) => normalizar(c).startsWith("REFERENCIA")));
  if (iTit < 0) throw new Error('No se encontró la columna "Referencia" en el Excel.');
  const titulos = filas[iTit].map((t) => normalizar(t));
  const idx = {};
  for (const col of COLUMNAS) {
    const base = normalizar(col.titulo).split(" (")[0];
    const i = titulos.findIndex((t) => t === normalizar(col.titulo) || t.startsWith(base));
    if (i >= 0) idx[col.campo] = i;
  }

  const validos = [];
  const errores = [];
  for (let r = iTit + 1; r < filas.length; r++) {
    const f = filas[r];
    const ref = String(f[idx.referencia] ?? "").trim().replace(/\.0$/, "");
    if (!ref) continue;
    const p = { referencia: ref };
    for (const col of COLUMNAS) if (idx[col.campo] !== undefined && col.campo !== "referencia") p[col.campo] = f[idx[col.campo]];
    for (const k of NUM) p[k] = num(p[k]);
    p.unidades_por_empaque = Math.round(num(p.unidades_por_empaque) || 1);
    p.especial = bool(p.especial, false);
    p.tipo_empaque = String(p.tipo_empaque || "CAJA").toUpperCase().trim();
    p.unidad_venta = String(p.unidad_venta || "UND").toUpperCase().trim();
    p.descripcion = String(p.descripcion || "").trim() || null;
    p.nota_especial = String(p.nota_especial || "").trim() || null;

    const prob = [];
    if (!(p.peso_unidad_kg > 0)) prob.push("peso unidad");
    for (const k of ["largo_cm", "ancho_cm", "alto_cm"]) if (!(p[k] > 0)) prob.push(k.replace("_cm", ""));
    if (NUM.some((k) => Number.isNaN(p[k]))) prob.push("número inválido");
    if (prob.length) errores.push({ fila: r + 1, referencia: ref, problema: "Falta o es inválido: " + prob.join(", ") });
    else validos.push(p);
  }
  return { validos, errores };
}

export function descargarPlantilla(productos, nombre = "catalogo_productos.xlsx") {
  const aoa = [COLUMNAS.map((c) => c.titulo)];
  for (const p of productos)
    aoa.push(
      COLUMNAS.map((c) => {
        const v = p[c.campo];
        if (BOOL.includes(c.campo)) return v === undefined || v === null ? "" : v ? "SI" : "NO";
        return v ?? "";
      }),
    );
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = COLUMNAS.map((c) => ({ wch: Math.max(12, c.titulo.length + 2) }));
  const ayuda = XLSX.utils.aoa_to_sheet([["Columna", "Qué poner"], ...COLUMNAS.map((c) => [c.titulo, c.ayuda || ""])]);
  ayuda["!cols"] = [{ wch: 26 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.utils.book_append_sheet(wb, ayuda, "Instrucciones");
  XLSX.writeFile(wb, nombre);
}
