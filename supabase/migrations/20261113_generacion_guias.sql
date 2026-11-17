-- ============================================================
-- GENERACIÓN AUTOMÁTICA DE GUÍAS DESDE FACTURAS
-- Ejecutar una vez en Supabase → SQL Editor.
-- Solo CREA tablas nuevas; no modifica las existentes.
-- ============================================================

-- 1. Catálogo de medidas y pesos por referencia
create table if not exists public.productos (
  referencia            text primary key,
  descripcion           text,
  unidad_venta          text default 'UND',          -- UND, PAR, KIT, C25...
  peso_unidad_kg        numeric(10,3) not null default 0,
  unidades_por_empaque  integer not null default 1 check (unidades_por_empaque >= 1),
  tipo_empaque          text default 'CAJA',
  largo_cm              numeric(8,1),
  ancho_cm              numeric(8,1),
  alto_cm               numeric(8,1),
  peso_empaque_kg       numeric(10,3),
  mezclable             boolean not null default true,
  especial              boolean not null default false,
  nota_especial         text,
  updated_at            timestamptz default now()
);

-- 2. Configuración de envíos (una sola fila, id = 1)
create table if not exists public.config_envios (
  id          integer primary key default 1 check (id = 1),
  datos       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);
insert into public.config_envios (id) values (1) on conflict do nothing;

-- 3. Despachos: una fila por factura procesada
create table if not exists public.despachos (
  id               uuid primary key default gen_random_uuid(),
  factura          text not null,                 -- FBG-47941
  archivo_nombre   text,
  cliente_nombre   text,
  cliente_nit      text,
  ciudad           text,
  destino_dane     text,
  estado           text not null default 'revision'
                   check (estado in ('revision','lista','generada','error','anulada')),
  ambiente         text not null default 'pruebas' check (ambiente in ('pruebas','produccion')),
  transportadora   text,
  numero_remesa    text,
  url_rotulos      text,
  url_relacion     text,
  valor_flete      numeric(14,2),
  dias_estimados   integer,
  peso_cobrable_kg numeric(10,2),
  bultos           integer,
  datos_factura    jsonb,
  empaque          jsonb,
  cotizaciones     jsonb,
  excepciones      jsonb,
  solicitud        jsonb,
  respuesta        jsonb,
  error            text,
  guia_id          uuid references public.guias(id) on delete set null,
  created_by       uuid references public.usuarios(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists idx_despachos_factura on public.despachos(factura);
create index if not exists idx_despachos_estado on public.despachos(estado);
-- Nunca dos guías vigentes para la misma factura en el mismo ambiente
create unique index if not exists uq_despachos_factura_generada
  on public.despachos(factura, ambiente) where estado = 'generada';

-- updated_at automático (la función ya existe en el esquema original)
drop trigger if exists trg_despachos_updated_at on public.despachos;
create trigger trg_despachos_updated_at before update on public.despachos
  for each row execute function public.set_updated_at();
drop trigger if exists trg_productos_updated_at on public.productos;
create trigger trg_productos_updated_at before update on public.productos
  for each row execute function public.set_updated_at();

-- ============================================================
-- Seguridad: solo administradores
-- ============================================================
alter table public.productos     enable row level security;
alter table public.config_envios enable row level security;
alter table public.despachos     enable row level security;

drop policy if exists "admin_all_productos" on public.productos;
create policy "admin_all_productos" on public.productos for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

drop policy if exists "admin_all_config_envios" on public.config_envios;
create policy "admin_all_config_envios" on public.config_envios for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

drop policy if exists "admin_all_despachos" on public.despachos;
create policy "admin_all_despachos" on public.despachos for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));
