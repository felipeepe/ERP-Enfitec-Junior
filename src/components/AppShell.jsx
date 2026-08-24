import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import logoEnfitecFull from '../assets/logo-enfitec-full.jpg'
import { getMembro, logout } from '../lib/api'
import BuscaGlobal from './BuscaGlobal.jsx'

// Seções do ERP. O menu é o mesmo para todos os papéis — o que muda é o conteúdo
// de cada aba (ver PainelDeHoras em App.jsx, que separa gestor de membro).
const ABAS = [
  { para: '/horas', rotulo: 'Painel de Horas' },
  { para: '/projetos', rotulo: 'Projetos' },
  { para: '/documentacao', rotulo: 'Documentação' },
]

// Iniciais para o avatar (ex.: "Felipe Baseggio" -> "FB").
function iniciais(nome) {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] || ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

// Moldura comum das telas autenticadas: marca, navegação entre seções e conta.
export default function AppShell({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const membro = getMembro()
  const nome = membro?.nome || 'Usuário'

  // O quadro kanban e o editor lado a lado precisam de mais largura que o
  // Painel de Horas, que fica no container estreito de sempre.
  const largo = /^\/projetos\/\d+/.test(pathname) || pathname.startsWith('/documentacao')

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
            </NavLink>
          ))}
        </nav>

        <BuscaGlobal />

        <div className="topbar-user">
          <div className="avatar" aria-hidden="true">{iniciais(nome)}</div>
          <div className="topbar-userinfo">
            <span className="topbar-name">{nome}</span>
            <span className="topbar-email">{membro?.email}</span>
          </div>
          <button className="btn btn-ghost" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className={`content ${largo ? 'content--largo' : ''}`}>{children}</main>
    </div>
  )
}
