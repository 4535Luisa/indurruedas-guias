import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo (`npm run dev`) atiende /.netlify/functions/* con los mismos
// archivos de netlify/functions, para no depender de Netlify CLI.
// En producción Netlify sirve las funciones directamente; esto no se usa.
function funcionesNetlifyLocal(env) {
  return {
    name: 'funciones-netlify-local',
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v
      server.middlewares.use('/.netlify/functions', async (req, res) => {
        const nombre = (req.url || '').split('?')[0].replace(/^\//, '')
        try {
          const mod = await server.ssrLoadModule(`/netlify/functions/${nombre}.mjs`)
          const chunks = []
          for await (const c of req) chunks.push(c)
          const request = new Request(`http://localhost/.netlify/functions/${nombre}`, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
          })
          const r = await mod.default(request)
          res.statusCode = r.status
          r.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await r.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `Función ${nombre}: ${e.message}` }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), funcionesNetlifyLocal(loadEnv(mode, process.cwd(), ''))],
  server: { port: 3000 },
}))
