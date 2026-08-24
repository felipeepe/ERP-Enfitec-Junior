// Testes da API. Não precisam de navegador — só do backend no ar.
//
// Criam os próprios dados (prefixados com [teste]) e removem no final, então
// podem rodar quantas vezes for preciso sem sujar o banco.
//
//   node testes/api.mjs
import {
  API, chamar, entrar, verificar, secao, encerrar, exigirBackend,
  CONTA_GESTOR, CONTA_MEMBRO,
} from './ajuda.mjs'

const MARCA = '[teste]'
const criados = { projetos: [], documentos: [], objetivos: [], anexos: [] }

await exigirBackend()
console.log(`Testando a API em ${API}\n`)

// ============================ Autenticação ============================
secao('Autenticação')

const saude = await chamar('/health')
verificar('/health responde ok', saude.status === 200 && saude.dados?.status === 'ok')

const gestor = await entrar(CONTA_GESTOR.email, CONTA_GESTOR.senha)
verificar('login de gestor devolve token', !!gestor.token)
verificar('login devolve o papel e a diretoria',
  gestor.membro.role === 'gestor' && 'setor' in gestor.membro)

const membro = await entrar(CONTA_MEMBRO.email, CONTA_MEMBRO.senha).catch(() => null)
if (!membro) {
  console.log('  \x1b[33mAVISO\x1b[0m membro de exemplo com outra senha — rode `php seed.php` para resetar')
}

const senhaErrada = await chamar('/auth/login-senha', {
  metodo: 'POST', corpo: { email: CONTA_GESTOR.email, senha: 'senha-que-nao-existe' },
})
verificar('senha errada devolve 401', senhaErrada.status === 401)

const inexistente = await chamar('/auth/login-senha', {
  metodo: 'POST', corpo: { email: 'ninguem@enfitecjunior.com', senha: 'x' },
})
verificar('e-mail inexistente devolve a MESMA mensagem (evita enumerar usuários)',
  inexistente.status === 401 && inexistente.dados?.erro === senhaErrada.dados?.erro)

const semToken = await chamar('/auth/me')
verificar('rota logada sem token devolve 401', semToken.status === 401)

const tokenFalso = await chamar('/auth/me', { token: 'nao.e.um.jwt' })
verificar('token inválido devolve 401', tokenFalso.status === 401)

const eu = await chamar('/auth/me', { token: gestor.token })
verificar('/auth/me devolve o usuário', eu.status === 200 && eu.dados?.role === 'gestor')

// ============================ Autorização ============================
secao('Autorização')

if (membro) {
  const proibido = await chamar('/gestao/membros', { token: membro.token })
  verificar('membro em rota de gestor devolve 403', proibido.status === 403)

  const equipe = await chamar('/equipe', { token: membro.token })
  verificar('membro consegue listar a equipe (para atribuir tarefas)', equipe.status === 200)
}

const gestaoOk = await chamar('/gestao/membros', { token: gestor.token })
verificar('gestor lista membros', gestaoOk.status === 200 && Array.isArray(gestaoOk.dados))

// ============================ Validação de entrada ============================
secao('Validação de entrada')

const mesRuim = await chamar('/gestao/resumo?mes=agosto', { token: gestor.token })
verificar('mês em formato inválido devolve 400', mesRuim.status === 400)

const semMes = await chamar('/gestao/resumo', { token: gestor.token })
verificar('mês ausente devolve 400', semMes.status === 400)

// Entradas malformadas não podem virar 500: o contrato da API é JSON.
const tipoErrado = await chamar('/projetos', { metodo: 'POST', token: gestor.token, corpo: { nome: 12345 } })
verificar('nome numérico não quebra o servidor', tipoErrado.status < 500,
  `HTTP ${tipoErrado.status}`)

const arrayOndeEsperaTexto = await chamar('/projetos', {
  metodo: 'POST', token: gestor.token, corpo: { nome: ['a', 'b'] },
})
verificar('array onde se espera texto não quebra o servidor', arrayOndeEsperaTexto.status < 500,
  `HTTP ${arrayOndeEsperaTexto.status}`)

const mesArray = await chamar('/gestao/resumo?mes[]=2026-01', { token: gestor.token })
verificar('CONHECIDO: query param como array (rota antiga, sem cast)', mesArray.status < 500,
  mesArray.status >= 500 ? 'devolve 500 — ver relatório' : `HTTP ${mesArray.status}`)

// ============================ Projetos ============================
secao('Projetos')

