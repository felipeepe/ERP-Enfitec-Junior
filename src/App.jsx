import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'
import Gestao from './pages/Gestao.jsx'
import Projetos from './pages/Projetos.jsx'
import Projeto from './pages/Projeto.jsx'
import Documentacao from './pages/Documentacao.jsx'
import Mensagens from './pages/Mensagens.jsx'
import Agenda from './pages/Agenda.jsx'
import Perfil from './pages/Perfil.jsx'
import Lixeira from './pages/Lixeira.jsx'
import TrocarSenha from './pages/TrocarSenha.jsx'
import AppShell from './components/AppShell.jsx'
import { getToken, getMembro } from './lib/api'

// Toda seção do ERP exige login e senha definitiva. O conteúdo entra na moldura
// comum (menu superior + conta), então cada página só renderiza o próprio miolo.
function Protegida({ children }) {
  if (!getToken()) return <Navigate to="/" replace />
  if (getMembro()?.senha_provisoria) return <Navigate to="/trocar-senha" replace />
  return <AppShell>{children}</AppShell>
}

// Painel de Horas: a conta da gestão apenas MONITORA as horas da equipe e não lança
// as próprias — por isso ela vê o relatório consolidado, e o membro vê o formulário
// do próprio registro. Mesma aba, conteúdo diferente conforme o papel.
function PainelDeHoras() {
  return getMembro()?.role === 'gestor' ? <Gestao /> : <Registro />
}

function Autenticada({ children }) {
  return getToken() ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/trocar-senha" element={<Autenticada><TrocarSenha /></Autenticada>} />

      <Route path="/horas" element={<Protegida><PainelDeHoras /></Protegida>} />
      <Route path="/projetos" element={<Protegida><Projetos /></Protegida>} />
      <Route path="/projetos/:id" element={<Protegida><Projeto /></Protegida>} />
      <Route path="/documentacao" element={<Protegida><Documentacao /></Protegida>} />
      <Route path="/agenda" element={<Protegida><Agenda /></Protegida>} />
      <Route path="/mensagens" element={<Protegida><Mensagens /></Protegida>} />
      <Route path="/lixeira" element={<Protegida><Lixeira /></Protegida>} />
      <Route path="/perfil" element={<Protegida><Perfil /></Protegida>} />

      {/* Rotas anteriores ao menu de seções — mantidas para não quebrar links salvos. */}
      <Route path="/registro" element={<Navigate to="/horas" replace />} />
      <Route path="/gestao" element={<Navigate to="/horas" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
