import { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  resumoGestao, analiseGestao,
  listarMembros, salvarMembro, definirAtivoMembro,
} from '../lib/api'
import { SETORES } from '../lib/setores'
import { mesAtual, deslocarMes, rotuloMes, formatarMinutos } from '../lib/datas'

// Desenha um gráfico de barras horizontais dentro do PDF (jsPDF). Retorna o novo Y.
function desenharBarrasPDF(doc, titulo, dados, y) {
  if (y > 250) { doc.addPage(); y = 20 }
  doc.setFontSize(13); doc.setTextColor(10, 44, 84)
  doc.text(titulo, 14, y); y += 7
  const max = Math.max(...dados.map((d) => d.total_minutos), 1)
  const larguraTotal = 182
  doc.setFontSize(9)
  for (const d of dados) {
    if (y > 282) { doc.addPage(); y = 20 }
    doc.setTextColor(40, 40, 40)
    doc.text(String(d.rotulo), 14, y)
    doc.text(formatarMinutos(d.total_minutos), 196, y, { align: 'right' })
    y += 2
    doc.setFillColor(231, 238, 247); doc.rect(14, y, larguraTotal, 2.5, 'F')
    doc.setFillColor(10, 44, 84); doc.rect(14, y, larguraTotal * (d.total_minutos / max), 2.5, 'F')
    y += 8
  }
  return y + 2
}