const novoProjeto = await chamar('/projetos', {
  metodo: 'POST', token: gestor.token,
  corpo: { nome: `${MARCA} Projeto automatizado`, setor: 'Projetos', prazo: '2026-12-31' },
})
verificar('criar projeto devolve 201', novoProjeto.status === 201)
const projetoId = novoProjeto.dados?.id
if (projetoId) criados.projetos.push(projetoId)
verificar('projeto recebe código gerado', !!novoProjeto.dados?.codigo, novoProjeto.dados?.codigo)

const semNome = await chamar('/projetos', { metodo: 'POST', token: gestor.token, corpo: {} })
verificar('projeto sem nome devolve 400', semNome.status === 400)

const detalhe = await chamar(`/projetos/${projetoId}`, { token: gestor.token })
verificar('projeto novo já vem com 4 status padrão', detalhe.dados?.status?.length === 4)
verificar('detalhe traz etiquetas e marcos', Array.isArray(detalhe.dados?.etiquetas) && Array.isArray(detalhe.dados?.marcos))

const inexistenteProj = await chamar('/projetos/999999', { token: gestor.token })
verificar('projeto inexistente devolve 404', inexistenteProj.status === 404)

// ============================ Tarefas ============================
secao('Tarefas')

const statusInicial = detalhe.dados.status[0].id
const statusFinal = detalhe.dados.status.find((s) => s.categoria === 'concluido').id

const novaTarefa = await chamar(`/projetos/${projetoId}/tarefas`, {
  metodo: 'POST', token: gestor.token,
  corpo: { titulo: `${MARCA} Tarefa automatizada`, prioridade: 'alta', prazo: '2026-10-01' },
})
verificar('criar tarefa devolve 201', novaTarefa.status === 201)
const tarefaId = novaTarefa.dados?.id
verificar('tarefa recebe número sequencial', novaTarefa.dados?.numero > 0, `#${novaTarefa.dados?.numero}`)

const semTitulo = await chamar(`/projetos/${projetoId}/tarefas`, {
  metodo: 'POST', token: gestor.token, corpo: {},
})
verificar('tarefa sem título devolve 400', semTitulo.status === 400)

const sub = await chamar(`/projetos/${projetoId}/tarefas`, {
  metodo: 'POST', token: gestor.token,
  corpo: { titulo: `${MARCA} Subtarefa`, tarefa_pai_id: tarefaId },
})
verificar('criar subtarefa devolve 201', sub.status === 201)

await chamar(`/tarefas/${tarefaId}`, {
  metodo: 'POST', token: gestor.token,
  corpo: { responsaveis: [gestor.membro.id], status_id: statusFinal },
})
const comDados = await chamar(`/tarefas/${tarefaId}`, { token: gestor.token })
verificar('responsável foi gravado', comDados.dados?.responsaveis?.length === 1)
verificar('status concluído marca a data de conclusão', !!comDados.dados?.concluida_em)
verificar('subtarefa aparece no detalhe', comDados.dados?.subtarefas?.length === 1)

const item = await chamar(`/tarefas/${tarefaId}/checklist`, {
  metodo: 'POST', token: gestor.token, corpo: { texto: 'Item de teste' },
})
verificar('criar item de checklist devolve 201', item.status === 201)
await chamar(`/checklist/${item.dados.id}`, { metodo: 'POST', token: gestor.token, corpo: { feito: true } })
const comChecklist = await chamar(`/tarefas/${tarefaId}`, { token: gestor.token })
verificar('marcar item do checklist persiste', comChecklist.dados?.itens_checklist?.[0]?.feito === true)

const historico = await chamar(`/tarefas/${tarefaId}/historico`, { token: gestor.token })
verificar('histórico registrou criação e alterações', historico.dados?.length >= 2,
  `${historico.dados?.length} evento(s)`)

const minhas = await chamar('/minhas-tarefas', { token: gestor.token })
verificar('“minhas tarefas” não traz as concluídas',
  !minhas.dados?.some((t) => t.id === tarefaId))

// ============================ Documentação ============================
secao('Documentação')

const doc = await chamar('/documentos', {
  metodo: 'POST', token: gestor.token,
  corpo: { titulo: `${MARCA} Página`, conteudo: '# Original\n\nPrimeira linha.' },
})
verificar('criar documento devolve 201', doc.status === 201)
const docId = doc.dados?.id
if (docId) criados.documentos.push(docId)

