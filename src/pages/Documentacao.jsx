import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMembro, listarDocumentos, criarDocumento, obterDocumento, salvarDocumento,
  removerDocumento, listarVersoes, obterVersao,
  listarAnexos, enviarAnexo, removerAnexo, urlApi, exportarDocumentacao,
} from '../lib/api'

import { renderizarMarkdown } from '../lib/markdown'
import { compararTextos, comContexto, resumoDiff } from '../lib/diff'

function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Monta a hierarquia a partir da lista plana (pai_id).
function montarArvore(paginas) {
  const porPai = {}
  for (const p of paginas) {
    const chave = p.pai_id ?? 'raiz'
    ;(porPai[chave] ||= []).push(p)
  }
  const construir = (chave) =>
    (porPai[chave] || []).map((p) => ({ ...p, filhos: construir(p.id) }))
  return construir('raiz')
}

function Ramo({ no, nivel, selecionada, aoSelecionar, aoCriarFilho }) {
  const [aberto, setAberto] = useState(true)
  const temFilhos = no.filhos.length > 0
  return (
    <li>
      <div className={`ramo ${selecionada === no.id ? 'ativo' : ''}`} style={{ paddingLeft: 8 + nivel * 14 }}>
        <button className="ramo-seta" onClick={() => setAberto((v) => !v)}
          aria-label={aberto ? 'Recolher' : 'Expandir'}>
          {temFilhos ? (aberto ? '▾' : '▸') : '·'}
        </button>
        <button className="ramo-titulo" onClick={() => aoSelecionar(no.id)}>
          <span className="ramo-icone">{no.icone || '📄'}</span>
          {no.titulo}
        </button>
        <button className="ramo-mais" title="Nova subpágina"
          onClick={() => aoCriarFilho(no.id)}>+</button>
      </div>
      {aberto && temFilhos && (
        <ul className="arvore-filhos">
          {no.filhos.map((f) => (
            <Ramo key={f.id} no={f} nivel={nivel + 1} selecionada={selecionada}
              aoSelecionar={aoSelecionar} aoCriarFilho={aoCriarFilho} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Documentacao() {
  const [params, setParams] = useSearchParams()
  const membro = getMembro()

  const [paginas, setPaginas] = useState([])
  const [atual, setAtual] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState({ titulo: '', conteudo: '', icone: '' })
  const [versoes, setVersoes] = useState([])
  const [versaoVista, setVersaoVista] = useState(null)
  const [mostrarVersoes, setMostrarVersoes] = useState(false)
  const [modoVersao, setModoVersao] = useState('diff') // 'diff' | 'conteudo'
  const [anexos, setAnexos] = useState([])
  const [enviando, setEnviando] = useState(false)

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  const selecionada = params.get('pagina') ? Number(params.get('pagina')) : null

  const carregarArvore = useCallback(
    () => listarDocumentos().then(setPaginas).catch(() => notificar('Erro ao carregar a documentação')),
    [],
  )

  useEffect(() => { carregarArvore().finally(() => setCarregando(false)) }, [carregarArvore])

  useEffect(() => {
    if (!selecionada) { setAtual(null); return }
    setEditando(false)
    setVersaoVista(null)
    setMostrarVersoes(false)
    obterDocumento(selecionada)
      .then((d) => { setAtual(d); setRascunho({ titulo: d.titulo, conteudo: d.conteudo || '', icone: d.icone || '' }) })
      .catch(() => { setAtual(null); notificar('Página não encontrada') })
    listarAnexos('documento', selecionada).then(setAnexos).catch(() => setAnexos([]))
  }, [selecionada])

  async function subirArquivo(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setEnviando(true)
    try {
      await enviarAnexo('documento', atual.id, arquivo)
      setAnexos(await listarAnexos('documento', atual.id))
      notificar('Arquivo anexado ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível enviar o arquivo.')
    } finally {
      setEnviando(false)
    }
  }

  async function apagarAnexo(anexoId) {
    if (!window.confirm('Remover este anexo?')) return
    await removerAnexo(anexoId)
    setAnexos((l) => l.filter((a) => a.id !== anexoId))
  }

  async function novaPagina(paiId = null) {
    const titulo = window.prompt(paiId ? 'Título da subpágina:' : 'Título da nova página:')
    if (!titulo?.trim()) return
    const criada = await criarDocumento({
      titulo: titulo.trim(),
      pai_id: paiId,
      setor: paiId ? undefined : (membro?.role === 'gestor' ? null : membro?.setor),
    })
    await carregarArvore()
    setParams({ pagina: String(criada.id) })
  }

  async function salvar() {
    try {
      const r = await salvarDocumento(atual.id, rascunho)
      setEditando(false)
      await carregarArvore()
      const atualizado = await obterDocumento(atual.id)
      setAtual(atualizado)
      notificar(r.versao_criada ? 'Salvo — nova versão criada ✓' : 'Nada mudou')
    } catch (err) {
      alert(err?.message || 'Não foi possível salvar.')
    }
  }

  async function apagar() {
    if (!window.confirm(`Remover "${atual.titulo}" e suas subpáginas?`)) return
    await removerDocumento(atual.id)
    setParams({})
    carregarArvore()
  }

  async function abrirVersoes() {
    const lista = await listarVersoes(atual.id)
    setVersoes(lista)
    setMostrarVersoes(true)
  }

  async function verVersao(id) {
    const v = await obterVersao(id)
    setVersaoVista(v)
  }

  const arvore = montarArvore(paginas)

  return (
    <>
      <h1 className="saudacao">Documentação</h1>

      <div className="doc-layout">
        {/* ---------- Árvore ---------- */}
        <aside className="panel doc-arvore">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Páginas</h2>
              <p className="panel-sub">{paginas.length} no total</p>
            </div>
            <div className="doc-acoes">
              <button className="btn btn-ghost" title="Baixar tudo em markdown"
                onClick={() => exportarDocumentacao().catch((e) => alert(e.message))}>⬇ ZIP</button>
              <button className="btn btn-ghost" onClick={() => novaPagina(null)}>+ Página</button>
            </div>
          </div>

          {carregando ? (
            <p className="panel-sub">Carregando…</p>
          ) : arvore.length === 0 ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">📚</div>
              <p>Nenhuma página ainda.</p>
              <span>Crie a primeira para começar o manual da EJ.</span>
            </div>
          ) : (
            <ul className="arvore">
              {arvore.map((no) => (
                <Ramo key={no.id} no={no} nivel={0} selecionada={selecionada}
                  aoSelecionar={(id) => setParams({ pagina: String(id) })}
                  aoCriarFilho={novaPagina} />
              ))}
            </ul>
          )}
        </aside>

        {/* ---------- Conteúdo ---------- */}
        <section className="panel doc-conteudo">
          {!atual ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">📖</div>
              <p>Selecione uma página à esquerda.</p>
              <span>Ou crie uma nova para começar.</span>
            </div>
          ) : (
            <>
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">
                    {atual.icone || '📄'} {atual.titulo}
                  </h2>
                  <p className="panel-sub">
                    {atual.setor ? atual.setor : 'Documento institucional'}
                    {atual.atualizado_em && ` · atualizado em ${atual.atualizado_em.slice(0, 16)}`}
                    {atual.total_versoes > 0 && ` · ${atual.total_versoes} versão(ões)`}
                  </p>
                </div>
                <div className="doc-acoes">
                  {atual.total_versoes > 0 && (
                    <button className="btn btn-ghost" onClick={abrirVersoes}>Histórico</button>
                  )}
                  {editando ? (
                    <>
                      <button className="btn btn-primary" onClick={salvar}>Salvar</button>
                      <button className="btn btn-ghost" onClick={() => {
                        setEditando(false)
                        setRascunho({ titulo: atual.titulo, conteudo: atual.conteudo || '', icone: atual.icone || '' })
                      }}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-primary" onClick={() => setEditando(true)}>Editar</button>
                      <button className="icon-btn" onClick={apagar} title="Remover página">🗑</button>
                    </>
                  )}
                </div>
              </div>

              {atual.tarefas.length > 0 && (
                <div className="chips-linha chips-linha--espaco">
                  <span className="field-label">Tarefas ligadas:</span>
                  {atual.tarefas.map((t) => (
                    <span key={t.id} className="tag">{t.codigo} · {t.titulo}</span>
                  ))}
                </div>
              )}

              {editando ? (
                <div className="editor">
                  <div className="row">
                    <label className="field">
                      <span className="field-label">Título</span>
                      <input className="input" value={rascunho.titulo}
                        onChange={(e) => setRascunho((r) => ({ ...r, titulo: e.target.value }))} />
                    </label>
                    <label className="field">
                      <span className="field-label">Ícone (emoji)</span>
                      <input className="input" maxLength={4} placeholder="📖" value={rascunho.icone}
                        onChange={(e) => setRascunho((r) => ({ ...r, icone: e.target.value }))} />
                    </label>
                  </div>
                  <div className="editor-split">
                    <label className="field">
                      <span className="field-label">Markdown</span>
                      <textarea className="input textarea editor-texto" value={rascunho.conteudo}
                        placeholder={'# Título\n\nEscreva em markdown: **negrito**, listas, `código`, tabelas…'}
                        onChange={(e) => setRascunho((r) => ({ ...r, conteudo: e.target.value }))} />
                    </label>
                    <div className="field">
                      <span className="field-label">Pré-visualização</span>
                      <div className="markdown editor-preview"
                        dangerouslySetInnerHTML={{ __html: renderizarMarkdown(rascunho.conteudo) }} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="markdown"
                    dangerouslySetInnerHTML={{ __html: renderizarMarkdown(atual.conteudo) }} />

                  <div className="field" style={{ marginTop: 28 }}>
                    <span className="field-label">
                      Arquivos da página {anexos.length > 0 && `(${anexos.length})`}
                    </span>
                    {anexos.length > 0 && (
                      <ul className="anexos">
                        {anexos.map((a) => (
                          <li key={a.id}>
                            <a className="anexo-nome" href={urlApi(a.url)} target="_blank" rel="noreferrer">
                              {a.nome}
                            </a>
                            <span className="anexo-tamanho">{tamanhoLegivel(a.tamanho)}</span>
                            {(a.membro_nome === membro?.nome || membro?.role === 'gestor') && (
                              <button className="icon-btn" onClick={() => apagarAnexo(a.id)}>✕</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="enviar-arquivo">
                      {enviando ? 'Enviando…' : '📎 Anexar arquivo'}
                      <input type="file" onChange={subirArquivo} disabled={enviando} />
                    </label>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------- Histórico de versões ---------- */}
      {mostrarVersoes && (
        <div className="drawer-fundo" onClick={() => setMostrarVersoes(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Versões">
            <header className="drawer-topo">
              <strong>Versões de {atual.titulo}</strong>
              <button className="icon-btn" onClick={() => setMostrarVersoes(false)}>✕</button>
            </header>
            <div className="drawer-corpo">
              <ul className="versoes">
                {versoes.map((v, i) => (
                  <li key={v.id}>
                    <button className="versao-linha" onClick={() => verVersao(v.id)}>
                      <strong>v{versoes.length - i}</strong>
                      <span>{v.criado_em?.slice(0, 16)}</span>
                      <span className="versao-autor">{v.membro_nome}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {versaoVista && (() => {
                // Compara a versão escolhida com o conteúdo atual da página.
                const operacoes = compararTextos(versaoVista.conteudo, atual.conteudo)
                const linhas = comContexto(operacoes)
                return (
                  <>
                    <div className="panel-head" style={{ marginTop: 22 }}>
                      <div>
                        <h3 className="bloco-titulo" style={{ margin: 0 }}>
                          Esta versão comparada com a atual
                        </h3>
                        <p className="panel-sub">{resumoDiff(operacoes)}</p>
                      </div>
                      <div className="alternador">
                        <button className={modoVersao === 'diff' ? 'ativo' : ''}
                          onClick={() => setModoVersao('diff')}>Alterações</button>
                        <button className={modoVersao === 'conteudo' ? 'ativo' : ''}
                          onClick={() => setModoVersao('conteudo')}>Conteúdo</button>
                      </div>
                    </div>

                    {modoVersao === 'diff' ? (
                      linhas.length === 0 ? (
                        <p className="diff-vazio">Idêntica à versão atual.</p>
                      ) : (
                        <div className="diff versao-preview">
                          {linhas.map((l, i) => (
                            <div key={i} className={`diff-linha ${l.tipo}`}>
                              <span className="diff-marca">
                                {l.tipo === 'entrou' ? '+' : l.tipo === 'saiu' ? '−' : ''}
                              </span>
                              <span>{l.texto || ' '}</span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="markdown versao-preview"
                        dangerouslySetInnerHTML={{ __html: renderizarMarkdown(versaoVista.conteudo) }} />
                    )}

                    <button className="btn btn-ghost" onClick={() => {
                      setRascunho((r) => ({ ...r, conteudo: versaoVista.conteudo, titulo: versaoVista.titulo }))
                      setEditando(true)
                      setMostrarVersoes(false)
                      notificar('Conteúdo carregado no editor — salve para restaurar')
                    }}>
                      Restaurar esta versão
                    </button>
                  </>
                )
              })()}
            </div>
          </aside>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
