# Indurruedas SAS — Sistema de Guías

Sistema de rastreo de guías para Estelar Express y TCC con bot automático.

---

## PASO 1 — Configurar Supabase

1. Ir a https://supabase.com y crear una cuenta gratuita
2. Crear un nuevo proyecto (ej: `indurruedas-guias`)
3. Esperar que el proyecto esté listo (~2 min)
4. Ir a **SQL Editor** y pegar todo el contenido de `supabase/schema.sql`
5. Ejecutar (botón Run)
6. Ir a **Settings → API** y copiar:
   - `Project URL` → es tu `SUPABASE_URL`
   - `anon public` → es tu `VITE_SUPABASE_ANON_KEY`
   - `service_role` → es tu `SUPABASE_SERVICE_KEY` (solo para el bot)

---

## PASO 2 — Crear usuarios en Supabase Auth

En Supabase → **Authentication → Users → Add user**:

Crear el admin:
- Email: `admin@indurruedas.com`
- Password: (la que elijas)

Luego en **SQL Editor** ejecutar:
```sql
INSERT INTO public.usuarios (id, email, nombre, rol)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@indurruedas.com'),
  'admin@indurruedas.com',
  'Administrador',
  'admin'
);
```

Repetir para cada asesor (crear en Auth y luego insertar en `public.usuarios` con `rol = 'asesor'`).

---

## PASO 3 — Configurar el proyecto en VSCode

```bash
# 1. Abrir la carpeta indurruedas en VSCode

# 2. Crear archivo .env en la raíz (copiar de .env.example)
cp .env.example .env

# 3. Editar .env con tus valores reales de Supabase
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key

# 4. Instalar dependencias
npm install

# 5. Correr en modo desarrollo
npm run dev
```

Abrir http://localhost:3000 en el navegador.

---

## PASO 4 — Importar clientes desde Excel

```bash
# Instalar dependencias adicionales
npm install dotenv

# Copiar el Excel a la raíz del proyecto
# (el archivo CLIENTES_INDURRUEDAS_2026__1_.xls)

# Agregar al .env:
SUPABASE_SERVICE_KEY=tu_service_role_key

# Ejecutar el importador
node importar-clientes.mjs
```

Esto importa los 12,541 clientes con sus sedes y asesores automáticamente.

---

## PASO 5 — Desplegar en Netlify

```bash
# 1. Subir el proyecto a GitHub (crear repo)
git init
git add .
git commit -m "primer commit"
git remote add origin https://github.com/TU_USUARIO/indurruedas-guias.git
git push -u origin main

# 2. Ir a https://netlify.com
# 3. "Add new site" → "Import from Git" → seleccionar el repo
# 4. Build command: npm run build
# 5. Publish directory: dist
# 6. En "Environment variables" agregar:
#    VITE_SUPABASE_URL
#    VITE_SUPABASE_ANON_KEY
# 7. Deploy!
```

---

## PASO 6 — Configurar el bot en GitHub Actions

En el repositorio de GitHub → **Settings → Secrets and variables → Actions**:

Agregar estos secrets:
```
GELOTRA_URL        = https://www.gelotra.com  (URL exacta de Gelotra)
GELOTRA_USER       = tu_usuario_gelotra
GELOTRA_PASS       = tu_contraseña_gelotra
SUPABASE_URL       = https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_KEY = tu_service_role_key
```

El bot correrá automáticamente:
- 🕗 8:00 AM hora Colombia (lunes a sábado)
- 🕐 1:00 PM hora Colombia
- 🕕 6:00 PM hora Colombia

Para correrlo manualmente: GitHub → Actions → "Bot Estelar Express" → "Run workflow"

---

## PASO 7 — Subir Excel TCC (cuando haya nuevas guías)

1. Descargar el Excel de remesas desde la plataforma de TCC
2. Ingresar al sistema como Admin
3. Ir a **Guías**
4. Clic en **↑ Subir Excel TCC**
5. Seleccionar el archivo .xls descargado
6. El sistema procesa automáticamente todas las guías

---

## Estructura del proyecto

```
indurruedas/
├── src/
│   ├── components/
│   │   ├── Layout.jsx       # Sidebar y topbar del admin
│   │   └── UI.jsx           # Componentes reutilizables
│   ├── context/
│   │   └── AuthContext.jsx  # Login y sesión
│   ├── lib/
│   │   └── supabase.js      # Cliente Supabase + constantes
│   ├── pages/
│   │   ├── Login.jsx        # Pantalla de login
│   │   ├── Dashboard.jsx    # Dashboard admin
│   │   ├── Guias.jsx        # Tabla de guías + carga TCC
│   │   ├── Clientes.jsx     # Gestión de clientes
│   │   └── AsesorGuias.jsx  # Vista del asesor (responsive)
│   ├── App.jsx              # Rutas
│   ├── main.jsx             # Entrada
│   └── index.css            # Estilos globales MACHO
├── bot/
│   ├── estelar-bot.js       # Bot Playwright Estelar Express
│   └── package.json
├── supabase/
│   └── schema.sql           # Tablas, RLS, triggers
├── .github/
│   └── workflows/
│       └── bot-estelar.yml  # Scheduler GitHub Actions
├── importar-clientes.mjs    # Importador Excel clientes
├── netlify.toml             # Config Netlify
├── .env.example             # Variables de entorno
└── package.json
```

---

## Soporte

- Sistema desarrollado para Indurruedas SAS / MACHO Herramientas
- Stack: React + Vite + Supabase + Playwright + GitHub Actions + Netlify
