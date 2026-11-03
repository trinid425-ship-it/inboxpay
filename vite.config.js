import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In production the files in /api run as Vercel functions. For local
// development this plugin runs the very same handlers inside the Vite dev
// server, so `npm run dev` is all a judge needs (plus a .env file).
function localApi() {
  return {
    name: 'inboxpay-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/api/')) return next()
        const name = path.replace(/^\/api\//, '').replace(/\/$/, '')
        if (!/^[a-z-]+$/.test(name)) { res.statusCode = 404; return res.end('Not found') }
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make .env values visible to the API handlers in dev (Vercel does this in prod).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), localApi()] }
})
