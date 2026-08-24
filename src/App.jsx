import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'
import Gestao from './pages/Gestao.jsx'
import TrocarSenha from './pages/TrocarSenha.jsx'
import { getToken, getMembro } from './lib/api'

// Requer login; se a senha for provisória, força a troca antes de tudo.
function Protegida({ children }) {
  if (!getToken()) return <Navigate to="/" replace />
  if (getMembro()?.senha_provisoria) return <Navigate to="/trocar-senha" replace />
  if (getMembro()?.role === 'gestor') return <Navigate to="/gestao" replace />
  return children
}

function ProtegidaGestor({ children }) {
  if (!getToken()) return <Navigate to="/" replace />
  if (getMembro()?.senha_provisoria) return <Navigate to="/trocar-senha" replace />
  return getMembro()?.role === 'gestor' ? children : <Navigate to="/registro" replace />
}

function Autenticada({ children }) {
  return getToken() ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/trocar-senha" element={<Autenticada><TrocarSenha /></Autenticada>} />
      <Route path="/registro" element={<Protegida><Registro /></Protegida>} />
      <Route path="/gestao" element={<ProtegidaGestor><Gestao /></ProtegidaGestor>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
