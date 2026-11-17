// Convierte el nombre de ciudad de la factura en código DANE de 8 dígitos
// (DIVIPOLA, datos.gov.co). Si el nombre existe en varios departamentos se
// usa el departamento de la sede del cliente; si aún hay duda, se reporta.
import MUNICIPIOS from "../../data/municipios.js";

export function normalizar(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\bD\s*C\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Nombres que se escriben distinto en facturas y en el DANE.
const ALIAS = {
  BOGOTA: "BOGOTA",
  "SANTAFE DE BOGOTA": "BOGOTA",
  "SANTA FE DE BOGOTA": "BOGOTA",
  CARTAGENA: "CARTAGENA DE INDIAS",
  CALI: "SANTIAGO DE CALI",
  BUGA: "GUADALAJARA DE BUGA",
  DORADA: "LA DORADA",
  UBATE: "VILLA DE SAN DIEGO DE UBATE",
  CUCUTA: "SAN JOSE DE CUCUTA",
  "SAN ANDRES": "SAN ANDRES",
  TUMACO: "SAN ANDRES DE TUMACO",
  MARIQUITA: "SAN SEBASTIAN DE MARIQUITA",
  "EL CARMEN DE VIBORAL": "EL CARMEN DE VIBORAL",
};

const INDICE = new Map();
for (const [codigo, nombre, dpto] of MUNICIPIOS) {
  const k = normalizar(nombre);
  if (!INDICE.has(k)) INDICE.set(k, []);
  INDICE.get(k).push({ codigo, nombre, departamento: dpto });
}

export function resolverMunicipio(ciudad, departamentoPista) {
  const raw = normalizar(ciudad);
  if (!raw) return { estado: "sin_dato", opciones: [] };

  // "Medellín - Antioquia" o "Neiva (Huila)"
  let nombre = raw;
  let dpto = departamentoPista ? normalizar(departamentoPista) : null;
  const partes = raw.split(/\s*[-/(|]\s*/).map((p) => p.replace(/\)$/, "").trim()).filter(Boolean);
  if (partes.length > 1) {
    nombre = partes[0];
    dpto = dpto || partes[1];
  }
  nombre = ALIAS[nombre] || nombre;

  let opciones = INDICE.get(nombre) || [];
  if (!opciones.length) {
    // Coincidencia por inicio ("BELEN DE LOS ANDAQUIES" vs abreviado)
    opciones = [...INDICE.entries()]
      .filter(([k]) => k.startsWith(nombre + " ") || nombre.startsWith(k + " "))
      .flatMap(([, v]) => v);
  }
  if (!opciones.length) return { estado: "no_encontrado", opciones: [] };

  if (opciones.length > 1 && dpto) {
    const filtradas = opciones.filter((o) => normalizar(o.departamento).startsWith(dpto) || dpto.startsWith(normalizar(o.departamento)));
    if (filtradas.length) opciones = filtradas;
  }
  if (opciones.length === 1) return { estado: "ok", ...opciones[0], opciones };
  return { estado: "ambiguo", opciones };
}

export function buscarPorCodigo(codigo) {
  const m = MUNICIPIOS.find(([c]) => c === codigo);
  return m ? { codigo: m[0], nombre: m[1], departamento: m[2] } : null;
}

export function listaMunicipios() {
  return MUNICIPIOS.map(([codigo, nombre, departamento]) => ({ codigo, nombre, departamento }));
}
