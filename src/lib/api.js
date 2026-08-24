// Cliente da API (backend PHP). O endereço vem de VITE_API_URL (.env),
// com padrão para o servidor de desenvolvimento local.
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')

const TOKEN_KEY = 'rh:token'
const MEMBRO_KEY = 'rh:membro'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getMembro() {
  try {
    return JSON.parse(localStorage.getItem(MEMBRO_KEY) || 'null')
  } catch {
    return null
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(MEMBRO_KEY)
}

async function req(caminho, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = getToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const resp = await fetch(BASE + caminho, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (resp.status === 204) return null
  const dados = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(dados.erro || `Erro ${resp.status}`)
  }
  return dados
}

// ---- Autenticação (e-mail + senha) ----
export async function loginSenha(email, senha) {
  const sessao = await req('/auth/login-senha', { method: 'POST', body: { email, senha }, auth: false })
  localStorage.setItem(TOKEN_KEY, sessao.access_token)
  localStorage.setItem(MEMBRO_KEY, JSON.stringify(sessao.membro))
  return sessao.membro
}

export async function trocarSenha(nova_senha) {
  await req('/auth/trocar-senha', { method: 'POST', body: { nova_senha } })
  const m = getMembro()
  if (m) {
    m.senha_provisoria = false
    localStorage.setItem(MEMBRO_KEY, JSON.stringify(m))
  }
}

// ---- Registros (converte setor/atividade <-> area/tipo do front) ----
function paraFront(r) {
  return {
    id: r.id,
    data: r.data,
    area: r.setor,
    tipo: r.atividade,
    minutos: r.minutos,
    descricao: r.descricao,
  }
}

export async function listarRegistros() {
  const lista = await req('/registros')
  return lista.map(paraFront)
}

export async function criarRegistro({ data, area, tipo, minutos, descricao }) {
  const r = await req('/registros', {
    method: 'POST',
    body: { data, setor: area, atividade: tipo, minutos, descricao },
  })
  return paraFront(r)
}

export function removerRegistro(id) {
  return req(`/registros/${id}`, { method: 'DELETE' })
}

// ---- Gestão ----
export function resumoGestao(mes, setor = '') {
  const s = setor ? `&setor=${encodeURIComponent(setor)}` : ''
  return req(`/gestao/resumo?mes=${encodeURIComponent(mes)}${s}`)
}

export function analiseGestao(mes, setor = '') {
  const s = setor ? `&setor=${encodeURIComponent(setor)}` : ''
  return req(`/gestao/analise?mes=${encodeURIComponent(mes)}${s}`)
}

export function listarMembros() {
  return req('/gestao/membros')
}

export function salvarMembro({ email, nome, role, senha }) {
  return req('/gestao/membros', { method: 'POST', body: { email, nome, role, senha } })
}

export function definirAtivoMembro(id, ativo) {
  return req(`/gestao/membros/${id}/ativo`, { method: 'POST', body: { ativo } })
}
