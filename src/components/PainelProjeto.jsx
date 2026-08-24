import { useMemo } from 'react'
import { hoje, formatarMinutos } from '../lib/datas'

const ROTULO_PRIORIDADE = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' }
const ORDEM_PRIORIDADE = ['urgente', 'alta', 'media', 'baixa']

// Barra de progresso com rótulo, no mesmo desenho dos gráficos do Painel de Horas.
function Barra({ rotulo, valor, total, cor, sufixo }) {
  const pct = total ? Math.round((valor / total) * 100) : 0
  return (
    <li className="grafico-linha">
      <div className="grafico-topo">
        <span>{rotulo}</span>
        <span className="valor">{sufixo ?? `${valor}/${total} · ${pct}%`}</span>
      </div>
      <div className="grafico-trilho">
        <div className="grafico-barra" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </li>
  )
}

export default function PainelProjeto({ projeto, tarefas }) {
  const dados = useMemo(() => {
    const topo = tarefas.filter((t) => !t.tarefa_pai_id)
    const categoriaPorStatus = Object.fromEntries(projeto.status.map((s) => [s.id, s.categoria]))
    const concluida = (t) => categoriaPorStatus[t.status_id] === 'concluido'

    const porStatus = projeto.status.map((s) => ({
      rotulo: s.nome,
      cor: s.cor,
      total: topo.filter((t) => t.status_id === s.id).length,
    }))

    const porPrioridade = ORDEM_PRIORIDADE
      .map((p) => ({ rotulo: ROTULO_PRIORIDADE[p], total: topo.filter((t) => t.prioridade === p).length }))
      .filter((x) => x.total > 0)

    // Carga por pessoa: só o que ainda está aberto.
    const carga = {}
    for (const t of topo) {
      if (concluida(t)) continue
      for (const r of t.responsaveis) carga[r.nome] = (carga[r.nome] || 0) + 1
    }
    const porPessoa = Object.entries(carga)
      .map(([nome, total]) => ({ rotulo: nome, total }))
      .sort((a, b) => b.total - a.total)

    const semDono = topo.filter((t) => !concluida(t) && t.responsaveis.length === 0).length
    const atrasadas = topo.filter((t) => t.prazo && t.prazo < hoje() && !concluida(t)).length

    const itensChecklist = tarefas.reduce((s, t) => s + (t.checklist?.total || 0), 0)
    const feitosChecklist = tarefas.reduce((s, t) => s + (t.checklist?.feitos || 0), 0)

    return {
      totalTopo: topo.length,
      concluidas: topo.filter(concluida).length,
      subtarefas: tarefas.length - topo.length,
      porStatus, porPrioridade, porPessoa,
      semDono, atrasadas,
      itensChecklist, feitosChecklist,
      marcosFeitos: projeto.marcos.filter((m) => m.concluido).length,
      marcosTotal: projeto.marcos.length,
    }
  }, [projeto, tarefas])

  const pctGeral = dados.totalTopo ? Math.round((dados.concluidas / dados.totalTopo) * 100) : 0
  const maxStatus = Math.max(...dados.porStatus.map((s) => s.total), 1)

  if (dados.totalTopo === 0) {
    return (
      <section className="panel">
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📊</div>
          <p>Sem tarefas para medir ainda.</p>
          <span>Crie tarefas no quadro para o painel ganhar conteúdo.</span>
        </div>
      </section>
    )
  }

  return (
    <>
      <div className="stats stats--quatro">
        <div className="stat-card stat-card--brand">
          <span className="stat-label">Progresso</span>
          <span className="stat-value">{pctGeral}%</span>
          <span className="stat-hint">{dados.concluidas} de {dados.totalTopo} tarefas</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Atrasadas</span>
          <span className={`stat-value ${dados.atrasadas > 0 ? 'valor-alerta' : ''}`}>{dados.atrasadas}</span>
          <span className="stat-hint">com prazo vencido</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Sem responsável</span>
          <span className={`stat-value ${dados.semDono > 0 ? 'valor-alerta' : ''}`}>{dados.semDono}</span>
          <span className="stat-hint">tarefas abertas</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Horas lançadas</span>
          <span className="stat-value">{formatarMinutos(projeto.minutos_lancados)}</span>
          <span className="stat-hint">vindas do Painel de Horas</span>
        </div>
      </div>

      <div className="grid grid--admin">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Distribuição por status</h2>
              <p className="panel-sub">Onde o trabalho está parado</p>
            </div>
          </div>
          <ul className="grafico" role="list">
            {dados.porStatus.map((s) => (
              <Barra key={s.rotulo} rotulo={s.rotulo} valor={s.total} total={maxStatus}
                cor={s.cor} sufixo={`${s.total} tarefa(s)`} />
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Por prioridade</h2>
              <p className="panel-sub">Todas as tarefas do projeto</p>
            </div>
          </div>
          {dados.porPrioridade.length === 0 ? (
            <div className="empty"><p>Sem dados.</p></div>
          ) : (
            <ul className="grafico" role="list">
              {dados.porPrioridade.map((p) => (
                <Barra key={p.rotulo} rotulo={p.rotulo} valor={p.total}
                  total={Math.max(...dados.porPrioridade.map((x) => x.total))}
                  sufixo={`${p.total} tarefa(s)`} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Carga por pessoa</h2>
            <p className="panel-sub">Tarefas abertas atribuídas — quem está sobrecarregado</p>
          </div>
        </div>
        {dados.porPessoa.length === 0 ? (
          <div className="empty"><p>Nenhuma tarefa aberta atribuída.</p></div>
        ) : (
          <ul className="grafico" role="list">
            {dados.porPessoa.map((p) => (
              <Barra key={p.rotulo} rotulo={p.rotulo} valor={p.total}
                total={Math.max(...dados.porPessoa.map((x) => x.total))}
                sufixo={`${p.total} tarefa(s)`} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid--admin">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Marcos</h2>
              <p className="panel-sub">{dados.marcosTotal === 0 ? 'Nenhum marco definido' : 'Progresso do projeto'}</p>
            </div>
          </div>
          {dados.marcosTotal === 0 ? (
            <div className="empty"><p>Defina marcos em “Configurar”.</p></div>
          ) : (
            <ol className="trilha">
              {projeto.marcos.map((m) => (
                <li key={m.id} className={m.concluido ? 'feito' : ''}>
                  <span className="trilha-ponto" />
                  <span className="trilha-nome">{m.nome}</span>
                  {m.data && <span className="marco-data">{m.data.split('-').reverse().join('/')}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Detalhamento</h2>
              <p className="panel-sub">Números que não cabem em gráfico</p>
            </div>
          </div>
          <ul className="grafico" role="list">
            <Barra rotulo="Tarefas concluídas" valor={dados.concluidas} total={dados.totalTopo} />
            {dados.itensChecklist > 0 && (
              <Barra rotulo="Itens de checklist" valor={dados.feitosChecklist} total={dados.itensChecklist} />
            )}
            {dados.marcosTotal > 0 && (
              <Barra rotulo="Marcos atingidos" valor={dados.marcosFeitos} total={dados.marcosTotal} />
            )}
          </ul>
          <p className="panel-sub" style={{ marginTop: 16 }}>
            {dados.subtarefas} subtarefa(s) além das {dados.totalTopo} tarefas de topo.
          </p>
        </section>
      </div>
    </>
  )
}
