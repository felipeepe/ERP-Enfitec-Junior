import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  obterProjeto, listarTarefas, criarTarefa, atualizarTarefa,
  listarEquipe, criarStatus, removerStatus, criarEtiqueta,
  criarMarco, definirMarco, removerMarco,
  removerProjeto, atualizarProjeto, duplicarProjeto,
} from '../lib/api'
import { rotuloData, hoje, formatarMinutos } from '../lib/datas'
import TarefaPainel from '../components/TarefaPainel.jsx'
import PainelProjeto from '../components/PainelProjeto.jsx'
import Discussao from '../components/Discussao.jsx'
import VistaLista from '../components/VistaLista.jsx'
import VistaCalendario from '../components/VistaCalendario.jsx'
import Avatar from '../components/Avatar.jsx'

const PRIORIDADES = [
  ['urgente', 'Urgente'],
  ['alta', 'Alta'],
  ['media', 'Média'],
  ['baixa', 'Baixa'],
]

export default function Projeto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [projeto, setProjeto] = useState(null)
  const [tarefas, setTarefas] = useState([])
  const [equipe, setEquipe] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')

  // Composição de nova tarefa: guarda em qual coluna o formulário está aberto.
  const [novaEm, setNovaEm] = useState(null)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [arrastando, setArrastando] = useState(null)
  const [colunaAlvo, setColunaAlvo] = useState(null)
  const [novoStatus, setNovoStatus] = useState('')
  const [novoMarco, setNovoMarco] = useState({ nome: '', data: '' })
  const [novaEtiqueta, setNovaEtiqueta] = useState({ nome: '', cor: '#1565c0' })
  const [nomeCopia, setNomeCopia] = useState('')
  const [copiaResponsaveis, setCopiaResponsaveis] = useState(false)

  // Toda EJ repete a mesma estrutura a cada semestre. Duplicar substitui
  // recorrência, que é armadilha, por uma fração do esforço.
  async function duplicar(e) {
    e.preventDefault()
    try {
      const novo = await duplicarProjeto(id, {
        nome: nomeCopia.trim() || undefined,
        com_tarefas: true,
        com_checklist: true,
        com_responsaveis: copiaResponsaveis,
      })
      notificar(`Copiado com ${novo.tarefas_copiadas} tarefa(s) ✓`)
      navigate(`/projetos/${novo.id}`)
    } catch (err) {
      alert(err?.message || 'Não foi possível duplicar.')
    }
  }
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [vista, setVista] = useState('quadro')
  // Com 3 tarefas o quadro se explica; com 200, sem filtro ele é inutilizável.
  const [filtros, setFiltros] = useState({ responsavel: '', prioridade: '', etiqueta: '', texto: '' })

  const tarefaAberta = params.get('tarefa')

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  const notificar = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }, [])

  const recarregar = useCallback(() => {
    return Promise.all([obterProjeto(id), listarTarefas(id)])
      .then(([p, t]) => { setProjeto(p); setTarefas(t); setErroCarga('') })
      .catch((e) => setErroCarga(e?.message || 'Não foi possível carregar o projeto.'))
      .finally(() => setCarregando(false))
  }, [id])

  useEffect(() => {
    setCarregando(true)
    recarregar()
    listarEquipe().then(setEquipe).catch(() => {})
  }, [recarregar])

  async function adicionarTarefa(statusId) {
    const titulo = novoTitulo.trim()
    if (!titulo) return
    try {
      const criada = await criarTarefa(id, { titulo, status_id: statusId })
      setTarefas((lista) => [...lista, criada])
      setNovoTitulo('')
      notificar('Tarefa criada ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível criar a tarefa.')
    }
  }

  // Kanban: solta o cartão numa coluna e persiste o novo status.
  async function soltarEm(statusId) {
    const tarefaId = arrastando
    setArrastando(null)
    setColunaAlvo(null)
    if (!tarefaId) return
    const atual = tarefas.find((t) => t.id === tarefaId)
    if (!atual || atual.status_id === statusId) return

    // Otimista: move na tela na hora e desfaz se a API recusar.
    setTarefas((lista) => lista.map((t) => (t.id === tarefaId ? { ...t, status_id: statusId } : t)))
    try {
      await atualizarTarefa(tarefaId, { status_id: statusId })
      recarregar()
    } catch {
      setTarefas((lista) => lista.map((t) => (t.id === tarefaId ? { ...t, status_id: atual.status_id } : t)))
      notificar('Não foi possível mover a tarefa')
    }
  }

  // Arrastar-e-soltar HTML5 não existe em toque: no celular, a ação central do
  // produto ficaria inacessível. Estes botões movem o cartão para a coluna
  // vizinha e só aparecem em tela estreita.
  async function moverColuna(tarefa, direcao) {
    const i = projeto.status.findIndex((s) => s.id === tarefa.status_id)
    const destino = projeto.status[i + direcao]
    if (!destino) return

    setTarefas((lista) => lista.map((t) => (t.id === tarefa.id ? { ...t, status_id: destino.id } : t)))
    try {
      await atualizarTarefa(tarefa.id, { status_id: destino.id })
      recarregar()
    } catch {
      setTarefas((lista) => lista.map((t) => (t.id === tarefa.id ? { ...t, status_id: tarefa.status_id } : t)))
      notificar('Não foi possível mover a tarefa')
    }
  }

  async function adicionarStatus(e) {
    e.preventDefault()
    if (!novoStatus.trim()) return
    await criarStatus(id, { nome: novoStatus.trim(), categoria: 'andamento' })
    setNovoStatus('')
    recarregar()
  }

  async function apagarStatus(statusId) {
    if (!window.confirm('Remover esta coluna? As tarefas dela voltam para a primeira.')) return
    try {
      await removerStatus(statusId)
      recarregar()
    } catch (err) {
      alert(err?.message || 'Não foi possível remover a coluna.')
    }
  }

  async function adicionarEtiqueta(e) {
    e.preventDefault()
    if (!novaEtiqueta.nome.trim()) return
    await criarEtiqueta(id, novaEtiqueta)
    setNovaEtiqueta({ nome: '', cor: '#1565c0' })
    recarregar()
  }

  async function adicionarMarco(e) {
    e.preventDefault()
    if (!novoMarco.nome.trim()) return
    await criarMarco(id, novoMarco)
    setNovoMarco({ nome: '', data: '' })
    recarregar()
  }

  async function apagarProjeto() {
    if (!window.confirm(`Arquivar o projeto "${projeto.nome}"? Ele some da lista mas o histórico é preservado.`)) return
    await removerProjeto(id)
    navigate('/projetos')
  }

  async function mudarSituacao(situacao) {
    await atualizarProjeto(id, { situacao })
    recarregar()
  }

  if (carregando) {
    return <div className="empty"><div className="empty-icon" aria-hidden="true">⏳</div><p>Carregando projeto…</p></div>
  }
  if (erroCarga || !projeto) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">🔒</div>
        <p>{erroCarga || 'Projeto não encontrado.'}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/projetos')}>Voltar aos projetos</button>
      </div>
    )
  }

  // Só as tarefas de topo vão para o quadro; subtarefas aparecem no detalhe.
  const todasDoTopo = tarefas.filter((t) => !t.tarefa_pai_id)
  const total = todasDoTopo.length
  const concluidas = todasDoTopo.filter((t) => t.concluida_em).length

  const filtrando = Object.values(filtros).some(Boolean)
  const doQuadro = todasDoTopo.filter((t) => {
    if (filtros.responsavel && !t.responsaveis.some((r) => String(r.id) === filtros.responsavel)) return false
    if (filtros.prioridade && t.prioridade !== filtros.prioridade) return false
    if (filtros.etiqueta && !t.etiquetas.some((e) => String(e.id) === filtros.etiqueta)) return false
    if (filtros.texto && !t.titulo.toLowerCase().includes(filtros.texto.toLowerCase())) return false
    return true
  })

  return (
    <>
      <button className="voltar" onClick={() => navigate('/projetos')}>‹ Projetos</button>

      <div className="cabecalho-projeto">
        <div>
          <h1 className="saudacao saudacao--compacta">
            <span className="tarefa-codigo">{projeto.codigo}</span> {projeto.nome}
          </h1>
          {projeto.descricao && <p className="panel-sub">{projeto.descricao}</p>}
          <div className="chips-linha">
            <span className="tag">{projeto.setor}</span>
            {projeto.prazo && <span className="tag">Prazo {rotuloData(projeto.prazo)}</span>}
            {projeto.minutos_lancados > 0 && (
              <span className="tag">{formatarMinutos(projeto.minutos_lancados)} lançadas</span>
            )}
            <span className="tag">{concluidas}/{total} tarefas</span>
          </div>
        </div>
        <div className="acoes-projeto">
          <div className="alternador" role="group" aria-label="Modo de visualização">
            {[
              ['quadro', 'Quadro'], ['lista', 'Lista'], ['calendario', 'Calendário'],
              ['painel', 'Painel'], ['discussao', 'Discussão'],
            ].map(([v, r]) => (
              <button key={v} className={vista === v ? 'ativo' : ''} onClick={() => setVista(v)}>{r}</button>
            ))}
          </div>
          <select className="input input--compacto" value={projeto.situacao}
            onChange={(e) => mudarSituacao(e.target.value)} aria-label="Situação do projeto">
            <option value="ativo">Ativo</option>
            <option value="pausado">Pausado</option>
            <option value="concluido">Concluído</option>
          </select>
          <button className="btn btn-ghost" onClick={() => setMostrarConfig((v) => !v)}>
            {mostrarConfig ? 'Fechar' : 'Configurar'}
          </button>
        </div>
      </div>

      {mostrarConfig && (
        <section className="panel">
          <h2 className="panel-title">Configuração do projeto</h2>
          <p className="panel-sub">Colunas do quadro e marcos do projeto.</p>

          <h3 className="bloco-titulo">Colunas (status)</h3>
          <div className="chips-linha">
            {projeto.status.map((s) => (
              <span key={s.id} className="chip-status">
                <span className="ponto" style={{ background: s.cor }} />
                {s.nome}
                <button className="chip-x" onClick={() => apagarStatus(s.id)} title="Remover coluna">✕</button>
              </span>
            ))}
          </div>
          <form onSubmit={adicionarStatus} className="linha-form">
            <input className="input" placeholder="nova coluna" value={novoStatus}
              onChange={(e) => setNovoStatus(e.target.value)} />
            <button className="btn btn-primary" type="submit">Adicionar</button>
          </form>

          <h3 className="bloco-titulo">Etiquetas</h3>
          {projeto.etiquetas.length === 0 && <p className="panel-sub">Nenhuma etiqueta criada.</p>}
          <div className="chips-linha">
            {projeto.etiquetas.map((et) => (
              <span key={et.id} className="etiqueta" style={{ background: et.cor }}>{et.nome}</span>
            ))}
          </div>
          <form onSubmit={adicionarEtiqueta} className="linha-form">
            <input className="input" placeholder="nova etiqueta" value={novaEtiqueta.nome}
              onChange={(e) => setNovaEtiqueta((x) => ({ ...x, nome: e.target.value }))} />
            <input className="input input--cor" type="color" value={novaEtiqueta.cor}
              onChange={(e) => setNovaEtiqueta((x) => ({ ...x, cor: e.target.value }))}
              aria-label="Cor da etiqueta" />
            <button className="btn btn-primary" type="submit">Adicionar</button>
          </form>

          <h3 className="bloco-titulo">Marcos</h3>
          {projeto.marcos.length === 0 && <p className="panel-sub">Nenhum marco definido.</p>}
          <ul className="marcos">
            {projeto.marcos.map((mc) => (
              <li key={mc.id} className={mc.concluido ? 'feito' : ''}>
                <input type="checkbox" checked={mc.concluido}
                  onChange={(e) => definirMarco(mc.id, e.target.checked).then(recarregar)} />
                <span className="marco-nome">{mc.nome}</span>
                {mc.data && <span className="marco-data">{rotuloData(mc.data)}</span>}
                <button className="icon-btn" onClick={() => removerMarco(mc.id).then(recarregar)}>✕</button>
              </li>
            ))}
          </ul>
          <form onSubmit={adicionarMarco} className="linha-form">
            <input className="input" placeholder="nome do marco" value={novoMarco.nome}
              onChange={(e) => setNovoMarco((m) => ({ ...m, nome: e.target.value }))} />
            <input className="input" type="date" value={novoMarco.data}
              onChange={(e) => setNovoMarco((m) => ({ ...m, data: e.target.value }))} />
            <button className="btn btn-primary" type="submit">Adicionar</button>
          </form>

          <h3 className="bloco-titulo">Usar como modelo</h3>
          <p className="panel-sub">
            Copia colunas, etiquetas, tarefas e checklists para um projeto novo.
            Prazos e conclusões não vêm junto — são do ciclo anterior.
          </p>
          <form onSubmit={duplicar} className="linha-form">
            <input className="input" placeholder={`${projeto.nome} (cópia)`} value={nomeCopia}
              onChange={(e) => setNomeCopia(e.target.value)} />
            <label className="opcao-linha">
              <input type="checkbox" checked={copiaResponsaveis}
                onChange={(e) => setCopiaResponsaveis(e.target.checked)} />
              <span>manter responsáveis</span>
            </label>
            <button className="btn btn-primary" type="submit">Duplicar</button>
          </form>

          <h3 className="bloco-titulo">Zona de risco</h3>
          <button className="btn btn-perigo" onClick={apagarProjeto}>Arquivar projeto</button>
          <p className="form-nota">Vai para a lixeira e pode ser restaurado.</p>
        </section>
      )}

      {vista === 'lista' && (
        <VistaLista
          projeto={projeto}
          tarefas={doQuadro}
          aoAbrir={(id) => setParams({ tarefa: String(id) })}
        />
      )}

      {vista === 'calendario' && (
        <VistaCalendario
          projeto={projeto}
          tarefas={doQuadro}
          aoAbrir={(id) => setParams({ tarefa: String(id) })}
          aoRemarcar={async (id, prazo) => {
            // Otimista: a tarefa pula de dia na hora e volta se a API recusar.
            const antes = tarefas.find((t) => t.id === id)?.prazo ?? null
            setTarefas((lista) => lista.map((t) => (t.id === id ? { ...t, prazo } : t)))
            try {
              await atualizarTarefa(id, { prazo })
            } catch {
              setTarefas((lista) => lista.map((t) => (t.id === id ? { ...t, prazo: antes } : t)))
              notificar('Não foi possível remarcar')
            }
          }}
        />
      )}

      {vista === 'painel' && <PainelProjeto projeto={projeto} tarefas={tarefas} />}

      {vista === 'discussao' && (
        <Discussao
          tipo="projeto"
          alvoId={projeto.id}
          titulo={`Discussão de ${projeto.nome}`}
          subtitulo="Quem enxerga o projeto participa. Para assunto de uma tarefa específica, comente nela."
        />
      )}

      {vista === 'quadro' && (
        <div className="filtros-quadro">
          <input className="input input--compacto" placeholder="🔎 filtrar por título"
            value={filtros.texto}
            onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} />

          <select className="input input--compacto" value={filtros.responsavel}
            onChange={(e) => setFiltros((f) => ({ ...f, responsavel: e.target.value }))}
            aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            {equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>

          <select className="input input--compacto" value={filtros.prioridade}
            onChange={(e) => setFiltros((f) => ({ ...f, prioridade: e.target.value }))}
            aria-label="Filtrar por prioridade">
            <option value="">Todas as prioridades</option>
            {PRIORIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>

          {projeto.etiquetas.length > 0 && (
            <select className="input input--compacto" value={filtros.etiqueta}
              onChange={(e) => setFiltros((f) => ({ ...f, etiqueta: e.target.value }))}
              aria-label="Filtrar por etiqueta">
              <option value="">Todas as etiquetas</option>
              {projeto.etiquetas.map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
            </select>
          )}

          {filtrando && (
            <>
              <span className="filtros-contagem">
                {doQuadro.length} de {total}
              </span>
              <button className="btn btn-ghost"
                onClick={() => setFiltros({ responsavel: '', prioridade: '', etiqueta: '', texto: '' })}>
                Limpar
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------- Quadro kanban ---------- */}
      <div className="kanban" hidden={vista !== 'quadro'}>
        {projeto.status.map((s) => {
          const daColuna = doQuadro.filter((t) => t.status_id === s.id)
          return (
            <div
              key={s.id}
              className={`kanban-coluna ${colunaAlvo === s.id ? 'alvo' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setColunaAlvo(s.id) }}
              onDragLeave={() => setColunaAlvo((c) => (c === s.id ? null : c))}
              onDrop={() => soltarEm(s.id)}
            >
              <div className="kanban-topo">
                <span className="ponto" style={{ background: s.cor }} />
                <strong>{s.nome}</strong>
                <span className="kanban-contagem">{daColuna.length}</span>
              </div>

              <div className="kanban-cartoes">
                {daColuna.map((t) => (
                  <article
                    key={t.id}
                    className={`cartao ${arrastando === t.id ? 'arrastando' : ''}`}
                    draggable
                    onDragStart={() => setArrastando(t.id)}
                    onDragEnd={() => { setArrastando(null); setColunaAlvo(null) }}
                    onClick={() => setParams({ tarefa: String(t.id) })}
                  >
                    <div className="cartao-topo">
                      <span className={`prio prio-${t.prioridade}`} title={t.prioridade} />
                      <span className="tarefa-codigo">{projeto.codigo}-{t.numero}</span>
                    </div>
                    <span className="cartao-titulo">{t.titulo}</span>

                    {t.etiquetas.length > 0 && (
                      <div className="cartao-etiquetas">
                        {t.etiquetas.map((e) => (
                          <span key={e.id} className="etiqueta" style={{ background: e.cor }}>{e.nome}</span>
                        ))}
                      </div>
                    )}

                    <div className="cartao-rodape">
                      {t.checklist.total > 0 && (
                        <span className="cartao-meta">☑ {t.checklist.feitos}/{t.checklist.total}</span>
                      )}
                      {t.prazo && (
                        <span className={`cartao-meta ${t.prazo < hoje() && !t.concluida_em ? 'vencido' : ''}`}>
                          {rotuloData(t.prazo)}
                        </span>
                      )}
                      {t.responsaveis.length > 0 && (
                        <span className="avatares">
                          {t.responsaveis.slice(0, 3).map((r) => (
                            <Avatar key={r.id} pessoa={r} tamanho={24} />
                          ))}
                        </span>
                      )}
                    </div>

                    {/* Alternativa ao arrastar, para telas de toque */}
                    <div className="cartao-mover">
                      <button
                        disabled={projeto.status.findIndex((s) => s.id === t.status_id) === 0}
                        onClick={(e) => { e.stopPropagation(); moverColuna(t, -1) }}
                        aria-label="Mover para a coluna anterior"
                      >←</button>
                      <span className="cartao-mover-status">
                        {projeto.status.find((s) => s.id === t.status_id)?.nome}
                      </span>
                      <button
                        disabled={projeto.status.findIndex((s) => s.id === t.status_id) === projeto.status.length - 1}
                        onClick={(e) => { e.stopPropagation(); moverColuna(t, 1) }}
                        aria-label="Mover para a próxima coluna"
                      >→</button>
                    </div>
                  </article>
                ))}
              </div>

              {novaEm === s.id ? (
                <form
                  className="cartao-novo"
                  onSubmit={(e) => { e.preventDefault(); adicionarTarefa(s.id) }}
                >
                  <input className="input" autoFocus placeholder="título da tarefa"
                    value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)}
                    onBlur={() => { if (!novoTitulo.trim()) setNovaEm(null) }} />
                  <div className="linha-form">
                    <button className="btn btn-primary" type="submit">Adicionar</button>
                    <button className="btn btn-ghost" type="button"
                      onClick={() => { setNovaEm(null); setNovoTitulo('') }}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <button className="kanban-adicionar" onClick={() => { setNovaEm(s.id); setNovoTitulo('') }}>
                  + Tarefa
                </button>
              )}
            </div>
          )
        })}
      </div>

      {tarefaAberta && (
        <TarefaPainel
          tarefaId={Number(tarefaAberta)}
          projeto={projeto}
          tarefasDoProjeto={tarefas}
          equipe={equipe}
          prioridades={PRIORIDADES}
          aoFechar={() => setParams({})}
          aoMudar={recarregar}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
