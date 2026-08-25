import { useState } from 'react'
import { meuRelatorio } from '../lib/api'
import { formatarMinutos, rotuloData, hoje, rotuloMes } from '../lib/datas'

// Membro de EJ precisa comprovar horas para certificado e para a coordenação
// do curso. Até agora só existia "últimos 7 dias" e "total do mês".

// Períodos que uma EJ realmente usa. O semestre é o recorte da vida acadêmica.
function periodos() {
  const agora = new Date()
  const ano = agora.getFullYear()
  const primeiroSemestre = agora.getMonth() < 6
  return [
    ['semestre', primeiroSemestre ? `${ano}/1 (semestre atual)` : `${ano}/2 (semestre atual)`,
      primeiroSemestre ? `${ano}-01-01` : `${ano}-07-01`,
      primeiroSemestre ? `${ano}-06-30` : `${ano}-12-31`],
    ['anterior', primeiroSemestre ? `${ano - 1}/2` : `${ano}/1`,
      primeiroSemestre ? `${ano - 1}-07-01` : `${ano}-01-01`,
      primeiroSemestre ? `${ano - 1}-12-31` : `${ano}-06-30`],
    ['ano', `Ano de ${ano}`, `${ano}-01-01`, `${ano}-12-31`],
  ]
}

function Barras({ titulo, dados }) {
  if (!dados?.length) return null
  const max = Math.max(...dados.map((d) => d.total_minutos), 1)
  return (
    <>
      <h3 className="bloco-titulo">{titulo}</h3>
      <ul className="grafico" role="list">
        {dados.map((d) => (
          <li key={d.rotulo} className="grafico-linha">
            <div className="grafico-topo">
              <span>{d.rotulo}</span>
              <span className="valor">{formatarMinutos(d.total_minutos)}</span>
            </div>
            <div className="grafico-trilho">
              <div className="grafico-barra" style={{ width: `${(d.total_minutos / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function RelatorioPessoal({ aoNotificar }) {
  const opcoes = periodos()
  const [de, setDe] = useState(opcoes[0][2])
  const [ate, setAte] = useState(opcoes[0][3] > hoje() ? hoje() : opcoes[0][3])
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)

  async function gerar(novoDe = de, novoAte = ate) {
    setCarregando(true)
    try {
      setDados(await meuRelatorio(novoDe, novoAte))
    } catch (err) {
      aoNotificar?.(err?.message || 'Não foi possível gerar o relatório')
    } finally {
      setCarregando(false)
    }
  }

  function escolher([, , d, a]) {
    const fim = a > hoje() ? hoje() : a
    setDe(d)
    setAte(fim)
    gerar(d, fim)
  }

  async function baixarPDF() {
    // jsPDF só é carregado quando alguém realmente exporta: são ~200 KB que
    // não precisam entrar no primeiro carregamento de quem nunca clica aqui.
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    const doc = new jsPDF()
    const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

    doc.setFontSize(16); doc.setTextColor(10, 44, 84)
    doc.text('ENFITEC Junior - Comprovante de Horas', 14, 20)
    doc.setFontSize(11); doc.setTextColor(40, 40, 40)
    doc.text(semAcento(dados.membro.nome), 14, 29)
    doc.setFontSize(10); doc.setTextColor(90, 90, 90)
    doc.text(`${dados.membro.email}  |  ${semAcento(dados.membro.setor || 'sem diretoria')}`, 14, 35)
    doc.text(`Periodo: ${rotuloData(dados.de)} a ${rotuloData(dados.ate)}`, 14, 41)

    doc.setFontSize(13); doc.setTextColor(10, 44, 84)
    doc.text(`Total: ${formatarMinutos(dados.total_minutos)} em ${dados.lancamentos} lancamento(s)`, 14, 51)

    const estilo = { styles: { fontSize: 10 }, headStyles: { fillColor: [10, 44, 84] } }
    const linhas = (lista) => lista.map((d) => [semAcento(d.rotulo), formatarMinutos(d.total_minutos)])

    autoTable(doc, {
      startY: 58, head: [['Natureza da hora', 'Total']],
      body: linhas(dados.por_tipo), ...estilo,
    })
    if (dados.por_projeto.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8, head: [['Projeto', 'Total']],
        body: linhas(dados.por_projeto), ...estilo,
      })
    }
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8, head: [['Atividade', 'Total']],
      body: linhas(dados.por_atividade), ...estilo,
    })
    if (dados.por_mes.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8, head: [['Mes', 'Total']],
        body: dados.por_mes.map((d) => [rotuloMes(d.rotulo), formatarMinutos(d.total_minutos)]),
        ...estilo,
      })
    }

    doc.setFontSize(8); doc.setTextColor(120, 120, 120)
    doc.text(
      `Emitido em ${rotuloData(hoje())} pelo sistema da ENFITEC Junior.`,
      14, doc.lastAutoTable.finalY + 12,
    )
    doc.save(`horas-${semAcento(dados.membro.nome).replace(/\s+/g, '-').toLowerCase()}-${dados.de}-a-${dados.ate}.pdf`)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Comprovante de horas</h2>
          <p className="panel-sub">
            Para certificado, coordenação do curso ou prestação de contas da diretoria.
          </p>
        </div>
        {dados && dados.total_minutos > 0 && (
          <button className="btn btn-primary" onClick={baixarPDF}>⬇ Baixar PDF</button>
        )}
      </div>

      <div className="filtros-quadro">
        {opcoes.map((o) => (
          <button key={o[0]} className="btn btn-ghost" onClick={() => escolher(o)}>{o[1]}</button>
        ))}
      </div>

      <div className="row">
        <label className="field">
          <span className="field-label">De</span>
          <input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Até</span>
          <input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 14 }}
        onClick={() => gerar()} disabled={carregando}>
        {carregando ? 'Gerando…' : 'Gerar relatório'}
      </button>

      {dados && (
        dados.total_minutos === 0 ? (
          <div className="empty" style={{ marginTop: 20 }}>
            <div className="empty-icon" aria-hidden="true">🕒</div>
            <p>Nenhuma hora lançada neste período.</p>
          </div>
        ) : (
          <>
            <div className="stats stats--quatro" style={{ marginTop: 22 }}>
              <div className="stat-card stat-card--brand">
                <span className="stat-label">Total no período</span>
                <span className="stat-value">{formatarMinutos(dados.total_minutos)}</span>
                <span className="stat-hint">{dados.lancamentos} lançamento(s)</span>
              </div>
              {dados.por_tipo.slice(0, 3).map((t) => (
                <div className="stat-card" key={t.rotulo}>
                  <span className="stat-label">{t.rotulo}</span>
                  <span className="stat-value">{formatarMinutos(t.total_minutos)}</span>
                  <span className="stat-hint">
                    {Math.round((t.total_minutos / dados.total_minutos) * 100)}% do total
                  </span>
                </div>
              ))}
            </div>

            <Barras titulo="Por natureza da hora" dados={dados.por_tipo} />
            <Barras titulo="Por projeto" dados={dados.por_projeto} />
            <Barras titulo="Por atividade" dados={dados.por_atividade} />
            <Barras
              titulo="Por mês"
              dados={dados.por_mes.map((d) => ({ ...d, rotulo: rotuloMes(d.rotulo) }))}
            />
          </>
        )
      )}
    </section>
  )
}
