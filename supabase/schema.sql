-- ============================================================
-- INDURRUEDAS SAS — Esquema de base de datos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. USUARIOS / ASESORES
create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  nombre text not null,
  rol text not null check (rol in ('admin', 'asesor')),
  activo boolean default true,
  created_at timestamptz default now()
);

-- 2. CLIENTES
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nit text not null,
  nombre text not null,
  asesor_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. SEDES (un cliente puede tener varias)
create table public.sedes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre_establecimiento text,
  ciudad text,
  departamento text,
  direccion text,
  principal boolean default false,
  created_at timestamptz default now()
);

-- 4. GUÍAS
create table public.guias (
  id uuid primary key default gen_random_uuid(),
  numero_guia text unique not null,
  transportadora text not null check (transportadora in ('estelar', 'tcc')),
  factura_indurruedas text,
  cliente_id uuid references public.clientes(id) on delete set null,
  sede_id uuid references public.sedes(id) on delete set null,
  destinatario text,
  ciudad_destino text,
  direccion_entrega text,
  origen text,
  estado text not null default 'en_transito',
  fecha_guia date,
  fecha_entrega timestamptz,
  dias_habiles integer,
  dias_activa integer generated always as (
    extract(day from now() - fecha_guia::timestamptz)::integer
  ) stored,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. HISTORIAL DE ESTADOS
create table public.historial_estados (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references public.guias(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  fuente text default 'bot' check (fuente in ('bot', 'manual', 'excel_tcc')),
  created_at timestamptz default now()
);

-- 6. SYNC LOG (registro de sincronizaciones del bot)
create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  transportadora text not null,
  guias_nuevas integer default 0,
  guias_actualizadas integer default 0,
  errores integer default 0,
  detalle jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- ÍNDICES para rendimiento
-- ============================================================
create index idx_guias_estado on public.guias(estado);
create index idx_guias_transportadora on public.guias(transportadora);
create index idx_guias_activa on public.guias(activa);
create index idx_guias_cliente on public.guias(cliente_id);
create index idx_sedes_cliente on public.sedes(cliente_id);
create index idx_clientes_asesor on public.clientes(asesor_id);
create index idx_clientes_nit on public.clientes(nit);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.usuarios enable row level security;
alter table public.clientes enable row level security;
alter table public.sedes enable row level security;
alter table public.guias enable row level security;
alter table public.historial_estados enable row level security;
alter table public.sync_log enable row level security;

-- Admins ven todo
create policy "admin_all_usuarios" on public.usuarios
  for all using (
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy "admin_all_clientes" on public.clientes
  for all using (
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy "admin_all_sedes" on public.sedes
  for all using (
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy "admin_all_guias" on public.guias
  for all using (
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy "admin_all_historial" on public.historial_estados
  for all using (
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

create policy "admin_all_sync" on public.sync_log
  for all using (
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

-- Asesores solo ven sus clientes y sus guías
create policy "asesor_sus_clientes" on public.clientes
  for select using (
    asesor_id = auth.uid()
  );

create policy "asesor_sus_sedes" on public.sedes
  for select using (
    exists (
      select 1 from public.clientes c
      where c.id = sedes.cliente_id and c.asesor_id = auth.uid()
    )
  );

create policy "asesor_sus_guias" on public.guias
  for select using (
    exists (
      select 1 from public.clientes c
      where c.id = guias.cliente_id and c.asesor_id = auth.uid()
    )
  );

create policy "asesor_sus_historial" on public.historial_estados
  for select using (
    exists (
      select 1 from public.guias g
      join public.clientes c on c.id = g.cliente_id
      where g.id = historial_estados.guia_id and c.asesor_id = auth.uid()
    )
  );

-- Asesor puede ver su propio perfil
create policy "asesor_su_perfil" on public.usuarios
  for select using (id = auth.uid());

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_guias_updated_at
  before update on public.guias
  for each row execute function public.set_updated_at();

-- ============================================================
-- FUNCIÓN: registrar historial al cambiar estado
-- ============================================================
create or replace function public.registrar_cambio_estado()
returns trigger as $$
begin
  if old.estado is distinct from new.estado then
    insert into public.historial_estados(guia_id, estado_anterior, estado_nuevo, fuente)
    values(new.id, old.estado, new.estado, 'bot');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_historial_estado
  after update on public.guias
  for each row execute function public.registrar_cambio_estado();
