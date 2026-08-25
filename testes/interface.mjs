// Testes de interface num Chrome/Edge real. Percorre as três seções, cria
// dados pela tela e confere que a interação funciona de ponta a ponta.
//
//   node testes/interface.mjs            (sem janela)
//   node testes/interface.mjs --ver      (abre a janela para acompanhar)
//   node testes/interface.mjs --fotos    (salva capturas em testes/capturas/)
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import {
  APP, acharNavegador, verificar, secao, encerrar,
  exigirBackend, exigirFrontend, esperar, chamar, entrar,
  CONTA_GESTOR, CONTA_MEMBRO,
} from './ajuda.mjs'

const VER = process.argv.includes('--ver')
const FOTOS = process.argv.includes('--fotos')
const PASTA = 'testes/capturas'
if (FOTOS) mkdirSync(PASTA, { recursive: true })

await exigirBackend()
await exigirFrontend()

// A suíte trabalha em cima dos PRÓPRIOS dados e apaga tudo no final, para poder
// rodar quantas vezes for preciso sem encher o sistema de lixo de teste.
const sessao = await entrar(CONTA_GESTOR.email, CONTA_GESTOR.senha)
const criados = { projetos: [], documentos: [] }

const PAGINA_TESTE = `[ui] Página ${Date.now() % 100000}`
const docCriado = await chamar('/documentos', {
  metodo: 'POST', token: sessao.token,
  corpo: {
    titulo: PAGINA_TESTE,
    conteudo: '# Página de teste\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```',
  },
})
criados.documentos.push(docCriado.dados.id)
// Uma segunda gravação garante que já exista histórico para o diff comparar.
await chamar(`/documentos/${docCriado.dados.id}`, {
  metodo: 'POST', token: sessao.token,
  corpo: { conteudo: '# Página de teste\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(2)\n```\n\nSegunda versão.' },
})

const TEXTO_MSG = 'Mensagem enviada pelo teste'

async function limpar() {
  rmSync('testes/.tmp-anexo.txt', { force: true })
  // Cronômetro deixado rodando por um teste interrompido lançaria hora falsa.
  await chamar('/cronometro', { metodo: 'DELETE', token: sessao.token }).catch(() => {})

  // Apaga as mensagens que esta execução enviou, senão o chat vai acumulando
  // uma cópia a cada rodada da suíte.
  try {
    const conversas = await chamar('/mensagens', { token: sessao.token })
    for (const c of conversas.dados || []) {
      const thread = await chamar(`/mensagens/${c.membro.id}`, { token: sessao.token })
      for (const msg of thread.dados?.mensagens || []) {
        if (msg.minha && msg.texto === TEXTO_MSG) {
          await chamar(`/mensagens/item/${msg.id}`, { metodo: 'DELETE', token: sessao.token })
        }
      }
    }
  } catch { /* limpeza é melhor-esforço */ }
  // Remover manda para a lixeira; excluir de vez tira de lá. Sem o segundo
  // passo, cada execução da suíte deixaria mais entulho acumulado para sempre.
  for (const id of criados.documentos) {
    await chamar(`/documentos/${id}`, { metodo: 'DELETE', token: sessao.token }).catch(() => {})
    await chamar(`/lixeira/documento/${id}`, { metodo: 'DELETE', token: sessao.token }).catch(() => {})
  }
  for (const id of criados.projetos) {
    await chamar(`/projetos/${id}`, { metodo: 'DELETE', token: sessao.token }).catch(() => {})
    await chamar(`/lixeira/projeto/${id}`, { metodo: 'DELETE', token: sessao.token }).catch(() => {})
  }
}

