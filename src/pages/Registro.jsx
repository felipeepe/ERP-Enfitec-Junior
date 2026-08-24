import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoEnfitecFull from '../assets/logo-enfitec-full.jpg'
import { getMembro, logout, listarRegistros, criarRegistro, removerRegistro } from '../lib/api'

// Diretorias reais da ENFITEC Júnior.
const AREAS = [
  'Presidência',
  'Administrativo-Financeiro',
  'Comercial',
  'Projetos',
  'Gestão de Pessoas',
  'Marketing',
]

// Atividades registráveis.
const TIPOS = [
  'Visita técnica',
  'Pesquisa',
  'Desenvolvimento de projeto',
  'Reunião de alinhamento',
  'Reunião com cliente',
]

const hoje = () => new Date().toISOString().slice(0, 10)

// Iniciais para o avatar (ex.: "Felipe Baseggio" -> "FB").
function iniciais(nome) {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] || ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

// Campo de HORAS: só dígitos, até 2 (bloqueia letras).
function sanitizeHoras(valor) {
  return valor.replace(/\D/g, '').slice(0, 2)
}

// Campo de MINUTOS: só dígitos, até 2, limitado a 59.
function sanitizeMinutos(valor) {
  const s = valor.replace(/\D/g, '').slice(0, 2)
  if (s !== '' && Number(s) > 59) return '59'
  return s
}

// Formata minutos totais como "H:MM".
function formatarMinutos(total) {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// Datas (YYYY-MM-DD) dos últimos 7 dias, do mais recente ao mais antigo.
function ultimosSeteDias() {
  const dias = []
  const base = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    dias.push(d.toISOString().slice(0, 10))
  }
  return dias
}

