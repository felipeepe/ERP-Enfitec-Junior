import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoEnfitecFull from '../assets/logo-enfitec-full.jpg'
import { loginSenha } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const membro = await loginSenha(email.trim(), senha)
      // O papel decide o conteúdo do Painel de Horas, não mais a rota.
      navigate(membro?.senha_provisoria ? '/trocar-senha' : '/horas', { replace: true })
    } catch (err) {
      setErro(err?.message || 'Não foi possível entrar. Verifique a conexão com o servidor.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand brand--center">
          <img src={logoEnfitecFull} alt="ENFITEC Jr." className="brand-logo-full" />
          <p className="brand-sub">Registrador de Horas</p>
        </div>

        <h2 className="auth-title">Entrar</h2>
        <p className="auth-desc">Acesse com seu e-mail e senha da ENFITEC.</p>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span className="field-label">E-mail</span>
            <input type="email" required className="input" autoFocus
              placeholder="nome.sobrenome@enfitecjunior.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Senha</span>
            <input type="password" required className="input"
              placeholder="••••••••"
              value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>

          {erro && <p className="auth-erro">{erro}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="auth-footnote">
          Não tem acesso? Peça à gestão para cadastrar seu e-mail.
        </p>
        <p className="auth-slogan">“Se não for impossível, a gente faz!”</p>
      </div>
    </div>
  )
}
