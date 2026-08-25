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
    tipo_hora: r.tipo_hora || 'tecnica',
    projeto_id: r.projeto_id ?? null,
    projeto_nome: r.projeto_nome ?? null,
    projeto_codigo: r.projeto_codigo ?? null,
    tarefa_id: r.tarefa_id ?? null,
    tarefa_titulo: r.tarefa_titulo ?? null,
    tarefa_numero: r.tarefa_numero ?? null,
  }
}

export async function listarRegistros() {
  const lista = await req('/registros')
  return lista.map(paraFront)
}

export async function criarRegistro({ data, area, tipo, minutos, descricao, tipo_hora, projeto_id, tarefa_id }) {
  const r = await req('/registros', {
    method: 'POST',
    body: {
      data, setor: area, atividade: tipo, minutos, descricao,
      tipo_hora, projeto_id, tarefa_id,
    },
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

export function salvarMembro({ email, nome, role, setor, senha }) {
  return req('/gestao/membros', { method: 'POST', body: { email, nome, role, setor, senha } })
}

export function definirAtivoMembro(id, ativo) {
  return req(`/gestao/membros/${id}/ativo`, { method: 'POST', body: { ativo } })
}

// ============================ PROJETOS ============================

// Equipe ativa (qualquer logado) — para escolher responsáveis de tarefa.
export function listarEquipe() {
  return req('/equipe')
}

export function listarProjetos() {
  return req('/projetos')
}

export function criarProjeto(dados) {
  return req('/projetos', { method: 'POST', body: dados })
}

export function obterProjeto(id) {
  return req(`/projetos/${id}`)
}

export function atualizarProjeto(id, dados) {
  return req(`/projetos/${id}`, { method: 'POST', body: dados })
}

export function removerProjeto(id) {
  return req(`/projetos/${id}`, { method: 'DELETE' })
}

export function criarStatus(projetoId, dados) {
  return req(`/projetos/${projetoId}/status`, { method: 'POST', body: dados })
}

export function removerStatus(id) {
  return req(`/status/${id}`, { method: 'DELETE' })
}

export function criarEtiqueta(projetoId, dados) {
  return req(`/projetos/${projetoId}/etiquetas`, { method: 'POST', body: dados })
}

export function criarMarco(projetoId, dados) {
  return req(`/projetos/${projetoId}/marcos`, { method: 'POST', body: dados })
}

export function definirMarco(id, concluido) {
  return req(`/marcos/${id}`, { method: 'POST', body: { concluido } })
}

export function removerMarco(id) {
  return req(`/marcos/${id}`, { method: 'DELETE' })
}

// ============================ TAREFAS ============================

export function listarTarefas(projetoId) {
  return req(`/projetos/${projetoId}/tarefas`)
}

export function criarTarefa(projetoId, dados) {
  return req(`/projetos/${projetoId}/tarefas`, { method: 'POST', body: dados })
}

export function obterTarefa(id) {
  return req(`/tarefas/${id}`)
}

export function atualizarTarefa(id, dados) {
  return req(`/tarefas/${id}`, { method: 'POST', body: dados })
}

export function removerTarefa(id) {
  return req(`/tarefas/${id}`, { method: 'DELETE' })
}

export function minhasTarefas() {
  return req('/minhas-tarefas')
}

export function historicoTarefa(id) {
  return req(`/tarefas/${id}/historico`)
}

export function criarItemChecklist(tarefaId, texto) {
  return req(`/tarefas/${tarefaId}/checklist`, { method: 'POST', body: { texto } })
}

export function marcarItemChecklist(id, feito) {
  return req(`/checklist/${id}`, { method: 'POST', body: { feito } })
}

export function removerItemChecklist(id) {
  return req(`/checklist/${id}`, { method: 'DELETE' })
}

// ============================ DOCUMENTAÇÃO ============================

export function listarDocumentos() {
  return req('/documentos')
}

export function criarDocumento(dados) {
  return req('/documentos', { method: 'POST', body: dados })
}

export function obterDocumento(id) {
  return req(`/documentos/${id}`)
}

export function salvarDocumento(id, dados) {
  return req(`/documentos/${id}`, { method: 'POST', body: dados })
}

export function removerDocumento(id) {
  return req(`/documentos/${id}`, { method: 'DELETE' })
}

export function listarVersoes(id) {
  return req(`/documentos/${id}/versoes`)
}

export function obterVersao(id) {
  return req(`/versoes/${id}`)
}

export function ligarDocumentoTarefas(id, tarefas) {
  return req(`/documentos/${id}/tarefas`, { method: 'POST', body: { tarefas } })
}

// ============================ COMENTÁRIOS ============================

export function listarComentarios(tipo, id) {
  return req(`/comentarios/${tipo}/${id}`)
}

export function comentar(tipo, id, texto) {
  return req(`/comentarios/${tipo}/${id}`, { method: 'POST', body: { texto } })
}

export function removerComentario(id) {
  return req(`/comentarios/${id}`, { method: 'DELETE' })
}

// ============================ BUSCA / OKR / PAINEL ============================

export function buscar(q) {
  return req(`/busca?q=${encodeURIComponent(q)}`)
}

export function listarObjetivos() {
  return req('/objetivos')
}

export function criarObjetivo(dados) {
  return req('/objetivos', { method: 'POST', body: dados })
}

export function criarResultado(objetivoId, dados) {
  return req(`/objetivos/${objetivoId}/resultados`, { method: 'POST', body: dados })
}

export function atualizarResultado(id, atual) {
  return req(`/resultados/${id}`, { method: 'POST', body: { atual } })
}

export function removerObjetivo(id) {
  return req(`/objetivos/${id}`, { method: 'DELETE' })
}

export function obterPainel() {
  return req('/painel')
}

// ============================ ANEXOS ============================

// A API devolve caminhos relativos já assinados; o front só prefixa o host.
export function urlApi(caminho) {
  return BASE + caminho
}

export function listarAnexos(tipo, id) {
  return req(`/anexos/${tipo}/${id}`)
}

// Upload vai como multipart, não JSON — por isso não passa por req().
// Importante: NÃO definir Content-Type à mão, senão o boundary do FormData se perde.
export async function enviarAnexo(tipo, id, arquivo) {
  const dados = new FormData()
  dados.append('arquivo', arquivo)
  const headers = {}
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`

  const resp = await fetch(`${BASE}/anexos/${tipo}/${id}`, { method: 'POST', headers, body: dados })
  const corpo = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(corpo.erro || `Erro ${resp.status}`)
  return corpo
}

export function removerAnexo(id) {
  return req(`/anexos/${id}`, { method: 'DELETE' })
}

// ============================ PERFIL ============================

export function obterPerfil() {
  return req('/perfil')
}

export function salvarPerfil(dados) {
  return req('/perfil', { method: 'POST', body: dados })
}

export function trocarSenhaPropria(senha_atual, nova_senha) {
  return req('/perfil/senha', { method: 'POST', body: { senha_atual, nova_senha } })
}

export function obterPerfilDe(id) {
  return req(`/perfil/${id}`)
}

// Nome do evento que avisa a interface de que o membro guardado mudou.
export const EVENTO_MEMBRO = 'rh:membro-mudou'

// Atualiza o membro guardado e avisa quem o exibe. O localStorage não é
// reativo: sem o evento, o cabeçalho continuaria com o nome e a foto antigos
// até a página ser recarregada.
export function atualizarMembroLocal(parcial) {
  const atual = getMembro() || {}
  const novo = { ...atual, ...parcial }
  localStorage.setItem(MEMBRO_KEY, JSON.stringify(novo))
  window.dispatchEvent(new CustomEvent(EVENTO_MEMBRO, { detail: novo }))
  return novo
}

// ============================ MENSAGENS ============================

export function listarConversas() {
  return req('/mensagens')
}

export function contarNaoLidas() {
  return req('/mensagens/nao-lidas')
}

export function abrirConversa(membroId) {
  return req(`/mensagens/${membroId}`)
}

export function enviarMensagem(membroId, texto) {
  return req(`/mensagens/${membroId}`, { method: 'POST', body: { texto } })
}

export function removerMensagem(id) {
  return req(`/mensagens/item/${id}`, { method: 'DELETE' })
}

// ============================ CRONÔMETRO ============================

// Avisa a barra flutuante de que o cronômetro começou ou parou noutra tela.
export const EVENTO_CRONOMETRO = 'rh:cronometro-mudou'

export function cronometroAtual() {
  return req('/cronometro')
}

export function iniciarCronometro(tarefaId) {
  return req(`/cronometro/${tarefaId}`, { method: 'POST' })
}

// Parar lança a hora; devolve quantos minutos foram registrados.
export function pararCronometro(dados = {}) {
  return req('/cronometro/parar', { method: 'POST', body: dados })
}

export function descartarCronometro() {
  return req('/cronometro', { method: 'DELETE' })
}

// ============================ AGENDA ============================

export function listarEventos(de, ate) {
  return req(`/eventos?de=${de}&ate=${ate}`)
}

export function criarEvento(dados) {
  return req('/eventos', { method: 'POST', body: dados })
}

export function obterEvento(id) {
  return req(`/eventos/${id}`)
}

export function atualizarEvento(id, dados) {
  return req(`/eventos/${id}`, { method: 'POST', body: dados })
}

export function removerEvento(id) {
  return req(`/eventos/${id}`, { method: 'DELETE' })
}

export function definirPresenca(id, situacao) {
  return req(`/eventos/${id}/presenca`, { method: 'POST', body: { situacao } })
}

export function definirParticipantes(id, participantes) {
  return req(`/eventos/${id}/participantes`, { method: 'POST', body: { participantes } })
}

// Compromissos e prazos de tarefa no mesmo intervalo.
export function obterAgenda(de, ate, apenasMeus = false) {
  return req(`/agenda?de=${de}&ate=${ate}${apenasMeus ? '&meus=1' : ''}`)
}

// ============================ NOTIFICAÇÕES ============================

export const EVENTO_NOTIFICACAO = 'rh:notificacao-mudou'

export function listarNotificacoes() {
  return req('/notificacoes')
}

export function contarNotificacoes() {
  return req('/notificacoes/nao-lidas')
}

// Sem id, marca todas como lidas.
export function marcarNotificacaoLida(id = null) {
  return req('/notificacoes/lidas', { method: 'POST', body: id ? { id } : {} })
}

// ============================ LIXEIRA ============================

export function listarLixeira() {
  return req('/lixeira')
}

// Exclusão definitiva — só gestor, e só do que já está na lixeira.
export function excluirDaLixeira(tipo, id) {
  return req(`/lixeira/${tipo}/${id}`, { method: 'DELETE' })
}

export function restaurarDaLixeira(tipo, id) {
  return req(`/lixeira/${tipo}/${id}/restaurar`, { method: 'POST' })
}

// ============================ EXTRAS ============================

export function duplicarProjeto(id, dados) {
  return req(`/projetos/${id}/duplicar`, { method: 'POST', body: dados })
}

export function meuRelatorio(de, ate) {
  return req(`/meu-relatorio?de=${de}&ate=${ate}`)
}

// Exportação vem como arquivo, não JSON: baixa via link assinado pelo token
// numa aba nova não funcionaria (o <a> não manda Authorization), então o
// arquivo é buscado por fetch e entregue como blob.
export async function exportarDocumentacao() {
  const resp = await fetch(`${BASE}/documentos/exportar`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!resp.ok) {
    const erro = await resp.json().catch(() => ({}))
    throw new Error(erro.erro || `Erro ${resp.status}`)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `documentacao-enfitec-${new Date().toISOString().slice(0, 10)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
