import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Trägt Build-Version und Liste der Build-Dateien in den Service Worker ein (zuverlässige Updates) */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'unser-plan-sw',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist')
      const swPath = join(dist, 'sw.js')
      let sw = readFileSync(swPath, 'utf8')
      const assets: string[] = []
      const walk = (dir: string, prefix: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f)
          if (statSync(p).isDirectory()) walk(p, `${prefix}${f}/`)
          else assets.push(`${prefix}${f}`)
        }
      }
      try {
        walk(join(dist, 'assets'), '/assets/')
      } catch {
        /* keine Assets */
      }
      sw = sw.replace('__BUILD_VERSION__', Date.now().toString(36)).replace('__PRECACHE__', JSON.stringify(assets))
      writeFileSync(swPath, sw)
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
