import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const ESTADOS = {
  en_transito: {
    label: "En tránsito",
    color: "var(--info)",
    bg: "var(--info-bg)",
    border: "var(--info-border)",
  },
  entregado: {
    label: "Entregado",
    color: "var(--m)",
    bg: "var(--ok-bg)",
    border: "var(--ok-border)",
  },
  pendiente: {
    label: "Pendiente recogida",
    color: "var(--warn)",
    bg: "var(--warn-bg)",
    border: "var(--warn-border)",
  },
  novedad: {
    label: "Con novedad",
    color: "var(--danger)",
    bg: "var(--danger-bg)",
    border: "var(--danger-border)",
  },
  informada: {
    label: "Informada TCC",
    color: "var(--gray)",
    bg: "var(--neutral-bg)",
    border: "var(--neutral-border)",
  },
  no_despachada: {
    label: "No despachada",
    color: "var(--orange)",
    bg: "var(--orange-bg)",
    border: "var(--orange-border)",
  },
  anulada: {
    label: "Anulada",
    color: "var(--gray)",
    bg: "var(--neutral-bg)",
    border: "var(--neutral-border)",
  },
};

export const TRANSPORTADORAS = {
  estelar: {
    label: "Estelar Express",
    color: "var(--m)",
    bg: "var(--ok-bg)",
    border: "var(--ok-border)",
  },
  tcc: { label: "TCC", color: "var(--purple)", bg: "var(--purple-bg)", border: "var(--purple-border)" },
};

export const MAPEO_ESTADOS_TCC = {
  "entregada al reexpedidor": "en_transito",
  entregada: "entregado",
  entregado: "entregado",
  "en proceso de entrega": "en_transito",
  "en proceso de traslado": "en_transito",
  "env\u00edo en instalaciones tcc destino": "en_transito",
  "envio en instalaciones tcc destino": "en_transito",
  "en instalaciones tcc": "en_transito",
  "remesa informada a tcc": "novedad",
  "mercancia no despachada por el remitente": "anulada",
  "mercanc\u00eda no despachada por el remitente": "anulada",
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