// Gráfico de barras horizontais (série única, magnitude) — cor da marca, rótulos diretos.
function GraficoBarras({ dados, vazio }) {
  if (!dados || dados.length === 0) {
    return <div className="empty"><p>{vazio}</p></div>
  }
  const max = Math.max(...dados.map((d) => d.total_minutos)) || 1
  return (
    <ul className="grafico" role="list">
      {dados.map((d) => (
        <li key={d.rotulo} className="grafico-linha">
          <div className="grafico-topo">
            <span>{d.rotulo}</span>
            <span className="valor">{formatarMinutos(d.total_minutos)}</span>
          </div>
          <div className="grafico-trilho">
            <div className="grafico-barra"
              style={{ width: `${(d.total_minutos / max) * 100}%` }}
              title={`${d.rotulo}: ${formatarMinutos(d.total_minutos)}`} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function Gestao() {
  const [mesView, setMesView] = useState(mesAtual())
  const podeAvancar = mesView < mesAtual()
  const [setorView, setSetorView] = useState('') // '' = todos os setores
  const [resumo, setResumo] = useState([])
  const [analise, setAnalise] = useState({ por_setor: [], por_atividade: [], por_tipo: [], por_projeto: [] })
  const [membros, setMembros] = useState([])
  const [novo, setNovo] = useState({ email: '', nome: '', senha: '', setor: SETORES[0], role: 'membro' })

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  function carregarMembros() {
    listarMembros().then(setMembros).catch(() => notificar('Erro ao carregar membros'))
  }

  useEffect(() => { carregarMembros() }, [])
  useEffect(() => {
    resumoGestao(mesView, setorView).then(setResumo).catch(() => notificar('Erro ao carregar horas'))
    analiseGestao(mesView, setorView).then(setAnalise).catch(() => notificar('Erro ao carregar análise'))
  }, [mesView, setorView])

  const topSetor = analise.por_setor[0]
  const topAtividade = analise.por_atividade[0]

  // Agrega o resumo (por membro+setor) em uma linha por membro.
  const { porMembro, totalGeral } = useMemo(() => {
    const mapa = {}
    for (const l of resumo) {
      if (!mapa[l.nome]) mapa[l.nome] = { nome: l.nome, total: 0, qtd: 0, setores: [] }
      mapa[l.nome].total += l.total_minutos
      mapa[l.nome].qtd += l.qtd
      if (!mapa[l.nome].setores.includes(l.setor)) mapa[l.nome].setores.push(l.setor)
    }
    const porMembro = Object.values(mapa).sort((a, b) => b.total - a.total)
    const totalGeral = porMembro.reduce((s, m) => s + m.total, 0)
    return { porMembro, totalGeral }
  }, [resumo])

  async function adicionarMembro(e) {
    e.preventDefault()
    try {
      await salvarMembro(novo)
      setNovo({ email: '', nome: '', senha: '', setor: SETORES[0], role: 'membro' })
      carregarMembros()
      notificar('Membro salvo ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível salvar. Verifique os dados.')
    }
  }

  async function alternarAtivo(m) {
    try {
      await definirAtivoMembro(m.id, !m.ativo)
      carregarMembros()
      notificar(m.ativo ? 'Acesso desativado' : 'Acesso ativado')
    } catch {
      alert('Não foi possível atualizar o acesso.')
    }
  }

  function baixarPDF() {
    const setorLabel = setorView || 'Todos os setores'
    const doc = new jsPDF()

    // Cabeçalho
    doc.setFontSize(16); doc.setTextColor(10, 44, 84)
    doc.text('ENFITEC Junior - Relatorio de Horas', 14, 20)
    doc.setFontSize(11); doc.setTextColor(40, 40, 40)
    doc.text(`Mes: ${rotuloMes(mesView)}`, 14, 28)
    doc.text(`Setor: ${setorLabel}`, 14, 34)
    doc.text(`Total geral: ${formatarMinutos(totalGeral)}`, 14, 40)

    // Destaques da análise
    doc.text(`Setor com mais horas: ${topSetor ? `${topSetor.rotulo} (${formatarMinutos(topSetor.total_minutos)})` : '-'}`, 14, 47)
    doc.text(`Atividade mais trabalhada: ${topAtividade ? `${topAtividade.rotulo} (${formatarMinutos(topAtividade.total_minutos)})` : '-'}`, 14, 53)

    const estilo = { styles: { fontSize: 10 }, headStyles: { fillColor: [10, 44, 84] } }

    // Tabela: horas por membro
    autoTable(doc, {
      startY: 60,
      head: [['Membro', 'Setores', 'Lancamentos', 'Horas']],
      body: porMembro.map((m) => [m.nome, m.setores.join(', '), String(m.qtd), formatarMinutos(m.total)]),
      ...estilo,
    })

    // Análise em gráficos (barras)
    let y = doc.lastAutoTable.finalY + 12
    y = desenharBarrasPDF(doc, 'Horas por setor', analise.por_setor, y)
    y = desenharBarrasPDF(doc, 'Horas por atividade', analise.por_atividade, y)
    y = desenharBarrasPDF(doc, 'Horas por natureza', analise.por_tipo, y)
    if (analise.por_projeto.length) {
      y = desenharBarrasPDF(doc, 'Horas por projeto', analise.por_projeto, y)
    }
    desenharBarrasPDF(doc, 'Horas por membro', porMembro.map((m) => ({ rotulo: m.nome, total_minutos: m.total })), y)

    const slug = setorView ? '-' + setorView.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-') : ''
    doc.save(`relatorio-horas-${mesView}${slug}.pdf`)
  }

  return (
    <>
      <h1 className="saudacao">Painel de Horas</h1>

      {/* Filtro por setor — controla tabela, gráficos e PDF */}
      <div className="filtro-setor" role="group" aria-label="Filtrar por setor">
        <button className={`filtro-pill ${setorView === '' ? 'ativo' : ''}`}
          onClick={() => setSetorView('')}>Todos</button>
        {SETORES.map((s) => (
          <button key={s} className={`filtro-pill ${setorView === s ? 'ativo' : ''}`}
            onClick={() => setSetorView(s)}>{s}</button>
        ))}
      </div>

      {/* Relatório de horas */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Horas da equipe</h2>
            <p className="panel-sub">Relatório mensal · somente leitura</p>
          </div>
          <div className="mes-nav mes-nav--claro">
            <button className="mes-btn mes-btn--claro" onClick={() => setMesView((m) => deslocarMes(m, -1))}
              aria-label="Mês anterior">‹</button>
            <span className="mes-rotulo">{rotuloMes(mesView)}</span>
            <button className="mes-btn mes-btn--claro" onClick={() => setMesView((m) => deslocarMes(m, 1))}
              disabled={!podeAvancar} aria-label="Próximo mês">›</button>
          </div>
        </div>

        <div className="relatorio-head">
          <div className="total">
            <span className="total-label">Total geral</span>
            <span className="total-value">{formatarMinutos(totalGeral)}</span>
          </div>
          <button className="btn btn-primary" onClick={baixarPDF} disabled={porMembro.length === 0}>
            ⬇ Baixar relatório (PDF)
          </button>
        </div>

        {porMembro.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true">📊</div>
            <p>Nenhuma hora registrada em {rotuloMes(mesView)}.</p>
          </div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Membro</th><th>Setores</th><th className="num">Lanç.</th><th className="num">Horas</th></tr>
              </thead>
              <tbody>
                {porMembro.map((m) => (
                  <tr key={m.nome}>
                    <td className="forte-nome">{m.nome}</td>
                    <td className="setores">{m.setores.join(', ')}</td>
                    <td className="num">{m.qtd}</td>
                    <td className="num forte">{formatarMinutos(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Análise em gráficos */}
      <div className="stats">
        <div className="stat-card stat-card--brand">
          <span className="stat-label">Setor com mais horas</span>
          <span className="stat-value">{topSetor ? formatarMinutos(topSetor.total_minutos) : '0:00'}</span>
          <span className="stat-hint">{topSetor ? topSetor.rotulo : '—'}</span>
        </div>
        <div className="stat-card stat-card--brand">
          <span className="stat-label">Atividade mais trabalhada</span>
          <span className="stat-value">{topAtividade ? formatarMinutos(topAtividade.total_minutos) : '0:00'}</span>
          <span className="stat-hint">{topAtividade ? topAtividade.rotulo : '—'}</span>
        </div>
      </div>

      <div className="grid grid--admin">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Horas por setor</h2>
              <p className="panel-sub">{rotuloMes(mesView)}</p>
            </div>
          </div>
          <GraficoBarras dados={analise.por_setor} vazio="Sem dados neste mês." />
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Horas por atividade</h2>
              <p className="panel-sub">{rotuloMes(mesView)}</p>
            </div>
          </div>
          <GraficoBarras dados={analise.por_atividade} vazio="Sem dados neste mês." />
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Horas por membro</h2>
            <p className="panel-sub">{rotuloMes(mesView)}</p>
          </div>
        </div>
        <GraficoBarras
          dados={porMembro.map((m) => ({ rotulo: m.nome, total_minutos: m.total }))}
          vazio="Sem dados neste mês." />
      </section>

      {/* Gestão de membros */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Membros e acessos</h2>
            <p className="panel-sub">Cadastre novos membros e controle quem pode entrar</p>
          </div>
        </div>

        <form onSubmit={adicionarMembro} className="form-membro">
          <input className="input" type="email" required placeholder="e-mail corporativo"
            value={novo.email} onChange={(e) => setNovo((n) => ({ ...n, email: e.target.value }))} />
          <input className="input" type="text" required placeholder="Nome Sobrenome"
            value={novo.nome} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} />
          <input className="input" type="text" required placeholder="senha inicial"
            value={novo.senha} onChange={(e) => setNovo((n) => ({ ...n, senha: e.target.value }))} />
          <select className="input" value={novo.setor} aria-label="Diretoria"
            onChange={(e) => setNovo((n) => ({ ...n, setor: e.target.value }))}>
            {SETORES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input" value={novo.role} aria-label="Papel"
            onChange={(e) => setNovo((n) => ({ ...n, role: e.target.value }))}>
            <option value="membro">Membro</option>
            <option value="gestor">Gestor</option>
          </select>
          <button type="submit" className="btn btn-primary">Adicionar</button>
        </form>
        <p className="form-nota">
          A senha inicial é provisória — o membro define a própria senha no primeiro acesso.
        </p>

        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Diretoria</th><th>Papel</th><th className="num">Acesso</th></tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id} className={m.ativo ? '' : 'linha-vazia'}>
                  <td className="forte-nome">{m.nome}</td>
                  <td className="setores">{m.email}</td>
                  <td className="setores">{m.setor || '—'}</td>
                  <td>{m.role === 'gestor' ? 'Gestor' : 'Membro'}</td>
                  <td className="num">
                    <button className={m.ativo ? 'btn btn-ghost' : 'btn btn-primary'}
                      onClick={() => alternarAtivo(m)}>
                      {m.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
