import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMembro, obterAgenda, criarEvento, atualizarEvento, removerEvento,
  definirPresenca, definirParticipantes, listarEquipe, listarProjetos,
} from '../lib/api'
import {
  hoje, mesAtual, deslocarMes, rotuloMes, rotuloData,
  gradeDoMes, limitesDoMes, DIAS_CURTOS,
} from '../lib/datas'
import { SETORES } from '../lib/setores'
import Avatar from '../components/Avatar.jsx'

const TIPOS = [
  ['reuniao', 'Reunião', '👥'],
  ['visita', 'Visita técnica', '🚗'],
  ['evento', 'Evento', '🎤'],
  ['treinamento', 'Treinamento', '📚'],
]
const rotuloTipo = (t) => (TIPOS.find(([v]) => v === t) || [, t, '•'])[1]
const iconeTipo = (t) => (TIPOS.find(([v]) => v === t) || [, , '•'])[2]

const vazio = () => ({
  titulo: '', descricao: '', tipo: 'reuniao', local: '',
  data: hoje(), data_fim: '', hora_inicio: '', hora_fim: '',
  dia_inteiro: false, setor: '', projeto_id: '', participantes: [],
})

export default function Agenda() {
  const navigate = useNavigate()
  const eu = getMembro()

  const [mes, setMes] = useState(mesAtual())
  const [apenasMeus, setApenasMeus] = useState(false)
  const [dados, setDados] = useState({ eventos: [], prazos: [] })
  const [carregando, setCarregando] = useState(true)
  const [equipe, setEquipe] = useState([])
  const [projetos, setProjetos] = useState([])

  const [aberto, setAberto] = useState(null)   // evento em detalhe
  const [form, setForm] = useState(null)       // rascunho de criação/edição

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  const carregar = useCallback(() => {
    const [de, ate] = limitesDoMes(mes)
    return obterAgenda(de, ate, apenasMeus)
      .then(setDados)
      .catch(() => notificar('Erro ao carregar a agenda'))
      .finally(() => setCarregando(false))
  }, [mes, apenasMeus])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    listarEquipe().then(setEquipe).catch(() => {})
    listarProjetos().then(setProjetos).catch(() => {})
  }, [])

  // Espalha cada compromisso por todos os dias que ele ocupa.
  const porDia = useMemo(() => {
    const mapa = {}
    for (const e of dados.eventos) {
      const fim = e.data_fim || e.data
      const d = new Date(`${e.data}T12:00:00`)
      const limite = new Date(`${fim}T12:00:00`)
      while (d <= limite) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        ;(mapa[iso] ||= []).push({ tipo: 'evento', dado: e })
        d.setDate(d.getDate() + 1)
      }
    }
    for (const p of dados.prazos) {
      ;(mapa[p.data] ||= []).push({ tipo: 'prazo', dado: p })
    }
    return mapa
  }, [dados])

  const celulas = useMemo(() => gradeDoMes(mes), [mes])

  // Lista dos próximos, para quem prefere ler em sequência a olhar a grade.
  const proximos = useMemo(
    () => dados.eventos.filter((e) => (e.data_fim || e.data) >= hoje()).slice(0, 8),
    [dados.eventos],
  )

  async function salvarEvento(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    const corpo = {
      ...form,
      projeto_id: form.projeto_id ? Number(form.projeto_id) : null,
      setor: form.setor || null,
      data_fim: form.data_fim || null,
    }
    try {
      if (form.id) {
        await atualizarEvento(form.id, corpo)
        await definirParticipantes(form.id, form.participantes)
      } else {
        const criado = await criarEvento(corpo)
        if (form.participantes.length) {
          await definirParticipantes(criado.id, form.participantes)
        }
      }
      setForm(null)
      setAberto(null)
      carregar()
      notificar('Compromisso salvo ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível salvar.')
    }
  }

  async function responder(evento, situacao) {
    await definirPresenca(evento.id, situacao)
    const atualizado = await obterAgenda(...limitesDoMes(mes), apenasMeus)
    setDados(atualizado)
    setAberto(atualizado.eventos.find((x) => x.id === evento.id) || null)
  }

  async function apagar(evento) {
    if (!window.confirm(`Remover "${evento.titulo}"?`)) return
    await removerEvento(evento.id)
    setAberto(null)
    carregar()
  }

  const minhaSituacao = (e) => e.participantes.find((p) => p.id === eu?.id)?.situacao
  const podeEditar = (e) => e.criado_por === eu?.id || eu?.role === 'gestor'

  return (
    <>
      <h1 className="saudacao">Agenda</h1>

      <div className="agenda-barra">
        <div className="alternador">
          <button className={!apenasMeus ? 'ativo' : ''} onClick={() => setApenasMeus(false)}>Toda a equipe</button>
          <button className={apenasMeus ? 'ativo' : ''} onClick={() => setApenasMeus(true)}>Só os meus</button>
        </div>

        <div className="mes-nav mes-nav--claro">
          <button className="mes-btn mes-btn--claro" onClick={() => setMes((m) => deslocarMes(m, -1))}
            aria-label="Mês anterior">‹</button>
          <span className="mes-rotulo">{rotuloMes(mes)}</span>
          <button className="mes-btn mes-btn--claro" onClick={() => setMes((m) => deslocarMes(m, 1))}
            aria-label="Próximo mês">›</button>
        </div>

        <button className="btn btn-ghost" onClick={() => setMes(mesAtual())}>Hoje</button>
        <button className="btn btn-primary" onClick={() => setForm(vazio())}>+ Novo compromisso</button>
      </div>

      <div className="agenda-layout">
        <section className="panel">
          {carregando ? (
            <p className="panel-sub">Carregando…</p>
          ) : (
            <div className="calendario">
              {DIAS_CURTOS.map((d) => <div key={d} className="cal-cabecalho">{d}</div>)}

              {celulas.map((c) => (
                <div key={c.iso}
                  className={`cal-dia ${c.doMes ? '' : 'fora'} ${c.iso === hoje() ? 'e-hoje' : ''}`}
                  onDoubleClick={() => setForm({ ...vazio(), data: c.iso })}
                >
                  <span className="cal-numero">{c.dia}</span>
                  <div className="cal-tarefas">
                    {(porDia[c.iso] || []).map((item, i) => (
                      item.tipo === 'evento' ? (
                        <button key={`e${item.dado.id}-${i}`}
                          className={`cal-tarefa evento-${item.dado.tipo}`}
                          onClick={() => setAberto(item.dado)}
                          title={`${rotuloTipo(item.dado.tipo)}: ${item.dado.titulo}`}
                        >
                          <span className="evento-icone">{iconeTipo(item.dado.tipo)}</span>
                          <span className="cal-tarefa-titulo">
                            {item.dado.hora_inicio ? `${item.dado.hora_inicio} ` : ''}{item.dado.titulo}
                          </span>
                        </button>
                      ) : (
                        <button key={`p${item.dado.id}-${i}`}
                          className={`cal-tarefa cal-prazo ${item.dado.concluida ? 'feita' : ''}`}
                          onClick={() => navigate(`/projetos/${item.dado.projeto_id}?tarefa=${item.dado.id}`)}
                          title={`Prazo · ${item.dado.codigo} · ${item.dado.projeto_nome}`}
                        >
                          <span className={`prio prio-${item.dado.prioridade}`} />
                          <span className="cal-tarefa-titulo">{item.dado.titulo}</span>
                        </button>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="form-nota">
            Compromissos têm ícone; prazos de tarefa têm bolinha de prioridade.
            Dois cliques num dia criam um compromisso nele.
          </p>
        </section>

        <aside className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Próximos</h2>
              <p className="panel-sub">{proximos.length === 0 ? 'Nada marcado daqui pra frente' : 'Do mais próximo em diante'}</p>
            </div>
          </div>
          <ul className="proximos">
            {proximos.map((e) => (
              <li key={e.id}>
                <button className="proximo" onClick={() => setAberto(e)}>
                  <span className="proximo-data">
                    {rotuloData(e.data).slice(0, 5)}
                    <span>{e.dia_inteiro || !e.hora_inicio ? 'dia todo' : e.hora_inicio}</span>
                  </span>
                  <span className="proximo-corpo">
                    <strong>{iconeTipo(e.tipo)} {e.titulo}</strong>
                    {e.local && <span>{e.local}</span>}
                  </span>
                  {minhaSituacao(e) === 'convidado' && <span className="chat-badge">!</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* ---------- Detalhe do compromisso ---------- */}
      {aberto && !form && (
        <div className="drawer-fundo" onClick={() => setAberto(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog">
            <header className="drawer-topo">
              <span className="tag">{iconeTipo(aberto.tipo)} {rotuloTipo(aberto.tipo)}</span>
              <div className="drawer-acoes">
                {podeEditar(aberto) && (
                  <>
                    <button className="btn btn-ghost" onClick={() => setForm({
                      ...aberto,
                      data_fim: aberto.data_fim || '',
                      hora_inicio: aberto.hora_inicio || '',
                      hora_fim: aberto.hora_fim || '',
                      local: aberto.local || '',
                      descricao: aberto.descricao || '',
                      setor: aberto.setor || '',
                      projeto_id: aberto.projeto_id || '',
                      participantes: aberto.participantes.map((p) => p.id),
                    })}>Editar</button>
                    <button className="icon-btn" onClick={() => apagar(aberto)} title="Remover">🗑</button>
                  </>
                )}
                <button className="icon-btn" onClick={() => setAberto(null)} title="Fechar">✕</button>
              </div>
            </header>

            <h2 className="drawer-titulo" style={{ paddingBottom: 4 }}>{aberto.titulo}</h2>

            <div className="drawer-corpo">
              <ul className="dados-conta">
                <li><span>Quando</span><strong>
                  {rotuloData(aberto.data)}
                  {aberto.data_fim && aberto.data_fim !== aberto.data && ` até ${rotuloData(aberto.data_fim)}`}
                  {aberto.dia_inteiro || !aberto.hora_inicio
                    ? ' · dia todo'
                    : ` · ${aberto.hora_inicio}${aberto.hora_fim ? `–${aberto.hora_fim}` : ''}`}
                </strong></li>
                {aberto.local && <li><span>Onde</span><strong>{aberto.local}</strong></li>}
                <li><span>Quem organiza</span><strong>{aberto.setor || 'ENFITEC (todas)'}</strong></li>
              </ul>

              {aberto.descricao && <p className="discussao-texto">{aberto.descricao}</p>}

              <div className="field">
                <span className="field-label">Você vai?</span>
                <div className="alternador">
                  <button className={minhaSituacao(aberto) === 'vai' ? 'ativo' : ''}
                    onClick={() => responder(aberto, 'vai')}>Vou</button>
                  <button className={minhaSituacao(aberto) === 'nao_vai' ? 'ativo' : ''}
                    onClick={() => responder(aberto, 'nao_vai')}>Não vou</button>
                </div>
              </div>

              <div className="field">
                <span className="field-label">Participantes ({aberto.participantes.length})</span>
                <ul className="participantes">
                  {aberto.participantes.map((p) => (
                    <li key={p.id}>
                      <Avatar pessoa={p} tamanho={30} />
                      <span className="participante-nome">{p.apelido || p.nome}</span>
                      <span className={`selo-presenca selo-${p.situacao}`}>
                        {{ vai: 'vai', nao_vai: 'não vai', convidado: 'sem resposta' }[p.situacao]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ---------- Criar / editar ---------- */}
      {form && (
        <div className="drawer-fundo" onClick={() => setForm(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog">
            <header className="drawer-topo">
              <strong>{form.id ? 'Editar compromisso' : 'Novo compromisso'}</strong>
              <button className="icon-btn" onClick={() => setForm(null)} title="Fechar">✕</button>
            </header>

            <form className="drawer-corpo" onSubmit={salvarEvento}>
              <label className="field">
                <span className="field-label">Título</span>
                <input className="input" required autoFocus value={form.titulo}
                  placeholder="ex.: Reunião com o cliente"
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
              </label>

              <div className="field">
                <span className="field-label">Tipo</span>
                <div className="tipos-hora">
                  {TIPOS.map(([v, r, ic]) => (
                    <button key={v} type="button"
                      className={`tipo-hora ${form.tipo === v ? 'ativo' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, tipo: v }))}>
                      <strong>{ic} {r}</strong>
                    </button>
                  ))}
                </div>
              </div>

              <div className="row">
                <label className="field">
                  <span className="field-label">Data</span>
                  <input type="date" required className="input" value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
                </label>
                <label className="field">
                  <span className="field-label">Termina em <span className="field-opcional">(se durar dias)</span></span>
                  <input type="date" className="input" value={form.data_fim} min={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
                </label>
              </div>

              <label className="opcao-linha">
                <input type="checkbox" checked={form.dia_inteiro}
                  onChange={(e) => setForm((f) => ({ ...f, dia_inteiro: e.target.checked }))} />
                <span>Dia inteiro (sem horário)</span>
              </label>

              {!form.dia_inteiro && (
                <div className="row">
                  <label className="field">
                    <span className="field-label">Começa</span>
                    <input type="time" className="input" value={form.hora_inicio}
                      onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Termina</span>
                    <input type="time" className="input" value={form.hora_fim}
                      onChange={(e) => setForm((f) => ({ ...f, hora_fim: e.target.value }))} />
                  </label>
                </div>
              )}

              <label className="field">
                <span className="field-label">Local <span className="field-opcional">(opcional)</span></span>
                <input className="input" value={form.local} placeholder="Sala, endereço ou link da chamada"
                  onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))} />
              </label>

              <div className="row">
                <label className="field">
                  <span className="field-label">Diretoria</span>
                  <select className="input" value={form.setor}
                    disabled={eu?.role !== 'gestor'}
                    onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))}>
                    <option value="">ENFITEC inteira</option>
                    {SETORES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Projeto <span className="field-opcional">(opcional)</span></span>
                  <select className="input" value={form.projeto_id}
                    onChange={(e) => setForm((f) => ({ ...f, projeto_id: e.target.value }))}>
                    <option value="">Nenhum</option>
                    {projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
                  </select>
                </label>
              </div>

              <label className="field">
                <span className="field-label">Descrição <span className="field-opcional">(opcional)</span></span>
                <textarea className="input textarea" rows="3" value={form.descricao}
                  placeholder="Pauta, o que levar, o que decidir…"
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
              </label>

              <div className="field">
                <span className="field-label">Convidar ({form.participantes.length})</span>
                <div className="selecao-multipla">
                  {equipe.filter((p) => p.id !== eu?.id).map((p) => {
                    const marcado = form.participantes.includes(p.id)
                    return (
                      <button key={p.id} type="button"
                        className={`opcao ${marcado ? 'marcada' : ''}`}
                        onClick={() => setForm((f) => ({
                          ...f,
                          participantes: marcado
                            ? f.participantes.filter((x) => x !== p.id)
                            : [...f.participantes, p.id],
                        }))}>
                        {p.nome}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                {form.id ? 'Salvar alterações' : 'Criar compromisso'}
              </button>
            </form>
          </aside>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
