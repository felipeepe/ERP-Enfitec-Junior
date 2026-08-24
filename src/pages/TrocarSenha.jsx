import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoEnfitecFull from '../assets/logo-enfitec-full.jpg'
import { getMembro, trocarSenha, logout } from '../lib/api'

export default function TrocarSenha() {
  const navigate = useNavigate()
  const membro = getMembro()
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (nova.length < 6) {
      setErro('A nova senha deve ter ao menos 6 caracteres.')
      return
    }
    if (nova !== confirma) {
      setErro('As senhas não coincidem.')
      return
    }
    setCarregando(true)
    try {
      await trocarSenha(nova)
      navigate(membro?.role === 'gestor' ? '/gestao' : '/registro', { replace: true })
    } catch (err) {
      setErro(err?.message || 'Não foi possível trocar a senha.')
    } finally {
      setCarregando(false)
    }
  }

  function sair() {
    logout()
    navigate('/')
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand brand--center">
          <img src={logoEnfitecFull} alt="ENFITEC Jr." className="brand-logo-full" />
        </div>

        <h2 className="auth-title">Crie sua senha</h2>
        <p className="auth-desc">
          Este é seu primeiro acesso. Defina uma senha pessoal para continuar.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span className="field-label">Nova senha</span>
            <input type="password" required className="input" autoFocus
              placeholder="ao menos 6 caracteres"
              value={nova} onChange={(e) => setNova(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Confirmar nova senha</span>
            <input type="password" required className="input"
              placeholder="repita a senha"
              value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          </label>

          {erro && <p className="auth-erro">{erro}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={carregando}>
            {carregando ? 'Salvando...' : 'Salvar e entrar'}
          </button>
        </form>

        <button className="auth-alt" onClick={sair}>Sair</button>
      </div>
    </div>
  )
}