const filho = await chamar('/documentos', {
  metodo: 'POST', token: gestor.token, corpo: { titulo: `${MARCA} Subpágina`, pai_id: docId },
})
verificar('criar subpágina devolve 201', filho.status === 201)

await chamar(`/documentos/${docId}`, {
  metodo: 'POST', token: gestor.token, corpo: { conteudo: '# Original\n\nSegunda versão.' },
})
const salvoIgual = await chamar(`/documentos/${docId}`, {
  metodo: 'POST', token: gestor.token, corpo: { conteudo: '# Original\n\nSegunda versão.' },
})
verificar('salvar sem mudança NÃO cria versão nova', salvoIgual.dados?.versao_criada === false)

const versoes = await chamar(`/documentos/${docId}/versoes`, { token: gestor.token })
verificar('editar cria versão do conteúdo anterior', versoes.dados?.length === 1)

const conteudoVersao = await chamar(`/versoes/${versoes.dados[0].id}`, { token: gestor.token })
verificar('versão guarda o texto ANTERIOR, não o atual',
  conteudoVersao.dados?.conteudo?.includes('Primeira linha'))

await chamar(`/documentos/${docId}/tarefas`, {
  metodo: 'POST', token: gestor.token, corpo: { tarefas: [tarefaId] },
})
const docLigado = await chamar(`/documentos/${docId}`, { token: gestor.token })
verificar('documento liga a tarefas', docLigado.dados?.tarefas?.length === 1)
const tarefaLigada = await chamar(`/tarefas/${tarefaId}`, { token: gestor.token })
verificar('a ligação aparece dos DOIS lados', tarefaLigada.dados?.documentos?.length === 1)

// ============================ Comentários ============================
secao('Comentários')

const coment = await chamar(`/comentarios/tarefa/${tarefaId}`, {
  metodo: 'POST', token: gestor.token, corpo: { texto: `${MARCA} comentário` },
})
verificar('comentar devolve 201', coment.status === 201)

const vazio = await chamar(`/comentarios/tarefa/${tarefaId}`, {
  metodo: 'POST', token: gestor.token, corpo: { texto: '   ' },
})
verificar('comentário vazio devolve 400', vazio.status === 400)

// Regressão: o id devolvido precisa endereçar o COMENTÁRIO. Já houve um bug em
// que ele vinha da tabela de histórico, gravada logo depois na mesma requisição.
const listaComents = await chamar(`/comentarios/tarefa/${tarefaId}`, { token: gestor.token })
verificar('id devolvido ao comentar aponta para o comentário criado',
  listaComents.dados?.some((c) => c.id === coment.dados?.id),
  `devolveu ${coment.dados?.id}, existentes: ${listaComents.dados?.map((c) => c.id).join(',')}`)

if (membro) {
  const alheio = await chamar(`/comentarios/${coment.dados.id}`, { metodo: 'DELETE', token: membro.token })
  verificar('membro não apaga comentário de outro (403)', alheio.status === 403)
}

// ============================ Anexos ============================
secao('Anexos')

async function enviarArquivo(nome, conteudo, tipo = 'text/plain') {
  const form = new FormData()
  form.append('arquivo', new Blob([conteudo], { type: tipo }), nome)
  const resp = await fetch(`${API}/anexos/tarefa/${tarefaId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gestor.token}` },
    body: form,
  })
  return { status: resp.status, dados: await resp.json().catch(() => null) }
}

const anexo = await enviarArquivo('teste.txt', 'conteudo de teste')
verificar('upload devolve 201', anexo.status === 201)
if (anexo.dados?.id) criados.anexos.push(anexo.dados.id)

const proibida = await enviarArquivo('malicioso.php', '<?php echo 1;')
verificar('extensão fora da lista é recusada', proibida.status === 400, proibida.dados?.erro)

if (anexo.dados?.url) {
  // O link assinado precisa funcionar SEM o cabeçalho Authorization —
  // é para isso que ele existe: <a> e <img> não mandam cabeçalho.
  const baixado = await fetch(API + anexo.dados.url)
  verificar('link assinado baixa sem Authorization', baixado.status === 200)
  verificar('conteúdo baixado confere', (await baixado.text()) === 'conteudo de teste')

  const semChave = await fetch(`${API}/anexos/${anexo.dados.id}`)
  verificar('sem assinatura devolve 403', semChave.status === 403)

  const adulterada = await fetch(API + anexo.dados.url.slice(0, -2) + 'ff')
  verificar('assinatura adulterada devolve 403', adulterada.status === 403)

  const chave = anexo.dados.url.split('chave=')[1]
  const reuso = await fetch(`${API}/anexos/999999?chave=${chave}`)
  verificar('assinatura de um anexo não serve para outro', reuso.status === 403)
}