// Formata "2026-08-18" como "seg, 18/08".
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
function formatarDia(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  return `${DIAS_SEMANA[d.getDay()]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

// Mês atual no formato "2026-08" e rótulo "Agosto/2026".
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function mesAtual() {
  return new Date().toISOString().slice(0, 7)
}
function rotuloMes(ym) {
  const [ano, mes] = ym.split('-').map(Number)
  return `${MESES[mes - 1]}/${ano}`
}

// Desloca "2026-08" em N meses (ex.: -1 -> "2026-07").
function deslocarMes(ym, delta) {
  const [ano, mes] = ym.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Registro() {
  const navigate = useNavigate()
  const membro = getMembro()
  const nome = membro?.nome || 'Usuário'
  const email = membro?.email || ''
  const primeiroNome = nome.split(' ')[0]

  // Toast de feedback (auto-some).
  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  const [form, setForm] = useState({
    data: hoje(),
    area: AREAS[0],
    tipo: TIPOS[0],
    horas: '',
    minutos: '',
    descricao: '',
  })
  // Registros vindos do banco (via API).
  const [registros, setRegistros] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    listarRegistros()
      .then(setRegistros)
      .catch(() => notificar('Erro ao carregar registros'))
      .finally(() => setCarregando(false))
  }, [])

  function update(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.data > hoje()) {
      alert('Não é possível registrar horas em uma data futura.')
      return
    }
    const minutos = (Number(form.horas) || 0) * 60 + (Number(form.minutos) || 0)
    if (minutos <= 0) {
      alert('Informe o tempo trabalhado (horas e/ou minutos).')
      return
    }
    try {
      const novo = await criarRegistro({
        data: form.data,
        area: form.area,
        tipo: form.tipo,
        minutos,
        descricao: form.descricao || null,
      })
      setRegistros((r) => [novo, ...r])
      // Mantém os selects e a data; limpa tempo e descrição para o próximo lançamento.
      setForm((f) => ({ ...f, horas: '', minutos: '', descricao: '' }))
      notificar('Registro adicionado ✓')
    } catch {
      alert('Não foi possível salvar o registro. Verifique sua conexão.')
    }
  }

  async function remover(id) {
    if (!window.confirm('Remover este registro?')) return
    try {
      await removerRegistro(id)
      setRegistros((r) => r.filter((item) => item.id !== id))
      notificar('Registro removido')
    } catch {
      alert('Não foi possível remover o registro.')
    }
  }

  function sair() {
    logout()
    navigate('/')
  }

  // Histórico da semana: agrupa os registros dos últimos 7 dias por dia.
  const { grupos, totalSemana, qtdSemana } = useMemo(() => {
    const dias = ultimosSeteDias()
    const grupos = dias
      .map((dia) => {
        const itens = registros.filter((r) => r.data === dia)
        const subtotal = itens.reduce((s, r) => s + (r.minutos || 0), 0)
        return { dia, itens, subtotal }
      })
      .filter((g) => g.itens.length > 0)

    const totalSemana = grupos.reduce((s, g) => s + g.subtotal, 0)
    const qtdSemana = grupos.reduce((s, g) => s + g.itens.length, 0)
    return { grupos, totalSemana, qtdSemana }
  }, [registros])

  // Total do mês selecionado (permite navegar por meses passados).
  const [mesView, setMesView] = useState(mesAtual())
  const { totalMes, qtdMes } = useMemo(() => {
    const doMes = registros.filter((r) => String(r.data).startsWith(mesView))
    return {
      totalMes: doMes.reduce((s, r) => s + (r.minutos || 0), 0),
      qtdMes: doMes.length,
    }
  }, [registros, mesView])
  const podeAvancar = mesView < mesAtual()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src={logoEnfitecFull} alt="ENFITEC Jr." className="topbar-logo-full" />
        </div>
        <div className="topbar-user">
          <div className="avatar" aria-hidden="true">{iniciais(nome)}</div>
          <div className="topbar-userinfo">
            <span className="topbar-name">{nome}</span>
            <span className="topbar-email">{email}</span>
          </div>
          <button className="btn btn-ghost" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="content">
        <h1 className="saudacao">Olá {primeiroNome}!</h1>

        <div className="stats">
          <div className="stat-card stat-card--brand">
            <div className="mes-nav">
              <button type="button" className="mes-btn"
                onClick={() => setMesView((m) => deslocarMes(m, -1))}
                aria-label="Mês anterior">‹</button>
              <span className="stat-label">{rotuloMes(mesView)}</span>
              <button type="button" className="mes-btn"
                onClick={() => setMesView((m) => deslocarMes(m, 1))}
                disabled={!podeAvancar} aria-label="Próximo mês">›</button>
            </div>
            <span className="stat-value">{formatarMinutos(totalMes)}</span>
            <span className="stat-hint">Total do mês · {qtdMes} lançamento(s)</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Últimos 7 dias</span>
            <span className="stat-value">{formatarMinutos(totalSemana)}</span>
            <span className="stat-hint">{qtdSemana} lançamento(s)</span>
          </div>
        </div>

        <div className="grid">
          <section className="panel">
            <h2 className="panel-title">Registrar horas</h2>
            <p className="panel-sub">Informe quanto tempo trabalhou e no que foi destinado.</p>

            <form onSubmit={handleSubmit} className="form">
              <div className="row">
                <label className="field">
                  <span className="field-label">Data</span>
                  <input type="date" className="input" value={form.data}
                    max={hoje()}
                    onChange={(e) => update('data', e.target.value)} required />
                </label>
                <label className="field">
                  <span className="field-label">Tempo trabalhado</span>
                  <div className="duracao">
                    <div className="duracao-campo">
                      <input type="text" className="input" inputMode="numeric"
                        placeholder="0" value={form.horas}
                        onChange={(e) => update('horas', sanitizeHoras(e.target.value))} />
                      <span className="duracao-sufixo">h</span>
                    </div>
                    <div className="duracao-campo">
                      <input type="text" className="input" inputMode="numeric"
                        placeholder="00" value={form.minutos}
                        onChange={(e) => update('minutos', sanitizeMinutos(e.target.value))} />
                      <span className="duracao-sufixo">min</span>
                    </div>
                  </div>
                </label>
              </div>

              <div className="row">
                <label className="field">
                  <span className="field-label">Setor</span>
                  <select className="input" value={form.area}
                    onChange={(e) => update('area', e.target.value)}>
                    {AREAS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Atividade</span>
                  <select className="input" value={form.tipo}
                    onChange={(e) => update('tipo', e.target.value)}>
                    {TIPOS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
              </div>

              <label className="field">
                <span className="field-label">Descrição (opcional)</span>
                <textarea className="input textarea" rows="3"
                  placeholder="Detalhe o que foi feito..."
                  value={form.descricao}
                  onChange={(e) => update('descricao', e.target.value)} />
              </label>

              <button type="submit" className="btn btn-primary btn-block">
                Adicionar registro
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Histórico semanal</h2>
                <p className="panel-sub">Últimos 7 dias · {qtdSemana} lançamento(s)</p>
              </div>
              <div className="total">
                <span className="total-label">Total da semana</span>
                <span className="total-value">{formatarMinutos(totalSemana)}</span>
              </div>
            </div>

            {carregando ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden="true">⏳</div>
                <p>Carregando registros...</p>
              </div>
            ) : grupos.length === 0 ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden="true">🕒</div>
                <p>Nenhum registro nos últimos 7 dias.</p>
                <span>Preencha o formulário ao lado para começar.</span>
              </div>
            ) : (
              <div className="semana">
                {grupos.map((g) => (
                  <div key={g.dia} className="dia-grupo">
                    <div className="dia-head">
                      <span className="dia-nome">{formatarDia(g.dia)}</span>
                      <span className="dia-subtotal">{formatarMinutos(g.subtotal)}</span>
                    </div>
                    <ul className="list">
                      {g.itens.map((r) => (
                        <li key={r.id} className="list-item">
                          <div className="list-main">
                            <div className="list-top">
                              <span className="chip">{formatarMinutos(r.minutos)}</span>
                              <span className="list-projeto">{r.tipo}</span>
                            </div>
                            <div className="list-tags">
                              <span className="tag">{r.area}</span>
                            </div>
                            {r.descricao && <p className="list-desc">{r.descricao}</p>}
                          </div>
                          <button className="icon-btn" title="Remover"
                            onClick={() => remover(r.id)}>✕</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
