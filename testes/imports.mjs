// Verificação estática: o build do Vite NÃO acusa uma função usada sem import —
// ela vira ReferenceError só quando aquela linha executa, às vezes semanas depois.
// Este teste não precisa de servidor nem de navegador.
//
//   node testes/imports.mjs
import fs from 'node:fs'
import path from 'node:path'
import { verificar, secao, encerrar } from './ajuda.mjs'

const LIBS = fs.readdirSync('src/lib').filter((f) => f.endsWith('.js')).map((f) => 'src/lib/' + f)

const exportados = new Set()
for (const f of LIBS) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/^export (?:function|const) (\w+)/gm)) {
    exportados.add(m[1])
  }
}

const arquivos = []
;(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) anda(p)
    else if (/\.jsx?$/.test(e.name)) arquivos.push(p.split(path.sep).join('/'))
  }
})('src')

console.log(`Conferindo ${arquivos.length} arquivos contra ${exportados.size} exportações de src/lib\n`)

secao('Imports faltando')
let faltaram = 0
const semUso = []

for (const f of arquivos) {
  if (f.startsWith('src/lib/')) continue
  const fonte = fs.readFileSync(f, 'utf8')

  const importados = new Set()
  for (const m of fonte.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const parte of m[1].split(',')) importados.add(parte.trim().split(/\s+as\s+/).pop())
  }
  const corpo = fonte.replace(/^import[\s\S]*?from\s*'[^']+'\s*$/gm, '')

  for (const nome of exportados) {
    if (new RegExp('(?<![\\w.$])' + nome + '\\s*[(,)\\]}.]').test(corpo) && !importados.has(nome)) {
      verificar(`${f}: "${nome}" usado sem import`, false)
      faltaram++
    }
  }
  for (const nome of importados) {
    if (nome && !new RegExp('(?<![\\w.$])' + nome + '\\b').test(corpo)) {
      semUso.push(`${f}: "${nome}"`)
    }
  }
}
verificar('nenhuma função usada sem import', faltaram === 0)

secao('Imports sem uso (ruído, não quebra nada)')
if (semUso.length === 0) {
  verificar('nenhum import sobrando', true)
} else {
  semUso.forEach((s) => console.log(`  \x1b[33mAVISO\x1b[0m ${s}`))
  verificar('imports sem uso', true, `${semUso.length} — limpe quando puder`)
}

encerrar()