const errosPagina = []
const navegador = await puppeteer.launch({
  executablePath: acharNavegador(),
  headless: VER ? false : 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const pagina = await navegador.newPage()
await pagina.setViewport({ width: 1600, height: 1000 })
await pagina.setDragInterception(true)
pagina.on('console', (m) => { if (m.type() === 'error') errosPagina.push('console: ' + m.text()) })
pagina.on('pageerror', (e) => errosPagina.push('exceção: ' + e.message))
// confirm() e alert() travam o puppeteer se ninguém responder.
pagina.on('dialog', (d) => d.accept().catch(() => {}))

const foto = async (nome) => { if (FOTOS) await pagina.screenshot({ path: `${PASTA}/${nome}.png` }) }
// Clica no botão cujo texto bate — mais legível que decorar seletores.
const clicarTexto = (seletor, texto) =>
  pagina.evaluate((s, t) => {
    const b = [...document.querySelectorAll(s)].find((x) => x.textContent.trim() === t)
    if (b) b.click()
    return !!b
  }, seletor, texto)

console.log(`Testando a interface em ${APP}\n`)

try {
  // ============================ Login ============================
  secao('Login e navegação')
  await pagina.goto(APP, { waitUntil: 'networkidle2' })
  verificar('tela de login carrega', !!(await pagina.$('input[type="email"]')))

  await pagina.type('input[type="email"]', CONTA_GESTOR.email)
  await pagina.type('input[type="password"]', CONTA_GESTOR.senha)
  await pagina.click('button[type="submit"]')
  await esperar(2200)
  verificar('login leva ao Painel de Horas', pagina.url().includes('/horas'))

  // Verifica as seções pelo nome, não pela contagem: a cada seção nova a
  // asserção por número quebrava sem que nada estivesse errado.
  const abas = await pagina.$$eval('.topnav-item', (n) => n.map((x) => x.textContent.trim()))
  const esperadas = ['Painel de Horas', 'Projetos', 'Documentação', 'Agenda', 'Mensagens']
  const faltando = esperadas.filter((e) => !abas.some((a) => a.startsWith(e)))
  verificar('menu traz todas as seções', faltando.length === 0,
    faltando.length ? `faltam: ${faltando.join(', ')}` : abas.join(' | '))
  verificar('busca global está no topo', !!(await pagina.$('.busca-campo')))
  await foto('01-horas')

  // ============================ Projetos ============================
  secao('Projetos')
  await pagina.goto(APP + '/projetos', { waitUntil: 'networkidle2' })
  await esperar(1600)
  verificar('indicadores da equipe carregam', (await pagina.$$('.stats--quatro .stat-card')).length === 4)

  await clicarTexto('button', '+ Novo projeto')
  await esperar(600)

  // Digita no campo de NOME explicitamente. Usar o primeiro input do formulário
  // já deixou 20 projetos chamados "12345" no banco: o texto caiu noutro campo
  // e a limpeza no fim não reconhecia o nome.
  const NOME_PROJETO = `[ui] Projeto ${Date.now() % 100000}`
  const campoNome = await pagina.$('.form-projeto input[placeholder*="Braço"], .form-projeto input')
  await campoNome.click({ clickCount: 3 })
  await campoNome.type(NOME_PROJETO)
  verificar('nome do projeto foi digitado no campo certo',
    (await pagina.$eval('.form-projeto input', (n) => n.value)) === NOME_PROJETO)

  await clicarTexto('.form-projeto button', 'Criar projeto')
  await esperar(2200)
  verificar('criar projeto pela tela abre o projeto', /\/projetos\/\d+/.test(pagina.url()), pagina.url())
  const idProjeto = Number(pagina.url().match(/\/projetos\/(\d+)/)?.[1])
  if (idProjeto) criados.projetos.push(idProjeto)

  // ============================ Kanban ============================
  secao('Quadro kanban')
  const colunas = await pagina.$$('.kanban-coluna')
  verificar('quadro traz as 4 colunas padrão', colunas.length === 4)
  verificar('4ª coluna cabe na tela sem corte', await pagina.evaluate(() => {
    const cols = [...document.querySelectorAll('.kanban-coluna')]
    return cols[cols.length - 1].getBoundingClientRect().right <= window.innerWidth
  }))

  await pagina.click('.kanban-coluna .kanban-adicionar')
  await esperar(400)
  await pagina.type('.cartao-novo .input', 'Tarefa criada pelo teste')
  await pagina.click('.cartao-novo button[type="submit"]')
  await esperar(1800)
  verificar('criar tarefa pela tela', (await pagina.$$('.cartao')).length === 1)

  // Arrastar de verdade — HTML5 drag and drop, não só chamada de API.
  const cartao = await pagina.$('.cartao')
  const todas = await pagina.$$('.kanban-coluna')
  const destino = todas[todas.length - 1]
  const cx = await cartao.boundingBox()
  const dx = await destino.boundingBox()
  const alvo = { x: dx.x + dx.width / 2, y: dx.y + 80 }
  const dados = await pagina.mouse.drag({ x: cx.x + cx.width / 2, y: cx.y + cx.height / 2 }, alvo)
  await pagina.mouse.dragEnter(alvo, dados)
  await pagina.mouse.dragOver(alvo, dados)
  await pagina.mouse.drop(alvo, dados)
  await pagina.mouse.up().catch(() => {})
  await esperar(2000)

  const naUltima = () => pagina.evaluate(() => {
    const cols = [...document.querySelectorAll('.kanban-coluna')]
    return cols[cols.length - 1].querySelectorAll('.cartao').length
  })
  verificar('arrastar cartão entre colunas', (await naUltima()) === 1)
  await pagina.reload({ waitUntil: 'networkidle2' })
  await esperar(2000)
  verificar('o movimento persiste depois de recarregar', (await naUltima()) === 1)
  await foto('02-kanban')

  // ============================ Painel do projeto ============================
  secao('Painel do projeto')
  await clicarTexto('.alternador button', 'Painel')
  await esperar(1400)
  verificar('painel mostra os 4 indicadores', (await pagina.$$('.stats--quatro .stat-card')).length === 4)
  verificar('painel desenha os gráficos', (await pagina.$$('.grafico')).length >= 3)
  verificar('quadro fica oculto no modo painel',
    await pagina.$eval('.kanban', (n) => n.hasAttribute('hidden')))
  await foto('03-painel-projeto')

  await clicarTexto('.alternador button', 'Quadro')
  await esperar(800)
  verificar('quadro volta ao alternar de novo',
    !(await pagina.$eval('.kanban', (n) => n.hasAttribute('hidden'))))

  // ============================ Painel da tarefa ============================
  secao('Painel da tarefa')
  await pagina.click('.cartao')
  await esperar(1600)
  verificar('painel lateral abre', !!(await pagina.$('.drawer')))

  const campos = await pagina.$$eval('.drawer .field-label', (n) => n.map((x) => x.textContent.trim()))
  for (const esperado of ['Status', 'Prioridade', 'Prazo', 'Responsáveis', 'Checklist', 'Subtarefas', 'Anexos']) {
    verificar(`campo "${esperado}" presente`, campos.some((c) => c.startsWith(esperado)))
  }

  // Anexo pela interface
  const arquivo = 'testes/.tmp-anexo.txt'
  writeFileSync(arquivo, 'arquivo enviado pelo teste de interface')
  const inputArquivo = await pagina.$('.enviar-arquivo input[type="file"]')
  await inputArquivo.uploadFile(arquivo)
  await esperar(2500)
  verificar('upload de anexo pela tela', (await pagina.$$('.anexos li')).length === 1)
  verificar('link do anexo vem assinado',
    (await pagina.$eval('.anexo-nome', (a) => a.getAttribute('href'))).includes('chave='))
  await foto('04-tarefa')

  await pagina.keyboard.press('Escape')
  await esperar(700)
  verificar('Esc fecha o painel', !(await pagina.$('.drawer')))

  // ============================ Documentação ============================
  secao('Documentação')
  await pagina.goto(APP + '/documentacao', { waitUntil: 'networkidle2' })
  await esperar(1600)
  const ramos = await pagina.$$('.ramo')
  verificar('árvore de páginas renderiza', ramos.length > 0, `${ramos.length} página(s)`)

  // Abre a página criada por esta execução, não a primeira da árvore —
  // assim o teste não depende do conteúdo real da documentação da EJ.
  const abriu = await pagina.evaluate((titulo) => {
    const b = [...document.querySelectorAll('.ramo-titulo')]
      .find((x) => x.textContent.includes(titulo))
    if (b) b.click()
    return !!b
  }, PAGINA_TESTE)
  verificar('encontra a página criada pelo teste', abriu)

  if (abriu) {
    await esperar(1500)
    verificar('markdown renderizado', !!(await pagina.$('.markdown h1')))
    verificar('tabela do markdown renderiza', !!(await pagina.$('.markdown table')))
    verificar('bloco de código renderiza', !!(await pagina.$('.markdown pre')))

    await clicarTexto('.doc-acoes button', 'Editar')
    await esperar(700)
    await pagina.type('.editor-texto', '\n\nLinha do teste automatizado.')
    await esperar(500)
    verificar('pré-visualização acompanha a digitação',
      await pagina.$eval('.editor-preview', (n) => n.innerHTML.includes('teste automatizado')))

    await clicarTexto('.doc-acoes button', 'Salvar')
    await esperar(2000)
    verificar('texto salvo aparece renderizado',
      await pagina.$eval('.doc-conteudo .markdown', (n) => n.innerHTML.includes('teste automatizado')))

    await clicarTexto('.doc-acoes button', 'Histórico')
    await esperar(1500)
    const versoes = await pagina.$$('.versao-linha')
    verificar('histórico lista as versões', versoes.length > 0, `${versoes.length} versão(ões)`)
    if (versoes.length) {
      await versoes[versoes.length - 1].click()
      await esperar(1500)
      verificar('diff mostra linhas', (await pagina.$$('.diff-linha')).length > 0)
      verificar('diff marca o que entrou e saiu', await pagina.$$eval('.diff-linha',
        (n) => n.some((x) => x.classList.contains('entrou') || x.classList.contains('saiu'))))
      await foto('05-diff')
    }
    await pagina.keyboard.press('Escape').catch(() => {})
  }

  // ============================ Busca global ============================
  secao('Busca global')
  await pagina.click('.busca-campo')
  await pagina.type('.busca-campo', 'projeto')
  await esperar(1400)
  verificar('busca devolve resultados', (await pagina.$$('.busca-item')).length > 0)
  await foto('06-busca')

  // ============================ Vistas: lista e calendário ============================
  secao('Vistas do projeto')
  // A seção anterior terminou na Documentação; volta para o projeto.
  await pagina.goto(APP + `/projetos/${idProjeto}`, { waitUntil: 'networkidle2' })
  await esperar(1800)

  // Dá prazo à tarefa para ela ter onde aparecer no calendário.
  const daqui = new Date()
  daqui.setDate(daqui.getDate() + 3)
  const prazoTeste = daqui.toISOString().slice(0, 10)
  const doProjeto = await chamar(`/projetos/${idProjeto}/tarefas`, { token: sessao.token })
  for (const t of doProjeto.dados || []) {
    await chamar(`/tarefas/${t.id}`, { metodo: 'POST', token: sessao.token, corpo: { prazo: prazoTeste } })
  }
  await pagina.reload({ waitUntil: 'networkidle2' })
  await esperar(1800)

  await clicarTexto('.alternador button', 'Lista')
  await esperar(1400)
  verificar('vista em lista renderiza a tabela', !!(await pagina.$('.tabela-lista')))
  verificar('lista vem agrupada por status', (await pagina.$$('.linha-grupo')).length > 0)

  const primeiraAntes = await pagina.$eval('.linha-tarefa-lista', (n) => n.textContent)
  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.th-ordenar')].find((x) => x.textContent.startsWith('Tarefa'))
    b.click()
  })
  await esperar(700)
  verificar('clicar no cabeçalho reordena',
    (await pagina.$eval('.linha-tarefa-lista', (n) => n.textContent)) !== primeiraAntes
    || (await pagina.$$('.linha-tarefa-lista')).length === 1, 'ou só há uma tarefa')

  await pagina.select('.panel-head select', 'responsavel')
  await esperar(700)
  verificar('trocar o agrupamento refaz os grupos', (await pagina.$$('.linha-grupo')).length > 0)
  await foto('11-lista')

  await clicarTexto('.alternador button', 'Calendário')
  await esperar(1400)
  verificar('calendário desenha a grade do mês', (await pagina.$$('.cal-dia')).length >= 28)
  verificar('cabeçalho tem os sete dias', (await pagina.$$('.cal-cabecalho')).length === 7)
  verificar('marca o dia de hoje', !!(await pagina.$('.cal-dia.e-hoje')))
  const noCalendario = await pagina.$$('.cal-tarefa')
  verificar('tarefas com prazo aparecem na grade', noCalendario.length > 0, `${noCalendario.length}`)
  await foto('12-calendario')

  await clicarTexto('.alternador button', 'Quadro')
  await esperar(900)

  // ============================ Kanban em tela de toque ============================
  secao('Kanban no celular')
  await pagina.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await esperar(1200)

  const moverVisivel = await pagina.evaluate(() => {
    const el = document.querySelector('.cartao-mover')
    return el ? getComputedStyle(el).display !== 'none' : false
  })
  verificar('botões de mover aparecem em tela estreita', moverVisivel)
  verificar('colunas empilham em vez de rolar na horizontal',
    await pagina.evaluate(() => getComputedStyle(document.querySelector('.kanban')).flexDirection === 'column'))

  const statusAntes = await pagina.$eval('.cartao-mover-status', (n) => n.textContent.trim())
  // Usa a direção que estiver disponível: a tarefa pode já estar na primeira ou
  // na última coluna, e aí o botão daquele lado está corretamente desabilitado.
  const clicou = await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.cartao-mover button')].find((x) => !x.disabled)
    if (b) b.click()
    return !!b
  })
  verificar('há uma direção possível para mover', clicou)
  await esperar(1800)
  await pagina.reload({ waitUntil: 'networkidle2' })
  await esperar(1800)
  const statusDepois = await pagina.$eval('.cartao-mover-status', (n) => n.textContent.trim())
  verificar('mover pelo botão troca de coluna e persiste',
    statusDepois !== statusAntes, `${statusAntes} → ${statusDepois}`)
  await foto('13-kanban-celular')

  await pagina.setViewport({ width: 1600, height: 1000, isMobile: false, hasTouch: false })
  await esperar(900)

  // ============================ Cronômetro ============================
  secao('Cronômetro')
  await pagina.goto(APP + `/projetos/${idProjeto}`, { waitUntil: 'networkidle2' })
  await esperar(1600)
  await pagina.click('.cartao')
  await esperar(1600)

  await clicarTexto('.drawer-acoes button', '▶ Iniciar')
  await esperar(1800)
  verificar('barra do cronômetro aparece', !!(await pagina.$('.barra-cronometro')))
  verificar('barra mostra o relógio correndo',
    /\d{2}:\d{2}/.test(await pagina.$eval('.cron-tempo', (n) => n.textContent)))
  verificar('painel da tarefa indica que está contando', !!(await pagina.$('.cron-nesta')))
  await foto('14-cronometro')

  // Fecha o drawer e confirma que a barra segue em outra tela.
  await pagina.keyboard.press('Escape')
  await esperar(600)
  await pagina.goto(APP + '/documentacao', { waitUntil: 'networkidle2' })
  await esperar(1600)
  verificar('cronômetro continua visível ao trocar de seção', !!(await pagina.$('.barra-cronometro')))

  await clicarTexto('.barra-cronometro button', 'Descartar')
  await esperar(1400)
  verificar('descartar some com a barra', !(await pagina.$('.barra-cronometro')))

  // ============================ Filtros e discussão do quadro ============================
  secao('Filtros e discussão do projeto')
  await pagina.goto(APP + `/projetos/${idProjeto}`, { waitUntil: 'networkidle2' })
  await esperar(1800)
  verificar('barra de filtros aparece no quadro', !!(await pagina.$('.filtros-quadro')))

  await pagina.type('.filtros-quadro input', 'zzz-nao-existe')
  await esperar(700)
  verificar('filtro por título esconde o que não casa', (await pagina.$$('.cartao')).length === 0)
  verificar('mostra a contagem do filtro', !!(await pagina.$('.filtros-contagem')))
  await clicarTexto('.filtros-quadro button', 'Limpar')
  await esperar(700)
  verificar('limpar filtro traz os cartões de volta', (await pagina.$$('.cartao')).length > 0)

  await clicarTexto('.alternador button', 'Discussão')
  await esperar(1400)
  verificar('aba de discussão do projeto abre', !!(await pagina.$('.campo-comentario input')))
  await pagina.type('.campo-comentario input', 'Mensagem de teste na discussão')
  await clicarTexto('.campo-comentario button', 'Enviar')
  await esperar(1800)
  verificar('comentário no projeto aparece', (await pagina.$$('.discussao li')).length > 0)
  await foto('07-discussao')

  // ============================ Tipo de hora ============================
  // O formulário de lançamento é de MEMBRO: a conta da gestão só monitora.
  // Por isso esta parte troca de sessão em vez de pular a verificação.
  secao('Tipo de hora no lançamento (como membro)')
  await pagina.evaluate(() => localStorage.clear())
  await pagina.goto(APP, { waitUntil: 'networkidle2' })
  await pagina.type('input[type="email"]', CONTA_MEMBRO.email)
  await pagina.type('input[type="password"]', CONTA_MEMBRO.senha)
  await pagina.click('button[type="submit"]')
  await esperar(2200)

  const trocouSenha = pagina.url().includes('/trocar-senha')
  if (trocouSenha) {
    verificar('membro com senha provisória cai na troca obrigatória', true, 'pulando o resto desta seção')
  } else {
    await pagina.goto(APP + '/horas', { waitUntil: 'networkidle2' })
    await esperar(1600)

    const tipos = await pagina.$$('.tipo-hora')
    verificar('quatro tipos de hora oferecidos', tipos.length === 4)
    const temCampo = (rotulo) => pagina.$$eval('.field-label',
      (n, r) => n.some((x) => x.textContent.trim().startsWith(r)), rotulo)

    verificar('hora técnica pede o projeto', await temCampo('Projeto'))

    await clicarTexto('.tipo-hora strong', 'Estudo')
    await esperar(700)
    verificar('trocar para Estudo esconde a escolha de projeto', !(await temCampo('Projeto')))

    await clicarTexto('.tipo-hora strong', 'Técnica')
    await esperar(700)
    verificar('voltar para Técnica traz a escolha de projeto', await temCampo('Projeto'))
    await foto('08-tipo-hora')
  }

  // Volta para a conta de gestão para o resto da suíte.
  await pagina.evaluate(() => localStorage.clear())
  await pagina.goto(APP, { waitUntil: 'networkidle2' })
  await pagina.type('input[type="email"]', CONTA_GESTOR.email)
  await pagina.type('input[type="password"]', CONTA_GESTOR.senha)
  await pagina.click('button[type="submit"]')
  await esperar(2200)

  // ============================ Perfil ============================
  secao('Perfil')
  await pagina.goto(APP + '/perfil', { waitUntil: 'networkidle2' })
  await esperar(1600)
  verificar('tela de perfil carrega', !!(await pagina.$('.perfil-topo')))
  verificar('oferece as cores de avatar', (await pagina.$$('.cor')).length > 1)
  verificar('mostra os dados definidos pela gestão', (await pagina.$$('.dados-conta li')).length === 3)

  const campoApelido = await pagina.$('.panel .form input')
  await campoApelido.type('Apelido de teste')
  await clicarTexto('.panel button', 'Salvar perfil')
  await esperar(1800)
  verificar('salvar perfil reflete no cabeçalho',
    (await pagina.$eval('.topbar-name', (n) => n.textContent)).includes('Apelido de teste'))
  await foto('09-perfil')

  // Desfaz para não deixar rastro.
  await pagina.evaluate(() => {
    const i = document.querySelector('.panel .form input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, '')
    i.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await clicarTexto('.panel button', 'Salvar perfil')
  await esperar(1500)

  // ============================ Mensagens ============================
  secao('Mensagens diretas')
  await pagina.goto(APP + '/mensagens', { waitUntil: 'networkidle2' })
  await esperar(1600)
  verificar('tela de mensagens carrega', !!(await pagina.$('.chat')))

  await clicarTexto('.chat-lista button', '+ Nova')
  await esperar(700)
  const candidatos = await pagina.$$('.chat-candidatos .chat-item')
  verificar('lista pessoas para começar conversa', candidatos.length > 0, `${candidatos.length} pessoa(s)`)

  if (candidatos.length) {
    await candidatos[0].click()
    await esperar(1600)
    verificar('conversa abre', !!(await pagina.$('.chat-mensagens')))

    await pagina.type('.chat-envio input', TEXTO_MSG)
    await pagina.click('.chat-envio button')
    await esperar(2000)
    const baloes = await pagina.$$('.balao.minha')
    verificar('mensagem enviada aparece como minha', baloes.length > 0)
    await foto('10-chat')
  }

  // ============================ Agenda ============================
  secao('Agenda')
  await pagina.goto(APP + '/agenda', { waitUntil: 'networkidle2' })
  await esperar(1800)
  verificar('agenda carrega a grade do mês', (await pagina.$$('.cal-dia')).length >= 28)
  verificar('tem o alternador equipe/meus', (await pagina.$$('.agenda-barra .alternador button')).length === 2)

  await clicarTexto('.agenda-barra button', '+ Novo compromisso')
  await esperar(800)
  verificar('formulário de compromisso abre', !!(await pagina.$('.drawer form')))

  await pagina.type('.drawer form input', 'Reunião criada pelo teste')
  await pagina.evaluate(() => {
    // Marca "dia inteiro" para não depender de campo de hora.
    const c = document.querySelector('.opcao-linha input[type="checkbox"]')
    if (c && !c.checked) c.click()
  })
  await esperar(400)
  await clicarTexto('.drawer form button', 'Criar compromisso')
  await esperar(2200)

  const naGrade = await pagina.$$eval('.cal-tarefa',
    (n) => n.some((x) => x.textContent.includes('Reunião criada pelo teste')))
  verificar('compromisso aparece na grade', naGrade)
  verificar('aparece também na lista de próximos',
    await pagina.$$eval('.proximo', (n) => n.some((x) => x.textContent.includes('Reunião criada pelo teste'))))
  await foto('15-agenda')

  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.cal-tarefa')]
      .find((x) => x.textContent.includes('Reunião criada pelo teste'))
    if (b) b.click()
  })
  await esperar(1400)
  verificar('detalhe do compromisso abre', !!(await pagina.$('.participantes')))
  verificar('pergunta se você vai',
    await pagina.$$eval('.field-label', (n) => n.some((x) => x.textContent.includes('Você vai?'))))

  await clicarTexto('.drawer .alternador button', 'Não vou')
  await esperar(1400)
  verificar('resposta de presença fica registrada',
    await pagina.$$eval('.selo-presenca', (n) => n.some((x) => x.textContent.includes('não vai'))))
  await foto('16-compromisso')

  // Remove o compromisso criado pelo teste.
  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.drawer-acoes .icon-btn')].find((x) => x.textContent === '🗑')
    if (b) b.click()
  })
  await esperar(1600)
  verificar('compromisso removido some da grade',
    !(await pagina.$$eval('.cal-tarefa', (n) => n.some((x) => x.textContent.includes('Reunião criada pelo teste')))))

  // ============================ Notificações e menções ============================
  secao('Notificações e menções')
  await pagina.goto(APP + `/projetos/${idProjeto}`, { waitUntil: 'networkidle2' })
  await esperar(1800)
  verificar('sino de notificações no topo', !!(await pagina.$('.sino-botao')))

  await clicarTexto('.alternador button', 'Discussão')
  await esperar(1400)
  await pagina.type('.campo-comentario input', 'Bom dia @')
  await esperar(900)
  const sugestoes = await pagina.$$('.mencao-item')
  verificar('digitar @ abre o seletor de pessoas', sugestoes.length > 0, `${sugestoes.length}`)
  if (sugestoes.length) {
    await sugestoes[0].click()
    await esperar(500)
    verificar('escolher insere a menção no texto',
      (await pagina.$eval('.campo-comentario input', (n) => n.value)).includes('@'))
    await clicarTexto('.campo-comentario button', 'Enviar')
    await esperar(1800)
    verificar('comentário com menção é publicado',
      await pagina.$$eval('.discussao-texto', (n) => n.some((x) => x.textContent.includes('Bom dia'))))
  }

  await pagina.click('.sino-botao')
  await esperar(1000)
  verificar('painel do sino abre', !!(await pagina.$('.sino-painel')))
  await pagina.keyboard.press('Escape')
  await pagina.mouse.click(10, 400)
  await esperar(600)

  // ============================ Duplicar projeto ============================
  secao('Duplicar projeto')
  await clicarTexto('.alternador button', 'Quadro')
  await esperar(800)
  await clicarTexto('.acoes-projeto button', 'Configurar')
  await esperar(900)
  verificar('opção de usar como modelo aparece',
    await pagina.$$eval('.bloco-titulo', (n) => n.some((x) => x.textContent.includes('Usar como modelo'))))

  const urlAntes = pagina.url()
  await pagina.evaluate(() => {
    const f = [...document.querySelectorAll('form.linha-form')]
      .find((x) => x.querySelector('button')?.textContent.trim() === 'Duplicar')
    f.querySelector('input[type="text"], input:not([type])').value = ''
    f.querySelector('button[type="submit"]').click()
  })
  await esperar(2500)
  verificar('duplicar abre o projeto novo', pagina.url() !== urlAntes, pagina.url())
  const idCopia = Number(pagina.url().match(/\/projetos\/(\d+)/)?.[1])
  if (idCopia) criados.projetos.push(idCopia)
  verificar('a cópia veio com as tarefas', (await pagina.$$('.cartao')).length > 0)

  // ============================ Lixeira ============================
  secao('Lixeira')
  await pagina.goto(APP + '/lixeira', { waitUntil: 'networkidle2' })
  await esperar(1600)
  verificar('tela da lixeira carrega', !!(await pagina.$('.saudacao')))

  // Apaga a cópia e confere que ela aparece e volta.
  await chamar(`/projetos/${idCopia}`, { metodo: 'DELETE', token: sessao.token })
  await pagina.reload({ waitUntil: 'networkidle2' })
  await esperar(1600)
  const naLixeira = await pagina.$$eval('.lixeira-rotulo', (n) => n.length)
  verificar('item removido aparece na lixeira', naLixeira > 0, `${naLixeira} item(ns)`)

  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('.lixeira button')].find((x) => x.textContent.trim() === 'Restaurar')
    if (b) b.click()
  })
  await esperar(2000)
  verificar('restaurar tira o item da lixeira',
    (await pagina.$$('.lixeira-rotulo')).length < naLixeira)

  // ============================ Relatório e exportação ============================
  secao('Relatório individual e exportação')
  await pagina.goto(APP + '/documentacao', { waitUntil: 'networkidle2' })
  await esperar(1600)
  verificar('botão de exportar ZIP aparece',
    await pagina.$$eval('.doc-acoes button', (n) => n.some((x) => x.textContent.includes('ZIP'))))

  // ============================ Regressão ============================
  secao('Regressão')
  await pagina.goto(APP + '/horas', { waitUntil: 'networkidle2' })
  await esperar(1500)
  verificar('Painel de Horas continua funcionando', !!(await pagina.$('.tabela, .empty')))

  await pagina.goto(APP + '/registro', { waitUntil: 'networkidle2' })
  await esperar(1200)
  verificar('rota antiga /registro redireciona para /horas', pagina.url().includes('/horas'))
} catch (e) {
  verificar('a suíte rodou até o fim', false, e.message)
} finally {
  await navegador.close()
  await limpar()
}

secao('Erros de console')
if (errosPagina.length === 0) {
  verificar('nenhum erro de console ou exceção', true)
} else {
  errosPagina.forEach((e) => verificar(e, false))
}

encerrar()
