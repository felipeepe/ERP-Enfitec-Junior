import { Fragment, useMemo, useState } from 'react'
import { hoje, rotuloData, formatarMinutos } from '../lib/datas'
import Avatar from './Avatar.jsx'

// Quadro é bom para ver fluxo e ruim para responder "o que vence esta semana".
// Esta vista existe para varrer: ordena por coluna e agrupa por quem/quando.
const ORDEM_PRIORIDADE = { urgente: 0, alta: 1, media: 2, baixa: 3 }

const AGRUPAMENTOS = [
  ['nenhum', 'Sem agrupar'],
  ['status', 'Por status'],
  ['responsavel', 'Por responsável'],
  ['prioridade', 'Por prioridade'],
]

export default function VistaLista({ projeto, tarefas, aoAbrir }) {
  const [ordem, setOrdem] = useState({ campo: 'prazo', asc: true })
  const [agrupar, setAgrupar] = useState('status')

  const statusPorId = useMemo(
    () => Object.fromEntries(projeto.status.map((s) => [s.id, s])),
    [projeto.status],
  )

  function ordenarPor(campo) {
    setOrdem((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: true }))
  }

  const ordenadas = useMemo(() => {
    const valor = (t) => {
      switch (ordem.campo) {
        case 'titulo': return t.titulo.toLowerCase()
        case 'status': return statusPorId[t.status_id]?.ordem ?? 99
        case 'prioridade': return ORDEM_PRIORIDADE[t.prioridade] ?? 9
        case 'responsavel': return (t.responsaveis[0]?.nome || 'zzz').toLowerCase()
        case 'estimativa': return t.estimativa_min ?? -1
        // Sem prazo vai para o fim, tanto crescente quanto decrescente: uma
        // tarefa sem data não é "a mais urgente".
        case 'prazo':
        default: return t.prazo || '9999-99-99'
      }
    }
    return [...tarefas].sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      if (va === vb) return a.numero - b.numero
      return (va < vb ? -1 : 1) * (ordem.asc ? 1 : -1)
    })
  }, [tarefas, ordem, statusPorId])

  const grupos = useMemo(() => {
    if (agrupar === 'nenhum') return [{ chave: '', rotulo: '', itens: ordenadas }]

    const mapa = new Map()
    for (const t of ordenadas) {
      let chaves
      if (agrupar === 'status') {
        chaves = [[t.status_id, statusPorId[t.status_id]?.nome || 'Sem status']]
      } else if (agrupar === 'prioridade') {
        chaves = [[t.prioridade, { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' }[t.prioridade] || t.prioridade]]
      } else {
        // Uma tarefa com dois responsáveis aparece nos dois grupos — é o que a
        // pessoa espera ao perguntar "o que é meu".
        chaves = t.responsaveis.length
          ? t.responsaveis.map((r) => [`m${r.id}`, r.nome])
          : [['sem', 'Sem responsável']]
      }
      for (const [chave, rotulo] of chaves) {
        if (!mapa.has(chave)) mapa.set(chave, { chave, rotulo, itens: [] })
        mapa.get(chave).itens.push(t)
      }
    }
    return [...mapa.values()]
  }, [ordenadas, agrupar, statusPorId])

  const seta = (campo) => (ordem.campo === campo ? (ordem.asc ? ' ▲' : ' ▼') : '')

  if (tarefas.length === 0) {
    return (
      <section className="panel">
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📋</div>
          <p>Nenhuma tarefa para listar.</p>
          <span>Crie tarefas no quadro para vê-las aqui.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Lista</h2>
          <p className="panel-sub">Clique no cabeçalho para ordenar.</p>
        </div>
        <select className="input input--compacto" value={agrupar}
          onChange={(e) => setAgrupar(e.target.value)} aria-label="Agrupar por">
          {AGRUPAMENTOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </div>

      <div className="tabela-wrap">
        <table className="tabela tabela-lista">
          <thead>
            <tr>
              <th><button className="th-ordenar" onClick={() => ordenarPor('titulo')}>Tarefa{seta('titulo')}</button></th>
              <th><button className="th-ordenar" onClick={() => ordenarPor('status')}>Status{seta('status')}</button></th>
              <th><button className="th-ordenar" onClick={() => ordenarPor('prioridade')}>Prior.{seta('prioridade')}</button></th>
              <th><button className="th-ordenar" onClick={() => ordenarPor('responsavel')}>Responsáveis{seta('responsavel')}</button></th>
              <th><button className="th-ordenar" onClick={() => ordenarPor('prazo')}>Prazo{seta('prazo')}</button></th>
              <th className="num"><button className="th-ordenar" onClick={() => ordenarPor('estimativa')}>Est.{seta('estimativa')}</button></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.chave || 'todos'}>
                {g.rotulo && (
                  <tr className="linha-grupo">
                    <td colSpan={6}>{g.rotulo} <span className="grupo-contagem">{g.itens.length}</span></td>
                  </tr>
                )}
                {g.itens.map((t) => {
                  const s = statusPorId[t.status_id]
                  const vencida = t.prazo && t.prazo < hoje() && !t.concluida_em
                  return (
                    <tr key={`${g.chave}-${t.id}`} className="linha-tarefa-lista"
                      onClick={() => aoAbrir(t.id)}>
                      <td>
                        <span className="tarefa-codigo">{projeto.codigo}-{t.numero}</span>{' '}
                        <span className={t.concluida_em ? 'titulo-concluido' : ''}>{t.titulo}</span>
                        {t.checklist.total > 0 && (
                          <span className="cartao-meta"> ☑ {t.checklist.feitos}/{t.checklist.total}</span>
                        )}
                      </td>
                      <td>
                        {s && (
                          <span className="chip-status">
                            <span className="ponto" style={{ background: s.cor }} />{s.nome}
                          </span>
                        )}
                      </td>
                      <td><span className={`prio prio-${t.prioridade}`} title={t.prioridade} /></td>
                      <td>
                        {t.responsaveis.length === 0
                          ? <span className="cartao-meta">—</span>
                          : (
                            <span className="avatares avatares--lista">
                              {t.responsaveis.map((r) => <Avatar key={r.id} pessoa={r} tamanho={24} />)}
                            </span>
                          )}
                      </td>
                      <td className={vencida ? 'vencido' : ''}>
                        {t.prazo ? rotuloData(t.prazo) : <span className="cartao-meta">—</span>}
                      </td>
                      <td className="num">
                        {t.estimativa_min ? formatarMinutos(t.estimativa_min) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