// ============================ Busca ============================
secao('Busca global')

const curta = await chamar('/busca?q=ab', { token: gestor.token })
verificar('busca com menos de 3 letras devolve vazio',
  curta.dados?.projetos?.length === 0 && curta.dados?.tarefas?.length === 0)

const achou = await chamar(`/busca?q=${encodeURIComponent('automatizad')}`, { token: gestor.token })
verificar('busca acha projeto e tarefa',
  achou.dados?.projetos?.length > 0 && achou.dados?.tarefas?.length > 0)
verificar('resultado de tarefa traz projeto_id (para navegar)',
  achou.dados?.tarefas?.every((t) => typeof t.projeto_id === 'number'))

// ============================ OKRs e painel ============================
secao('OKRs e painel')

const objetivo = await chamar('/objetivos', {
  metodo: 'POST', token: gestor.token, corpo: { titulo: `${MARCA} Objetivo`, periodo: '2026/2' },
})
verificar('criar objetivo devolve 201', objetivo.status === 201)
if (objetivo.dados?.id) criados.objetivos.push(objetivo.dados.id)

const kr = await chamar(`/objetivos/${objetivo.dados.id}/resultados`, {
  metodo: 'POST', token: gestor.token, corpo: { titulo: `${MARCA} KR`, alvo: 10 },
})
verificar('criar resultado-chave devolve 201', kr.status === 201)

await chamar(`/resultados/${kr.dados.id}`, { metodo: 'POST', token: gestor.token, corpo: { atual: 4 } })
const objetivos = await chamar('/objetivos', { token: gestor.token })
const meu = objetivos.dados?.find((o) => o.id === objetivo.dados.id)
verificar('atualizar o valor do KR persiste', meu?.resultados?.[0]?.atual === 4)

const painel = await chamar('/painel', { token: gestor.token })
verificar('painel devolve os agregados',
  painel.status === 200 && typeof painel.dados?.tarefas_abertas === 'number')
verificar('painel traz a carga por pessoa', Array.isArray(painel.dados?.carga))

// ============================ Tipo de hora ============================
secao('Tipo de hora e vínculo com projeto')

const horaTecnicaSemProjeto = await chamar('/registros', {
  metodo: 'POST', token: gestor.token,
  corpo: { data: '2026-08-01', setor: 'Projetos', atividade: 'Pesquisa', minutos: 60, tipo_hora: 'tecnica' },
})
verificar('hora técnica sem projeto devolve 400', horaTecnicaSemProjeto.status === 400)

const tipoInvalido = await chamar('/registros', {
  metodo: 'POST', token: gestor.token,
  corpo: { data: '2026-08-01', setor: 'Projetos', atividade: 'Pesquisa', minutos: 60, tipo_hora: 'inventado' },
})
verificar('tipo de hora inválido devolve 400', tipoInvalido.status === 400)

const horaEstudo = await chamar('/registros', {
  metodo: 'POST', token: gestor.token,
  corpo: { data: '2026-08-01', setor: 'Projetos', atividade: 'Pesquisa', minutos: 90, tipo_hora: 'estudo' },
})
verificar('hora de estudo não exige projeto', horaEstudo.status === 201)
verificar('hora não técnica não guarda projeto', horaEstudo.dados?.projeto_id === null)

const horaNaTarefa = await chamar('/registros', {
  metodo: 'POST', token: gestor.token,
  corpo: {
    data: '2026-08-01', setor: 'Projetos', atividade: 'Desenvolvimento de projeto',
    minutos: 120, tipo_hora: 'tecnica', projeto_id: projetoId, tarefa_id: tarefaId,
  },
})
verificar('hora técnica ligada a projeto e tarefa', horaNaTarefa.status === 201)
verificar('resposta traz o nome do projeto e da tarefa',
  !!horaNaTarefa.dados?.projeto_nome && !!horaNaTarefa.dados?.tarefa_titulo)

const tarefaDeOutroProjeto = await chamar('/registros', {
  metodo: 'POST', token: gestor.token,
  corpo: {
    data: '2026-08-01', setor: 'Projetos', atividade: 'Pesquisa',
    minutos: 30, tipo_hora: 'tecnica', projeto_id: projetoId, tarefa_id: 999999,
  },
})
verificar('tarefa que não é do projeto devolve 400', tarefaDeOutroProjeto.status === 400)

