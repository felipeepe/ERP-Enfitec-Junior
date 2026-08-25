import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listarNotificacoes, contarNotificacoes, marcarNotificacaoLida, EVENTO_NOTIFICACAO,
} from '../lib/api'

// Sino no topo. Sem WebSocket em hospedagem compartilhada, reconsulta de tempos
// em tempos — intervalo folgado, porque é só um número.
const INTERVALO = 45000

const ICONE = {
  tarefa_atribuida: '📌',
  mencao: '💬',
  convite: '📅',
}

function quando(iso) {
  if (!iso) return ''
  const agora = new Date()
  const d = new Date(String(iso).replace(' ', 'T'))
  const min = Math.round((agora - d) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.round(h / 24)} d`
}

export default function Notificacoes() {
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState([])
  const [total, setTotal] = useState(0)
  const caixa = useRef(null)

  const atualizarContagem = useCallback(
    () => contarNotificacoes().then((r) => setTotal(r.total)).catch(() => {}),
    [],
  )

  useEffect(() => {
    atualizarContagem()
    const t = setInterval(atualizarContagem, INTERVALO)
    window.addEventListener(EVENTO_NOTIFICACAO, atualizarContagem)
    return () => {
      clearInterval(t)
      window.removeEventListener(EVENTO_NOTIFICACAO, atualizarContagem)
    }
  }, [atualizarContagem])

  useEffect(() => {
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  async function abrir() {
    const novo = !aberto
    setAberto(novo)
    if (novo) {
      setItens(await listarNotificacoes().catch(() => []))
    }
  }

  async function ir(n) {
    setAberto(false)
    if (!n.lida) {
      await marcarNotificacaoLida(n.id)
      atualizarContagem()
    }
    if (n.link) navigate(n.link)
  }

  async function lerTodas() {
    await marcarNotificacaoLida()
    setItens((l) => l.map((n) => ({ ...n, lida: true })))
    atualizarContagem()
  }

  return (
    <div className="sino" ref={caixa}>
      <button className="sino-botao" onClick={abrir} aria-label={`Notificações${total ? ` (${total} não lidas)` : ''}`}>
        🔔
        {total > 0 && <span className="sino-badge">{total > 9 ? '9+' : total}</span>}
      </button>

      {aberto && (
        <div className="sino-painel">
          <div className="sino-topo">
            <strong>Notificações</strong>
            {total > 0 && <button className="sino-marcar" onClick={lerTodas}>Marcar todas como lidas</button>}
          </div>

          {itens.length === 0 ? (
            <p className="busca-vazio">Nada por aqui ainda.</p>
          ) : (
            <ul className="sino-lista">
              {itens.map((n) => (
                <li key={n.id}>
                  <button className={`sino-item ${n.lida ? '' : 'nova'}`} onClick={() => ir(n)}>
                    <span className="sino-icone">{ICONE[n.tipo] || '•'}</span>
                    <span className="sino-corpo">
                      <strong>{n.titulo}</strong>
                      {n.texto && <span className="sino-texto">{n.texto}</span>}
                    </span>
                    <span className="sino-quando">{quando(n.criado_em)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
