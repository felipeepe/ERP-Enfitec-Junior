import { useMemo, useState } from 'react'
import { hoje, mesAtual, deslocarMes, rotuloMes, gradeDoMes, DIAS_CURTOS } from '../lib/datas'

// Prazos num mês. Para uma EJ que trabalha por entrega, "o que vence quando" é
// mais legível numa grade do que em coluna de status.

export default function VistaCalendario({ projeto, tarefas, aoAbrir, aoRemarcar }) {
  const [mes, setMes] = useState(mesAtual())
  const [arrastando, setArrastando] = useState(null)
  const [diaAlvo, setDiaAlvo] = useState(null)

  const celulas = useMemo(() => gradeDoMes(mes), [mes])

  const porDia = useMemo(() => {
    const mapa = {}
    for (const t of tarefas) {
      if (!t.prazo) continue
      ;(mapa[t.prazo] ||= []).push(t)
    }
    return mapa
  }, [tarefas])

  const semPrazo = tarefas.filter((t) => !t.prazo)

  async function soltarNoDia(iso) {
    const id = arrastando
    setArrastando(null)
    setDiaAlvo(null)
    if (!id) return
    const t = tarefas.find((x) => x.id === id)
    if (!t || t.prazo === iso) return
    await aoRemarcar(id, iso)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Calendário</h2>
          <p className="panel-sub">Arraste uma tarefa para outro dia para remarcar o prazo.</p>
        </div>
        <div className="mes-nav mes-nav--claro">
          <button className="mes-btn mes-btn--claro" onClick={() => setMes((m) => deslocarMes(m, -1))}
            aria-label="Mês anterior">‹</button>
          <span className="mes-rotulo">{rotuloMes(mes)}</span>
          <button className="mes-btn mes-btn--claro" onClick={() => setMes((m) => deslocarMes(m, 1))}
            aria-label="Próximo mês">›</button>
        </div>
      </div>

      <div className="calendario">
        {DIAS_CURTOS.map((d) => <div key={d} className="cal-cabecalho">{d}</div>)}

        {celulas.map((c) => (
          <div
            key={c.iso}
            className={[
              'cal-dia',
              c.doMes ? '' : 'fora',
              c.iso === hoje() ? 'e-hoje' : '',
              diaAlvo === c.iso ? 'alvo' : '',
            ].join(' ')}
            onDragOver={(e) => { e.preventDefault(); setDiaAlvo(c.iso) }}
            onDragLeave={() => setDiaAlvo((d) => (d === c.iso ? null : d))}
            onDrop={() => soltarNoDia(c.iso)}
          >
            <span className="cal-numero">{c.dia}</span>
            <div className="cal-tarefas">
              {(porDia[c.iso] || []).map((t) => (
                <button
                  key={t.id}
                  className={`cal-tarefa ${t.concluida_em ? 'feita' : ''} ${arrastando === t.id ? 'arrastando' : ''}`}
                  draggable
                  onDragStart={() => setArrastando(t.id)}
                  onDragEnd={() => { setArrastando(null); setDiaAlvo(null) }}
                  onClick={() => aoAbrir(t.id)}
                  title={`${projeto.codigo}-${t.numero} · ${t.titulo}`}
                >
                  <span className={`prio prio-${t.prioridade}`} />
                  <span className="cal-tarefa-titulo">{t.titulo}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {semPrazo.length > 0 && (
        <>
          <h3 className="bloco-titulo">Sem prazo ({semPrazo.length})</h3>
          <p className="panel-sub">Arraste para um dia da grade para definir o prazo.</p>
          <div className="cal-sem-prazo">
            {semPrazo.map((t) => (
              <button
                key={t.id}
                className={`cal-tarefa ${arrastando === t.id ? 'arrastando' : ''}`}
                draggable
                onDragStart={() => setArrastando(t.id)}
                onDragEnd={() => { setArrastando(null); setDiaAlvo(null) }}
                onClick={() => aoAbrir(t.id)}
              >
                <span className={`prio prio-${t.prioridade}`} />
                <span className="cal-tarefa-titulo">{t.titulo}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
