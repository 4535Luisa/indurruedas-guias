import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const ESTADOS = {
  aforada: {
    label: "Mercancia aforada",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
  },
  despachada: {
    label: "Mercancia despachada",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
  },
  en_muellex: {
    label: "En muellex",
    color: "#AA88FF",
    bg: "#1a0033",
    border: "#2a0055",
  },
  en_transito: {
    label: "En transito",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
  },
  en_reparto: {
    label: "En reparto urbano",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
  },
  recibido: {
    label: "Recibido en destino",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
  },
  entregado: {
    label: "Entregado",
    color: "#AAFF00",
    bg: "#0d1f00",
    border: "#1a3300",
  },
  novedad: {
    label: "Con novedad",
    color: "#FF4444",
    bg: "#2a0000",
    border: "#440000",
  },
  pendiente: {
    label: "Pendiente recogida",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
  },
  informada: {
    label: "Informada a TCC",
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

// Mapeo de estados TCC del Excel al sistema
export const MAPEO_ESTADOS_TCC = {
  entregada: "entregado",
  "en proceso de traslado": "en_transito",
  "envío en instalaciones tcc destino": "pendiente",
  "remesa informada a tcc": "informada",
  "mercancía no despachada por el remitente": "no_despachada",
};

export function normalizarEstadoTCC(estadoRaw) {
  if (!estadoRaw) return "en_transito";
  const lower = estadoRaw.toLowerCase().trim();
  for (const [key, val] of Object.entries(MAPEO_ESTADOS_TCC)) {
    if (lower.includes(key)) return val;
  }
  return "en_transito";
}
