import { useEffect, useState } from 'react'
import {
  getMembro, listarObjetivos, criarObjetivo, criarResultado,
  atualizarResultado, removerObjetivo,
} from '../lib/api'

// Objetivo > Resultado-chave. Os níveis "Lista" e "Objetivo de time" foram
// deixados de fora de propósito: numa EJ de 40 pessoas eles ficariam vazios.
export default function PainelOKR({ aoNotificar }) {
  const membro = getMembro()
  const [objetivos, setObjetivos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [abrindo, setAbrindo] = useState(false)
  const [novo, setNovo] = useState({ titulo: '', periodo: '' })
  const [novoKR, setNovoKR] = useState({})

  function carregar() {
    return listarObjetivos()
      .then(setObjetivos)
      .catch(() => aoNotificar?.('Erro ao carregar objetivos'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => { carregar() }, [])

  async function adicionarObjetivo(e) {
    e.preventDefault()
    if (!novo.titulo.trim()) return
    await criarObjetivo(novo)
    setNovo({ titulo: '', periodo: '' })
    setAbrindo(false)
    carregar()
    aoNotificar?.('Objetivo criado ✓')
  }

  async function adicionarKR(e, objetivoId) {
    e.preventDefault()
    const dados = novoKR[objetivoId]
    if (!dados?.titulo?.trim()) return
    await criarResultado(objetivoId, {
      titulo: dados.titulo.trim(),
      alvo: Number(dados.alvo) || 100,
      atual: 0,
      unidade: dados.unidade || null,
    })
    setNovoKR((m) => ({ ...m, [objetivoId]: { titulo: '', alvo: '', unidade: '' } }))
    carregar()
  }

  async function mudarAtual(krId, valor) {
    await atualizarResultado(krId, Number(valor) || 0)
    carregar()
  }

  async function apagar(objetivoId, titulo) {
    if (!window.confirm(`Remover o objetivo "${titulo}"?`)) return
    await removerObjetivo(objetivoId)
    carregar()
  }

  // Progresso do objetivo = média dos resultados-chave.
  function progresso(o) {
    if (!o.resultados.length) return 0
    const soma = o.resultados.reduce(
      (s, k) => s + Math.min(100, k.alvo ? (k.atual / k.alvo) * 100 : 0), 0)
    return Math.round(soma / o.resultados.length)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Objetivos e resultados-chave</h2>
          <p className="panel-sub">
            A camada acima das tarefas — o que a diretoria quer alcançar no semestre.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAbrindo((v) => !v)}>
          {abrindo ? 'Cancelar' : '+ Novo objetivo'}
        </button>
      </div>

      {abrindo && (
        <form onSubmit={adicionarObjetivo} className="linha-form">
          <input className="input" required autoFocus value={novo.titulo}
            placeholder="ex.: Criar plataforma robótica funcional"
            onChange={(e) => setNovo((n) => ({ ...n, titulo: e.target.value }))} />
          <input className="input" value={novo.periodo} placeholder="2026/2"
            style={{ maxWidth: 120 }}
            onChange={(e) => setNovo((n) => ({ ...n, periodo: e.target.value }))} />
          <button className="btn btn-primary" type="submit">Criar</button>
        </form>
      )}

      {carregando ? (
        <p className="panel-sub">Carregando…</p>
      ) : objetivos.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🎯</div>
          <p>Nenhum objetivo definido.</p>
          <span>Sem isso, as tarefas não têm a que se ligar.</span>
        </div>
      ) : (
        <div className="okr">
          {objetivos.map((o) => {
            const pct = progresso(o)
            const rascunho = novoKR[o.id] || { titulo: '', alvo: '', unidade: '' }
            return (
              <article key={o.id} className="okr-item">
                <div className="okr-topo">
                  <h3 className="okr-titulo">{o.titulo}</h3>
                  <div className="chips-linha">
                    {o.periodo && <span className="okr-periodo">{o.periodo}</span>}
                    <span className="tag">{o.setor || 'geral'}</span>
                    {membro?.role === 'gestor' && (
                      <button className="icon-btn" onClick={() => apagar(o.id, o.titulo)}>✕</button>
                    )}
                  </div>
                </div>

                <div className="card-projeto-barra">
                  <div className="grafico-trilho">
                    <div className="grafico-barra" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="card-projeto-pct">{pct}%</span>
                </div>

                {o.resultados.length > 0 && (
                  <ul className="okr-krs">
                    {o.resultados.map((k) => {
                      const kp = k.alvo ? Math.min(100, Math.round((k.atual / k.alvo) * 100)) : 0
                      return (
                        <li key={k.id}>
                          <div className="okr-kr-topo">
                            <span className="okr-kr-titulo">{k.titulo}</span>
                            <input
                              className="input okr-kr-campo" type="number" defaultValue={k.atual}
                              onBlur={(e) => Number(e.target.value) !== k.atual && mudarAtual(k.id, e.target.value)}
                              aria-label={`Valor atual de ${k.titulo}`} />
                            <span className="okr-kr-valor">/ {k.alvo}{k.unidade ? ` ${k.unidade}` : ''}</span>
                          </div>
                          <div className="grafico-trilho">
                            <div className="grafico-barra" style={{ width: `${kp}%` }} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <form className="linha-form" onSubmit={(e) => adicionarKR(e, o.id)}>
                  <input className="input" placeholder="novo resultado-chave" value={rascunho.titulo}
                    onChange={(e) => setNovoKR((m) => ({ ...m, [o.id]: { ...rascunho, titulo: e.target.value } }))} />
                  <input className="input" type="number" placeholder="alvo" style={{ maxWidth: 90 }}
                    value={rascunho.alvo}
                    onChange={(e) => setNovoKR((m) => ({ ...m, [o.id]: { ...rascunho, alvo: e.target.value } }))} />
                  <input className="input" placeholder="unidade" style={{ maxWidth: 110 }}
                    value={rascunho.unidade}
                    onChange={(e) => setNovoKR((m) => ({ ...m, [o.id]: { ...rascunho, unidade: e.target.value } }))} />
                  <button className="btn btn-ghost" type="submit">Adicionar</button>
                </form>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
