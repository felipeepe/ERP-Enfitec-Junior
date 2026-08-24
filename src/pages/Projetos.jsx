import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMembro, listarProjetos, criarProjeto, minhasTarefas, obterPainel } from '../lib/api'
import { SETORES } from '../lib/setores'
import { rotuloData, hoje } from '../lib/datas'
import PainelOKR from '../components/PainelOKR.jsx'

const SITUACOES = {
  ativo: 'Ativo',
  pausado: 'Pausado',
  concluido: 'Concluído',
  arquivado: 'Arquivado',
}

const CORES_PRIORIDADE = {
  urgente: 'prio-urgente',
  alta: 'prio-alta',
  media: 'prio-media',
  baixa: 'prio-baixa',
}

export default function Projetos() {
  const navigate = useNavigate()
  const membro = getMembro()

  const [projetos, setProjetos] = useState([])
  const [tarefas, setTarefas] = useState([])
  const [equipeNums, setEquipeNums] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [abrindoForm, setAbrindoForm] = useState(false)
  const [novo, setNovo] = useState({ nome: '', descricao: '', setor: membro?.setor || SETORES[0], prazo: '' })

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  function carregar() {
    return Promise.all([listarProjetos(), minhasTarefas()])
      .then(([p, t]) => { setProjetos(p); setTarefas(t) })
      .catch(() => notificar('Erro ao carregar projetos'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar()
    // Números agregados do escopo visível — o backend já aplica o filtro por diretoria.
    obterPainel().then(setEquipeNums).catch(() => {})
  }, [])

  async function adicionar(e) {
    e.preventDefault()
    if (!novo.nome.trim()) return
    try {
      const criado = await criarProjeto(novo)
      setNovo({ nome: '', descricao: '', setor: membro?.setor || SETORES[0], prazo: '' })
      setAbrindoForm(false)
      notificar('Projeto criado ✓')
      navigate(`/projetos/${criado.id}`)
    } catch (err) {
      alert(err?.message || 'Não foi possível criar o projeto.')
    }
  }

  const atrasadas = tarefas.filter((t) => t.prazo && t.prazo < hoje()).length

  return (
    <>
      <h1 className="saudacao">Projetos</h1>

      {/* Minhas tarefas: o atalho que concentra a maior parte do valor diário */}
      <div className="stats">
        <div className="stat-card stat-card--brand">
          <span className="stat-label">Minhas tarefas abertas</span>
          <span className="stat-value">{tarefas.length}</span>
          <span className="stat-hint">
            {atrasadas > 0 ? `${atrasadas} com prazo vencido` : 'nenhuma atrasada'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Projetos visíveis</span>
          <span className="stat-value">{projetos.length}</span>
          <span className="stat-hint">
            {membro?.role === 'gestor' ? 'todas as diretorias' : membro?.setor || 'sem diretoria definida'}
          </span>
        </div>
      </div>

      {equipeNums && (
        <div className="stats stats--quatro">
          <div className="stat-card">
            <span className="stat-label">Projetos ativos</span>
            <span className="stat-value">{equipeNums.projetos_ativos}</span>
            <span className="stat-hint">no seu escopo</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tarefas abertas</span>
            <span className="stat-value">{equipeNums.tarefas_abertas}</span>
            <span className="stat-hint">{equipeNums.tarefas_concluidas} já concluídas</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Atrasadas</span>
            <span className={`stat-value ${equipeNums.tarefas_atrasadas > 0 ? 'valor-alerta' : ''}`}>
              {equipeNums.tarefas_atrasadas}
            </span>
            <span className="stat-hint">prazo vencido na equipe</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Páginas de documentação</span>
            <span className="stat-value">{equipeNums.documentos}</span>
            <span className="stat-hint">conhecimento registrado</span>
          </div>
        </div>
      )}

      {equipeNums?.carga?.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Carga da equipe</h2>
              <p className="panel-sub">Tarefas abertas por pessoa, somando todos os projetos</p>
            </div>
          </div>
          <ul className="grafico" role="list">
            {equipeNums.carga.map((c) => (
              <li key={c.nome} className="grafico-linha">
                <div className="grafico-topo">
                  <span>{c.nome}</span>
                  <span className="valor">{c.total} tarefa(s)</span>
                </div>
                <div className="grafico-trilho">
                  <div className="grafico-barra"
                    style={{ width: `${(c.total / Math.max(...equipeNums.carga.map((x) => x.total))) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tarefas.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Minhas tarefas</h2>
              <p className="panel-sub">Atribuídas a você e ainda não concluídas</p>
            </div>
          </div>
          <ul className="lista-tarefas">
            {tarefas.slice(0, 8).map((t) => (
              <li key={t.id}>
                <button className="linha-tarefa" onClick={() => navigate(`/projetos/${t.projeto_id}?tarefa=${t.id}`)}>
                  <span className={`prio ${CORES_PRIORIDADE[t.prioridade] || 'prio-media'}`} title={t.prioridade} />
                  <span className="tarefa-codigo">{t.codigo}</span>
                  <span className="tarefa-titulo">{t.titulo}</span>
                  <span className="tarefa-projeto">{t.projeto_nome}</span>
                  {t.prazo && (
                    <span className={`tarefa-prazo ${t.prazo < hoje() ? 'vencido' : ''}`}>
                      {rotuloData(t.prazo)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Projetos da sua diretoria</h2>
            <p className="panel-sub">
              Cada pessoa enxerga os projetos da própria seção de atuação.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setAbrindoForm((v) => !v)}>
            {abrindoForm ? 'Cancelar' : '+ Novo projeto'}
          </button>
        </div>

        {abrindoForm && (
          <form onSubmit={adicionar} className="form form-projeto">
            <div className="row">
              <label className="field">
                <span className="field-label">Nome do projeto</span>
                <input className="input" required autoFocus value={novo.nome}
                  placeholder="ex.: Braço Robótico Thoth"
                  onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Diretoria</span>
                <select className="input" value={novo.setor}
                  disabled={membro?.role !== 'gestor'}
                  onChange={(e) => setNovo((n) => ({ ...n, setor: e.target.value }))}>
                  {SETORES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span className="field-label">Descrição (opcional)</span>
                <input className="input" value={novo.descricao}
                  onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Prazo (opcional)</span>
                <input type="date" className="input" value={novo.prazo}
                  onChange={(e) => setNovo((n) => ({ ...n, prazo: e.target.value }))} />
              </label>
            </div>
            <button type="submit" className="btn btn-primary">Criar projeto</button>
          </form>
        )}

        {carregando ? (
          <div className="empty"><div className="empty-icon" aria-hidden="true">⏳</div><p>Carregando…</p></div>
        ) : projetos.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true">📁</div>
            <p>Nenhum projeto {membro?.setor ? `em ${membro.setor}` : 'visível'}.</p>
            <span>
              {membro?.role !== 'gestor' && !membro?.setor
                ? 'Seu cadastro ainda não tem diretoria — peça à gestão para definir.'
                : 'Crie o primeiro com o botão acima.'}
            </span>
          </div>
        ) : (
          <div className="cards-projeto">
            {projetos.map((p) => {
              const { total, concluidas } = p.tarefas
              const pct = total ? Math.round((concluidas / total) * 100) : 0
              return (
                <button key={p.id} className="card-projeto" onClick={() => navigate(`/projetos/${p.id}`)}>
                  <div className="card-projeto-topo">
                    <span className="tarefa-codigo">{p.codigo}</span>
                    <span className={`situacao situacao--${p.situacao}`}>{SITUACOES[p.situacao] || p.situacao}</span>
                  </div>
                  <strong className="card-projeto-nome">{p.nome}</strong>
                  {p.descricao && <span className="card-projeto-desc">{p.descricao}</span>}
                  <div className="card-projeto-barra">
                    <div className="grafico-trilho">
                      <div className="grafico-barra" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="card-projeto-pct">{concluidas}/{total} · {pct}%</span>
                  </div>
                  <div className="card-projeto-rodape">
                    <span className="tag">{p.setor}</span>
                    {p.prazo && <span className="card-projeto-prazo">Prazo {rotuloData(p.prazo)}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <PainelOKR aoNotificar={notificar} />

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
