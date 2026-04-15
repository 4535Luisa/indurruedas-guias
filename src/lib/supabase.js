import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const ESTADOS = {
  en_transito: {
    label: "En tránsito",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
  },
  entregado: {
    label: "Entregado",
    color: "#AAFF00",
    bg: "#0d1f00",
    border: "#1a3300",
  },
  pendiente: {
    label: "Pendiente recogida",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
  },
  novedad: {
    label: "Con novedad",
    color: "#FF4444",
    bg: "#2a0000",
    border: "#440000",
  },
  informada: {
    label: "Informada TCC",
    color: "#888888",
    bg: "#1a1a1a",
    border: "#2e2e2e",
  },
  no_despachada: {
    label: "No despachada",
    color: "#FF8800",
    bg: "#2a1200",
    border: "#3d1a00",
  },
  anulada: {
    label: "Anulada",
    color: "#666666",
    bg: "#1a1a1a",
    border: "#2e2e2e",
  },
};

export const TRANSPORTADORAS = {
  estelar: {
    label: "Estelar Express",
    color: "#AAFF00",
    bg: "#0d1f00",
    border: "#1a3300",
  },
  tcc: { label: "TCC", color: "#AA88FF", bg: "#1a0033", border: "#2a0055" },
};

export const MAPEO_ESTADOS_TCC = {
  entregada: "entregado",
  entregado: "entregado",
  "en proceso de entrega": "en_transito",
  "en proceso de traslado": "en_transito",
  "envio en instalaciones tcc destino": "pendiente",
  "remesa informada a tcc": "informada",
  "mercancia no despachada por el remitente": "anulada",
};

export function normalizarEstadoTCC(estadoRaw) {
  if (!estadoRaw) return "en_transito";
  const lower = estadoRaw.toLowerCase().trim();
  for (const [key, val] of Object.entries(MAPEO_ESTADOS_TCC)) {
    if (lower.includes(key)) return val;
  }
  return "en_transito";
}

export const MAPEO_ESTADOS_ESTELAR = {
  aforada: "en_transito",
  aforado: "en_transito",
  despachada: "en_transito",
  despachado: "en_transito",
  muellex: "en_transito",
  transito: "en_transito",
  reparto: "en_transito",
  recibido: "en_transito",
  cumplido: "entregado",
  entregada: "entregado",
  entregado: "entregado",
  novedad: "novedad",
  devuelto: "novedad",
  devolucion: "novedad",
};

export function normalizarEstadoEstelar(raw) {
  if (!raw) return "en_transito";
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(MAPEO_ESTADOS_ESTELAR)) {
    if (lower.includes(key)) return val;
  }
  return "en_transito";
}
