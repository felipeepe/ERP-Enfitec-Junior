import { useCallback, useEffect, useState } from 'react'
import {
  getMembro, obterTarefa, atualizarTarefa, removerTarefa, criarTarefa,
  criarItemChecklist, marcarItemChecklist, removerItemChecklist,
  listarComentarios, comentar, removerComentario, historicoTarefa,
  listarAnexos, enviarAnexo, removerAnexo, urlApi,
  cronometroAtual, iniciarCronometro, EVENTO_CRONOMETRO,
} from '../lib/api'
import CampoComentario from './CampoComentario.jsx'

// Tamanho de arquivo em unidade legível.
function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Rótulos legíveis para o histórico, que grava nomes de coluna.
const NOMES_CAMPO = {
  titulo: 'título', descricao: 'descrição', prioridade: 'prioridade',
  data_inicio: 'data de início', prazo: 'prazo', estimativa_min: 'estimativa',
  status_id: 'status', responsaveis: 'responsáveis', tarefa_pai_id: 'tarefa pai',
  recorrencia: 'recorrência',
}

export default function TarefaPainel({ tarefaId, projeto, tarefasDoProjeto = [], equipe, prioridades, aoFechar, aoMudar }) {
  const eu = getMembro()
  const [tarefa, setTarefa] = useState(null)
  const [comentarios, setComentarios] = useState([])
  const [historico, setHistorico] = useState([])
  const [aba, setAba] = useState('detalhes')
  const [novoItem, setNovoItem] = useState('')
  const [novaSub, setNovaSub] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [anexos, setAnexos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [cronRodando, setCronRodando] = useState(false)

  // Saber se o cronômetro já está nesta tarefa muda o botão de play para um
  // aviso — começar de novo descartaria o tempo em andamento.
  useEffect(() => {
    const conferir = () => cronometroAtual()
      .then((c) => setCronRodando(!!c && c.tarefa_id === tarefaId))
      .catch(() => setCronRodando(false))
    conferir()
    window.addEventListener(EVENTO_CRONOMETRO, conferir)
    return () => window.removeEventListener(EVENTO_CRONOMETRO, conferir)
  }, [tarefaId])

  async function comecarCronometro() {
    const emOutra = await cronometroAtual().catch(() => null)
    if (emOutra && emOutra.tarefa_id !== tarefaId) {
      const ok = window.confirm(
        `Já há tempo correndo em ${emOutra.codigo}. Começar aqui descarta aquele tempo sem lançar. Continuar?`,
      )
      if (!ok) return
    }
    await iniciarCronometro(tarefaId)
    window.dispatchEvent(new CustomEvent(EVENTO_CRONOMETRO))
  }

  // Depende só do id: `aoFechar` vem do pai e é recriado a cada render dele, então
  // incluí-lo aqui faria este efeito rodar em loop.
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => {
    return obterTarefa(tarefaId)
      .then((t) => { setTarefa(t); setErro('') })
      .catch((e) => setErro(e?.message || 'Tarefa não encontrada.'))
  }, [tarefaId])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    listarComentarios('tarefa', tarefaId).then(setComentarios).catch(() => {})
    historicoTarefa(tarefaId).then(setHistorico).catch(() => {})
    listarAnexos('tarefa', tarefaId).then(setAnexos).catch(() => {})
  }, [tarefaId])

  async function subirArquivo(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite reenviar o mesmo arquivo depois
    if (!arquivo) return
    setEnviando(true)
    try {
      await enviarAnexo('tarefa', tarefaId, arquivo)
      setAnexos(await listarAnexos('tarefa', tarefaId))
      historicoTarefa(tarefaId).then(setHistorico).catch(() => {})
    } catch (err) {
      alert(err?.message || 'Não foi possível enviar o arquivo.')
    } finally {
      setEnviando(false)
    }
  }

  async function apagarAnexo(id) {
    if (!window.confirm('Remover este anexo?')) return
    try {
      await removerAnexo(id)
      setAnexos((lista) => lista.filter((a) => a.id !== id))
    } catch (err) {
      alert(err?.message || 'Não foi possível remover.')
    }
  }

  // Fecha com Esc, como qualquer painel modal.
  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  // Salva um campo e recarrega tarefa + quadro.
  async function salvar(campos) {
    setSalvando(true)
    try {
      await atualizarTarefa(tarefaId, campos)
      await carregar()
      aoMudar?.()
      historicoTarefa(tarefaId).then(setHistorico).catch(() => {})
    } catch (err) {
      alert(err?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!window.confirm('Remover esta tarefa e suas subtarefas?')) return
    await removerTarefa(tarefaId)
    aoMudar?.()
    aoFechar()
  }

  async function enviarComentario(texto, mencionados) {
    await comentar('tarefa', tarefaId, texto, mencionados)
    listarComentarios('tarefa', tarefaId).then(setComentarios)
  }

  async function adicionarSubtarefa(e) {
    e.preventDefault()
    const titulo = novaSub.trim()
    if (!titulo) return
    await criarTarefa(projeto.id, { titulo, tarefa_pai_id: tarefaId })
    setNovaSub('')
    carregar()
    aoMudar?.()
  }

  if (!tarefa) {
    return (
      <div className="drawer-fundo" onClick={aoFechar}>
        <aside className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="empty">
            <p>{erro || 'Carregando…'}</p>
            {erro && <button className="btn btn-ghost" onClick={aoFechar}>Fechar</button>}
          </div>
        </aside>
      </div>
    )
  }

  const responsaveisIds = tarefa.responsaveis.map((r) => r.id)
  const etiquetasIds = tarefa.etiquetas.map((e) => e.id)
  // Candidatas a dependência: qualquer outra tarefa do mesmo projeto.
  const dependenciasIds = tarefa.dependencias.map((d) => d.id)

  return (
    <div className="drawer-fundo" onClick={aoFechar}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Detalhe da tarefa">
        <header className="drawer-topo">
          <span className="tarefa-codigo">{projeto.codigo}-{tarefa.numero}</span>
          <div className="drawer-acoes">
            {salvando && <span className="salvando">salvando…</span>}
            {cronRodando ? (
              <span className="cron-nesta" title="Use a barra no rodapé para parar">
                <span className="cron-pulso" aria-hidden="true" /> contando
              </span>
            ) : (
              <button className="btn btn-ghost btn-cron" onClick={comecarCronometro}>
                ▶ Iniciar
              </button>
            )}
            <button className="icon-btn" onClick={apagar} title="Remover tarefa">🗑</button>
            <button className="icon-btn" onClick={aoFechar} title="Fechar">✕</button>
          </div>
        </header>

        <input
          className="drawer-titulo"
          defaultValue={tarefa.titulo}
          onBlur={(e) => e.target.value.trim() && e.target.value !== tarefa.titulo && salvar({ titulo: e.target.value.trim() })}
        />

        <nav className="abas">
          {[['detalhes', 'Detalhes'], ['comentarios', `Comentários (${comentarios.length})`], ['historico', 'Histórico']]
            .map(([chave, rotulo]) => (
              <button key={chave} className={`aba ${aba === chave ? 'ativo' : ''}`} onClick={() => setAba(chave)}>
                {rotulo}
              </button>
            ))}
        </nav>

        {aba === 'detalhes' && (
          <div className="drawer-corpo">
            <div className="row">
              <label className="field">
                <span className="field-label">Status</span>
                <select className="input" value={tarefa.status_id ?? ''}
                  onChange={(e) => salvar({ status_id: Number(e.target.value) })}>
                  {projeto.status.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Prioridade</span>
                <select className="input" value={tarefa.prioridade}
                  onChange={(e) => salvar({ prioridade: e.target.value })}>
                  {prioridades.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </label>
            </div>

            <div className="row">
              <label className="field">
                <span className="field-label">Início</span>
                <input type="date" className="input" defaultValue={tarefa.data_inicio || ''}
                  onChange={(e) => salvar({ data_inicio: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Prazo</span>
                <input type="date" className="input" defaultValue={tarefa.prazo || ''}
                  onChange={(e) => salvar({ prazo: e.target.value })} />
              </label>
            </div>

            <div className="row">
              <label className="field">
                <span className="field-label">Estimativa (minutos)</span>
                <input type="number" min="0" className="input" defaultValue={tarefa.estimativa_min ?? ''}
                  onBlur={(e) => salvar({ estimativa_min: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Recorrência</span>
                <select className="input" value={tarefa.recorrencia || ''}
                  onChange={(e) => salvar({ recorrencia: e.target.value })}>
                  <option value="">Não repete</option>
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span className="field-label">Descrição</span>
              <textarea className="input textarea" rows="4" defaultValue={tarefa.descricao || ''}
                placeholder="Detalhe o que precisa ser feito…"
                onBlur={(e) => e.target.value !== (tarefa.descricao || '') && salvar({ descricao: e.target.value })} />
            </label>

            {/* Responsáveis: múltiplos, como pedido */}
            <div className="field">
              <span className="field-label">Responsáveis</span>
              <div className="selecao-multipla">
                {equipe.map((m) => {
                  const marcado = responsaveisIds.includes(m.id)
                  return (
                    <button key={m.id} type="button"
                      className={`opcao ${marcado ? 'marcada' : ''}`}
                      onClick={() => salvar({
                        responsaveis: marcado
                          ? responsaveisIds.filter((x) => x !== m.id)
                          : [...responsaveisIds, m.id],
                      })}>
                      {m.nome}
                    </button>
                  )
                })}
              </div>
            </div>

            {projeto.etiquetas.length > 0 && (
              <div className="field">
                <span className="field-label">Etiquetas</span>
                <div className="selecao-multipla">
                  {projeto.etiquetas.map((et) => {
                    const marcado = etiquetasIds.includes(et.id)
                    return (
                      <button key={et.id} type="button"
                        className={`opcao ${marcado ? 'marcada' : ''}`}
                        onClick={() => salvar({
                          etiquetas: marcado
                            ? etiquetasIds.filter((x) => x !== et.id)
                            : [...etiquetasIds, et.id],
                        })}>
                        {et.nome}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Checklist */}
            <div className="field">
              <span className="field-label">
                Checklist {tarefa.itens_checklist.length > 0 &&
                  `(${tarefa.itens_checklist.filter((i) => i.feito).length}/${tarefa.itens_checklist.length})`}
              </span>
              <ul className="checklist">
                {tarefa.itens_checklist.map((item) => (
                  <li key={item.id} className={item.feito ? 'feito' : ''}>
                    <input type="checkbox" checked={item.feito}
                      onChange={(e) => marcarItemChecklist(item.id, e.target.checked).then(carregar).then(aoMudar)} />
                    <span>{item.texto}</span>
                    <button className="icon-btn" onClick={() => removerItemChecklist(item.id).then(carregar).then(aoMudar)}>✕</button>
                  </li>
                ))}
              </ul>
              <form className="linha-form" onSubmit={(e) => {
                e.preventDefault()
                if (!novoItem.trim()) return
                criarItemChecklist(tarefaId, novoItem.trim()).then(() => { setNovoItem(''); carregar(); aoMudar?.() })
              }}>
                <input className="input" placeholder="novo item" value={novoItem}
                  onChange={(e) => setNovoItem(e.target.value)} />
                <button className="btn btn-ghost" type="submit">Adicionar</button>
              </form>
            </div>

            {/* Subtarefas */}
            <div className="field">
              <span className="field-label">Subtarefas ({tarefa.subtarefas.length})</span>
              <ul className="checklist">
                {tarefa.subtarefas.map((s) => (
                  <li key={s.id} className={s.concluida_em ? 'feito' : ''}>
                    <span className="ponto ponto--vazio" />
                    <span>{s.titulo}</span>
                  </li>
                ))}
              </ul>
              <form className="linha-form" onSubmit={adicionarSubtarefa}>
                <input className="input" placeholder="nova subtarefa" value={novaSub}
                  onChange={(e) => setNovaSub(e.target.value)} />
                <button className="btn btn-ghost" type="submit">Adicionar</button>
              </form>
            </div>

            {/* Dependências: esta tarefa está travada até as escolhidas saírem */}
            <div className="field">
              <span className="field-label">Bloqueada por</span>
              {tarefa.dependencias.length > 0 && (
                <div className="chips-linha">
                  {tarefa.dependencias.map((d) => (
                    <span key={d.id} className="tag">
                      {d.codigo} · {d.titulo}
                      <button className="chip-x" onClick={() => salvar({
                        dependencias: dependenciasIds.filter((x) => x !== d.id),
                      })}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <select className="input" value=""
                onChange={(e) => {
                  const escolhido = Number(e.target.value)
                  if (escolhido) salvar({ dependencias: [...dependenciasIds, escolhido] })
                }}>
                <option value="">+ Adicionar dependência…</option>
                {tarefasDoProjeto
                  .filter((t) => t.id !== tarefaId && !dependenciasIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {projeto.codigo}-{t.numero} · {t.titulo}
                    </option>
                  ))}
              </select>
            </div>

            {/* Anexos */}
            <div className="field">
              <span className="field-label">Anexos {anexos.length > 0 && `(${anexos.length})`}</span>
              {anexos.length > 0 && (
                <ul className="anexos">
                  {anexos.map((a) => (
                    <li key={a.id}>
                      <a className="anexo-nome" href={urlApi(a.url)} target="_blank" rel="noreferrer">
                        {a.nome}
                      </a>
                      <span className="anexo-tamanho">{tamanhoLegivel(a.tamanho)}</span>
                      {(a.membro_nome === eu?.nome || eu?.role === 'gestor') && (
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

            {/* Documentação ligada — o diferencial */}
            {tarefa.documentos.length > 0 && (
              <div className="field">
                <span className="field-label">Documentação relacionada</span>
                <div className="chips-linha">
                  {tarefa.documentos.map((d) => (
                    <a key={d.id} className="tag tag--link" href={`/documentacao?pagina=${d.id}`}>
                      {d.icone || '📄'} {d.titulo}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {tarefa.minutos_lancados > 0 && (
              <p className="panel-sub">
                {Math.floor(tarefa.minutos_lancados / 60)}h{String(tarefa.minutos_lancados % 60).padStart(2, '0')} lançadas nesta tarefa.
              </p>
            )}
          </div>
        )}

        {aba === 'comentarios' && (
          <div className="drawer-corpo">
            {comentarios.length === 0 && <p className="panel-sub">Nenhum comentário ainda.</p>}
            <ul className="comentarios">
              {comentarios.map((c) => (
                <li key={c.id}>
                  <div className="comentario-topo">
                    <strong>{c.membro_nome}</strong>
                    <span className="comentario-data">{c.criado_em?.slice(0, 16).replace('T', ' ')}</span>
                    {(c.membro_id === eu?.id || eu?.role === 'gestor') && (
                      <button className="icon-btn" onClick={() =>
                        removerComentario(c.id).then(() => listarComentarios('tarefa', tarefaId).then(setComentarios))
                      }>✕</button>
                    )}
                  </div>
                  <p className="comentario-texto">{c.texto}</p>
                </li>
              ))}
            </ul>
            <CampoComentario
              aoEnviar={enviarComentario}
              placeholder="Comente… use @ para chamar alguém"
            />
          </div>
        )}

        {aba === 'historico' && (
          <div className="drawer-corpo">
            {historico.length === 0 && <p className="panel-sub">Sem alterações registradas.</p>}
            <ul className="historico">
              {historico.map((h) => (
                <li key={h.id}>
                  <span className="historico-data">{h.criado_em?.slice(0, 16)}</span>
                  <span>
                    <strong>{h.membro_nome || 'alguém'}</strong>{' '}
                    {h.acao === 'criou' && 'criou a tarefa'}
                    {h.acao === 'comentou' && 'comentou'}
                    {h.acao === 'alterou' && (
                      <>alterou {NOMES_CAMPO[h.campo] || h.campo}
                        {h.para ? <> para <em>{h.para}</em></> : null}</>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