const projetoComHoras = await chamar(`/projetos/${projetoId}`, { token: gestor.token })
verificar('projeto soma as horas lançadas nas tarefas dele',
  projetoComHoras.dados?.minutos_lancados === 120, `${projetoComHoras.dados?.minutos_lancados} min`)

for (const r of [horaEstudo, horaNaTarefa]) {
  if (r.dados?.id) await chamar(`/registros/${r.dados.id}`, { metodo: 'DELETE', token: gestor.token })
}

// ============================ Cronômetro ============================
secao('Cronômetro de tarefa')

const semCron = await chamar('/cronometro', { token: gestor.token })
verificar('sem cronômetro devolve null', semCron.dados === null)

const iniciado = await chamar(`/cronometro/${tarefaId}`, { metodo: 'POST', token: gestor.token })
verificar('iniciar devolve 201', iniciado.status === 201)

const rodando = await chamar('/cronometro', { token: gestor.token })
verificar('cronômetro aparece rodando', rodando.dados?.tarefa_id === tarefaId)
verificar('devolve os segundos contados pelo SERVIDOR (relógio do cliente pode estar torto)',
  typeof rodando.dados?.segundos === 'number')
verificar('traz o código da tarefa para a barra flutuante', !!rodando.dados?.codigo)

// Começar noutra tarefa substitui: uma pessoa só tem um cronômetro.
const subId = (await chamar(`/projetos/${projetoId}/tarefas`, { token: gestor.token }))
  .dados.find((t) => t.id !== tarefaId)?.id
if (subId) {
  await chamar(`/cronometro/${subId}`, { metodo: 'POST', token: gestor.token })
  const trocado = await chamar('/cronometro', { token: gestor.token })
  verificar('iniciar noutra tarefa substitui o anterior', trocado.dados?.tarefa_id === subId)
}

const parado = await chamar('/cronometro/parar', { metodo: 'POST', token: gestor.token, corpo: {} })
verificar('parar com menos de um minuto não lança hora', parado.dados?.registrado === false)
verificar('parar limpa o cronômetro',
  (await chamar('/cronometro', { token: gestor.token })).dados === null)

const pararSemNada = await chamar('/cronometro/parar', { metodo: 'POST', token: gestor.token, corpo: {} })
verificar('parar sem cronômetro devolve 404', pararSemNada.status === 404)

await chamar(`/cronometro/${tarefaId}`, { metodo: 'POST', token: gestor.token })
const descartou = await chamar('/cronometro', { metodo: 'DELETE', token: gestor.token })
verificar('descartar devolve 204', descartou.status === 204)

if (membro) {
  const alheio = await chamar(`/cronometro/999999`, { metodo: 'POST', token: membro.token })
  verificar('não dá para cronometrar tarefa fora do escopo', alheio.status === 404)
}

// ============================ Discussão de projeto ============================
secao('Discussão de projeto')

const discussao = await chamar(`/comentarios/projeto/${projetoId}`, {
  metodo: 'POST', token: gestor.token, corpo: { texto: `${MARCA} debate do projeto` },
})
verificar('comentar num projeto devolve 201', discussao.status === 201)

const lidos = await chamar(`/comentarios/projeto/${projetoId}`, { token: gestor.token })
verificar('discussão do projeto é listada', lidos.dados?.length === 1)
verificar('comentário traz dados do avatar de quem escreveu',
  'cor_avatar' in (lidos.dados?.[0] || {}) && 'membro_apelido' in (lidos.dados?.[0] || {}))

// ============================ Perfil ============================
secao('Perfil')

const perfil = await chamar('/perfil', { token: gestor.token })
verificar('perfil próprio carrega', perfil.status === 200 && perfil.dados?.email === CONTA_GESTOR.email)

const salvo = await chamar('/perfil', {
  metodo: 'POST', token: gestor.token,
  corpo: { apelido: 'Gestão', bio: 'Conta de teste', cor_avatar: '#1565c0' },
})
verificar('salvar perfil devolve o perfil atualizado', salvo.dados?.apelido === 'Gestão')

const fotoRuim = await chamar('/perfil', {
  metodo: 'POST', token: gestor.token, corpo: { foto: '<svg onload=alert(1)>' },
})
verificar('foto que não é data URI de imagem é recusada', fotoRuim.status === 400)

