// Utilidades compartilhadas pelos testes.
import { existsSync } from 'node:fs'

export const API = process.env.API_URL || 'http://localhost:8080'
export const APP = process.env.APP_URL || 'http://localhost:5173'

// Contas usadas pelos testes. Os padrões são os que `php seed.php` cria em
// desenvolvimento; em qualquer outro ambiente, passe por variável de ambiente —
// assim a senha real nunca precisa entrar no repositório.
export const CONTA_GESTOR = {
  email: process.env.TESTE_GESTOR_EMAIL || 'enfitecjunior@gmail.com',
  senha: process.env.TESTE_GESTOR_SENHA || 'enfitec123',
}
export const CONTA_MEMBRO = {
  email: process.env.TESTE_MEMBRO_EMAIL || 'felipe.baseggio@enfitecjunior.com',
  senha: process.env.TESTE_MEMBRO_SENHA || 'senha123',
}

// ---- Contagem de resultados ----
let ok = 0
let falhas = 0
const problemas = []

export function verificar(nome, condicao, detalhe = '') {
  if (condicao) {
    ok++
    console.log(`  \x1b[32mOK\x1b[0m    ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  } else {
    falhas++
    problemas.push(nome)
    console.log(`  \x1b[31mFALHA\x1b[0m ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
  return condicao
}

export function secao(titulo) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`)
}

export function encerrar() {
  console.log(`\n${ok}/${ok + falhas} verificações passaram`)
  if (falhas) {
    console.log('\nFalharam:')
    problemas.forEach((p) => console.log(`  - ${p}`))
  }
  process.exit(falhas ? 1 : 0)
}

// ---- Cliente HTTP ----
export async function chamar(caminho, { metodo = 'GET', corpo, token, cru = false } = {}) {
  const headers = {}
  if (corpo !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const resp = await fetch(API + caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (cru) return resp
  const texto = await resp.text()
  let dados = null
  try { dados = texto ? JSON.parse(texto) : null } catch { dados = texto }
  return { status: resp.status, dados }
}

export async function entrar(email, senha) {
  const r = await chamar('/auth/login-senha', { metodo: 'POST', corpo: { email, senha } })
  if (r.status !== 200) {
    throw new Error(`Login falhou para ${email}: ${JSON.stringify(r.dados)}`)
  }
  return { token: r.dados.access_token, membro: r.dados.membro }
}

// ---- Pré-condições ----
export async function exigirBackend() {
  try {
    const r = await chamar('/health')
    if (r.status !== 200) throw new Error()
  } catch {
    console.error(`\nBackend não respondeu em ${API}.`)
    console.error('Suba com:  cd backend && php -S localhost:8080 router.php\n')
    process.exit(2)
  }
}

export async function exigirFrontend() {
  try {
    const r = await fetch(APP)
    if (!r.ok) throw new Error()
  } catch {
    console.error(`\nFront não respondeu em ${APP}.`)
    console.error('Suba com:  npm run dev\n')
    process.exit(2)
  }
}

// ---- Navegador para os testes de interface ----
// Usa o Chrome ou o Edge já instalados; não baixa Chromium.
const CAMINHOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export function acharNavegador() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const achado = CAMINHOS.find((c) => existsSync(c))
  if (!achado) {
    console.error('\nNenhum Chrome ou Edge encontrado.')
    console.error('Defina CHROME_PATH apontando para o executável.\n')
    process.exit(2)
  }
  return achado
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
