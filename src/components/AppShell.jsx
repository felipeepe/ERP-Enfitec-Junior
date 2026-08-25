import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import logoEnfitecFull from '../assets/logo-enfitec-full.jpg'
import { getMembro, logout, contarNaoLidas, EVENTO_MEMBRO } from '../lib/api'
import BuscaGlobal from './BuscaGlobal.jsx'
import Avatar from './Avatar.jsx'
import BarraCronometro from './BarraCronometro.jsx'
import Notificacoes from './Notificacoes.jsx'

// Seções do ERP. O menu é o mesmo para todos os papéis — o que muda é o conteúdo
// de cada aba (ver PainelDeHoras em App.jsx, que separa gestor de membro).
const ABAS = [
  { para: '/horas', rotulo: 'Painel de Horas' },
  { para: '/projetos', rotulo: 'Projetos' },
  { para: '/documentacao', rotulo: 'Documentação' },
  { para: '/agenda', rotulo: 'Agenda' },
  { para: '/mensagens', rotulo: 'Mensagens' },
]

// Sem WebSocket em hospedagem compartilhada, o contador é reconsultado de
// tempos em tempos. Intervalo folgado: é só um número no menu.
const INTERVALO_NAO_LIDAS = 30000

export default function AppShell({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [membro, setMembro] = useState(getMembro)
  const [naoLidas, setNaoLidas] = useState(0)

  // Editar o perfil dispara este evento, e o cabeçalho reflete na hora.
  useEffect(() => {
    const aoMudar = (e) => setMembro(e.detail || getMembro())
    window.addEventListener(EVENTO_MEMBRO, aoMudar)
    return () => window.removeEventListener(EVENTO_MEMBRO, aoMudar)
  }, [])

  // O quadro kanban e o editor lado a lado precisam de mais largura que o
  // Painel de Horas, que fica no container estreito de sempre.
  const largo = /^\/projetos\/\d+/.test(pathname)
    || pathname.startsWith('/documentacao')
    || pathname.startsWith('/mensagens')
    || pathname.startsWith('/agenda')

  useEffect(() => {
    let vivo = true
    const atualizarContador = () => contarNaoLidas()
      .then((r) => { if (vivo) setNaoLidas(r.total) })
      .catch(() => {})
    atualizarContador()
    const t = setInterval(atualizarContador, INTERVALO_NAO_LIDAS)
    return () => { vivo = false; clearInterval(t) }
  }, [pathname]) // reconsulta ao trocar de tela, para zerar após abrir o chat

  function sair() {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src={logoEnfitecFull} alt="ENFITEC Jr." className="topbar-logo-full" />
        </div>

        <nav className="topnav" aria-label="Seções do sistema">
          {ABAS.map((a) => (
            <NavLink
              key={a.para}
              to={a.para}
              className={({ isActive }) => `topnav-item ${isActive ? 'ativo' : ''}`}
            >
              {a.rotulo}
              {a.para === '/mensagens' && naoLidas > 0 && (
                <span className="topnav-badge">{naoLidas > 9 ? '9+' : naoLidas}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <BuscaGlobal />

        <Notificacoes />

        <div className="topbar-user">
          <button className="botao-perfil" onClick={() => navigate('/perfil')} title="Meu perfil">
            <Avatar pessoa={membro} tamanho={38} />
            <span className="topbar-userinfo">
              <span className="topbar-name">{membro?.apelido || membro?.nome || 'Usuário'}</span>
              <span className="topbar-email">{membro?.email}</span>
            </span>
          </button>
          <button className="btn btn-ghost" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className={`content ${largo ? 'content--largo' : ''}`}>{children}</main>

      <BarraCronometro />
    </div>
  )
}