const fotoGigante = await chamar('/perfil', {
  metodo: 'POST', token: gestor.token,
  corpo: { foto: 'data:image/png;base64,' + 'A'.repeat(400 * 1024) },
})
verificar('foto acima do limite é recusada', fotoGigante.status === 400)

const senhaErradaPerfil = await chamar('/perfil/senha', {
  metodo: 'POST', token: gestor.token,
  corpo: { senha_atual: 'nao-e-essa', nova_senha: 'outrasenha' },
})
verificar('trocar senha com a atual errada devolve 403', senhaErradaPerfil.status === 403)

// Restaura o perfil para não deixar rastro do teste.
await chamar('/perfil', {
  metodo: 'POST', token: gestor.token,
  corpo: { apelido: '', bio: '', cor_avatar: '' },
})

// ============================ Mensagens ============================
secao('Mensagens diretas')

if (membro) {
  const enviada = await chamar(`/mensagens/${membro.membro.id}`, {
    metodo: 'POST', token: gestor.token, corpo: { texto: `${MARCA} olá` },
  })
  verificar('enviar mensagem devolve 201', enviada.status === 201)

  const paraSiMesmo = await chamar(`/mensagens/${gestor.membro.id}`, {
    metodo: 'POST', token: gestor.token, corpo: { texto: 'eu comigo' },
  })
  verificar('mensagem para si mesmo devolve 400', paraSiMesmo.status === 400)

  const vaziaMsg = await chamar(`/mensagens/${membro.membro.id}`, {
    metodo: 'POST', token: gestor.token, corpo: { texto: '  ' },
  })
  verificar('mensagem vazia devolve 400', vaziaMsg.status === 400)

  const pendentes = await chamar('/mensagens/nao-lidas', { token: membro.token })
  verificar('destinatário vê a mensagem como não lida', pendentes.dados?.total > 0)

  const conversa = await chamar(`/mensagens/${gestor.membro.id}`, { token: membro.token })
  verificar('conversa traz as mensagens dos dois lados', conversa.dados?.mensagens?.length > 0)
  verificar('cada mensagem sabe de quem é',
    conversa.dados?.mensagens?.every((x) => typeof x.minha === 'boolean'))

  const depoisDeLer = await chamar('/mensagens/nao-lidas', { token: membro.token })
  verificar('abrir a conversa zera o não lido', depoisDeLer.dados?.total === 0)

  const alheia = await chamar(`/mensagens/item/${enviada.dados.id}`, { metodo: 'DELETE', token: membro.token })
  verificar('não dá para apagar mensagem de outra pessoa (403)', alheia.status === 403)

  await chamar(`/mensagens/item/${enviada.dados.id}`, { metodo: 'DELETE', token: gestor.token })
}

// ============================ Força bruta ============================
secao('Freio contra tentativa em massa')

// E-mail inexistente de propósito: travar uma conta real atrapalharia o resto.
const alvo = `forca.bruta.${Date.now()}@example.com`
let ultimoStatus = 0
for (let i = 0; i < 6; i++) {
  const r = await chamar('/auth/login-senha', { metodo: 'POST', corpo: { email: alvo, senha: 'chute' } })
  ultimoStatus = r.status
}
verificar('a 6ª tentativa seguida é barrada com 429', ultimoStatus === 429)

const outraConta = await chamar('/auth/login-senha', {
  metodo: 'POST', corpo: { email: CONTA_GESTOR.email, senha: CONTA_GESTOR.senha },
})
verificar('o bloqueio é por e-mail e não derruba as outras contas', outraConta.status === 200)

// ============================ Limpeza ============================
secao('Limpeza')

for (const id of criados.anexos) await chamar(`/anexos/${id}`, { metodo: 'DELETE', token: gestor.token })
for (const id of criados.objetivos) await chamar(`/objetivos/${id}`, { metodo: 'DELETE', token: gestor.token })
for (const id of criados.documentos) await chamar(`/documentos/${id}`, { metodo: 'DELETE', token: gestor.token })
for (const id of criados.projetos) await chamar(`/projetos/${id}`, { metodo: 'DELETE', token: gestor.token })

const sobrou = await chamar(`/busca?q=${encodeURIComponent('automatizad')}`, { token: gestor.token })
verificar('dados de teste foram removidos',
  sobrou.dados?.projetos?.length === 0 && sobrou.dados?.tarefas?.length === 0)

encerrar()
