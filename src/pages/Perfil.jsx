import { useEffect, useRef, useState } from 'react'
import {
  obterPerfil, salvarPerfil, trocarSenhaPropria, atualizarMembroLocal,
} from '../lib/api'
import Avatar from '../components/Avatar.jsx'

// Cores sugeridas para quem não quer subir foto. São as da identidade da EJ,
// mais algumas para dar variedade sem virar arco-íris.
const CORES = [
  '#0a2c54', '#1565c0', '#2e7d32', '#b8860b',
  '#c2185b', '#6a1b9a', '#00838f', '#5d4037',
]

// Redimensiona no navegador antes de enviar. Sem isso, uma foto de celular de
// 4 MB iria inteira para o banco e voltaria em toda listagem.
const LADO = 256
function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Arquivo não parece ser uma imagem.'))
      img.onload = () => {
        // Recorta o quadrado central: avatar é redondo, então esticar deforma.
        const lado = Math.min(img.width, img.height)
        const sx = (img.width - lado) / 2
        const sy = (img.height - lado) / 2

        const tela = document.createElement('canvas')
        tela.width = LADO
        tela.height = LADO
        const ctx = tela.getContext('2d')
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO)
        resolve(tela.toDataURL('image/jpeg', 0.82))
      }
      img.src = leitor.result
    }
    leitor.readAsDataURL(arquivo)
  })
}

export default function Perfil() {
  const [perfil, setPerfil] = useState(null)
  const [rascunho, setRascunho] = useState({ apelido: '', bio: '', telefone: '', cor_avatar: '' })
  const [senhas, setSenhas] = useState({ atual: '', nova: '', confirma: '' })
  const [erroSenha, setErroSenha] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    obterPerfil()
      .then((p) => {
        setPerfil(p)
        setRascunho({
          apelido: p.apelido || '', bio: p.bio || '',
          telefone: p.telefone || '', cor_avatar: p.cor_avatar || '',
        })
      })
      .catch(() => notificar('Erro ao carregar o perfil'))
  }, [])

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      const atualizado = await salvarPerfil(rascunho)
      setPerfil(atualizado)
      // O cabeçalho lê do localStorage, então reflete na hora.
      atualizarMembroLocal({
        nome: atualizado.nome, apelido: atualizado.apelido,
        cor_avatar: atualizado.cor_avatar, foto: atualizado.foto,
      })
      notificar('Perfil salvo ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function trocarFoto(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    try {
      const foto = await reduzirImagem(arquivo)
      const atualizado = await salvarPerfil({ foto })
      setPerfil(atualizado)
      atualizarMembroLocal({ foto: atualizado.foto })
      notificar('Foto atualizada ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível processar a imagem.')
    }
  }

  async function removerFoto() {
    const atualizado = await salvarPerfil({ foto: '' })
    setPerfil(atualizado)
    atualizarMembroLocal({ foto: null })
    notificar('Foto removida')
  }

  async function mudarSenha(e) {
    e.preventDefault()
    setErroSenha('')
    if (senhas.nova.length < 6) {
      setErroSenha('A nova senha deve ter ao menos 6 caracteres.')
      return
    }
    if (senhas.nova !== senhas.confirma) {
      setErroSenha('As senhas não coincidem.')
      return
    }
    try {
      await trocarSenhaPropria(senhas.atual, senhas.nova)
      setSenhas({ atual: '', nova: '', confirma: '' })
      notificar('Senha alterada ✓')
    } catch (err) {
      setErroSenha(err?.message || 'Não foi possível trocar a senha.')
    }
  }

  if (!perfil) {
    return <div className="empty"><p>Carregando perfil…</p></div>
  }

  const previa = { ...perfil, apelido: rascunho.apelido, cor_avatar: rascunho.cor_avatar }

  return (
    <>
      <h1 className="saudacao">Meu perfil</h1>

      <div className="grid grid--admin">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Como você aparece</h2>
              <p className="panel-sub">Isso é o que a equipe vê nas tarefas e no chat.</p>
            </div>
          </div>

          <div className="perfil-topo">
            <Avatar pessoa={previa} tamanho={96} />
            <div className="perfil-acoes">
              <label className="enviar-arquivo">
                📷 {perfil.foto ? 'Trocar foto' : 'Enviar foto'}
                <input type="file" accept="image/*" onChange={trocarFoto} />
              </label>
              {perfil.foto && (
                <button className="btn btn-ghost" onClick={removerFoto}>Remover foto</button>
              )}
              <p className="form-nota">
                A imagem é recortada em quadrado e reduzida no seu navegador antes de subir.
              </p>
            </div>
          </div>

          <form onSubmit={salvar} className="form">
            <label className="field">
              <span className="field-label">Como quer ser chamado</span>
              <input className="input" maxLength={60} placeholder={perfil.nome}
                value={rascunho.apelido}
                onChange={(e) => setRascunho((r) => ({ ...r, apelido: e.target.value }))} />
            </label>

            <label className="field">
              <span className="field-label">Sobre você</span>
              <textarea className="input textarea" rows="3"
                placeholder="No que você trabalha, o que domina, como te acionar…"
                value={rascunho.bio}
                onChange={(e) => setRascunho((r) => ({ ...r, bio: e.target.value }))} />
            </label>

            <label className="field">
              <span className="field-label">Telefone (opcional)</span>
              <input className="input" maxLength={30} placeholder="(51) 90000-0000"
                value={rascunho.telefone}
                onChange={(e) => setRascunho((r) => ({ ...r, telefone: e.target.value }))} />
            </label>

            <div className="field">
              <span className="field-label">Cor do avatar</span>
              <div className="cores">
                {CORES.map((c) => (
                  <button key={c} type="button"
                    className={`cor ${rascunho.cor_avatar === c ? 'ativa' : ''}`}
                    style={{ background: c }} title={c}
                    onClick={() => setRascunho((r) => ({ ...r, cor_avatar: c }))} />
                ))}
                <button type="button" className="cor cor--limpar" title="Cor padrão"
                  onClick={() => setRascunho((r) => ({ ...r, cor_avatar: '' }))}>✕</button>
              </div>
              <span className="form-nota">Usada quando não há foto.</span>
            </div>

            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar perfil'}
            </button>
          </form>
        </section>

        <div className="coluna">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Dados da conta</h2>
                <p className="panel-sub">Definidos pela gestão — fale com ela para mudar.</p>
              </div>
            </div>
            <ul className="dados-conta">
              <li><span>E-mail</span><strong>{perfil.email}</strong></li>
              <li><span>Diretoria</span><strong>{perfil.setor || 'não definida'}</strong></li>
              <li><span>Papel</span><strong>{perfil.role === 'gestor' ? 'Gestor' : 'Membro'}</strong></li>
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Trocar senha</h2>
                <p className="panel-sub">Precisa da senha atual para confirmar que é você.</p>
              </div>
            </div>
            <form onSubmit={mudarSenha} className="form">
              <label className="field">
                <span className="field-label">Senha atual</span>
                <input type="password" required className="input" value={senhas.atual}
                  onChange={(e) => setSenhas((s) => ({ ...s, atual: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Nova senha</span>
                <input type="password" required className="input" value={senhas.nova}
                  placeholder="ao menos 6 caracteres"
                  onChange={(e) => setSenhas((s) => ({ ...s, nova: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Confirmar nova senha</span>
                <input type="password" required className="input" value={senhas.confirma}
                  onChange={(e) => setSenhas((s) => ({ ...s, confirma: e.target.value }))} />
              </label>
              {erroSenha && <p className="auth-erro">{erroSenha}</p>}
              <button type="submit" className="btn btn-primary">Trocar senha</button>
            </form>
          </section>
        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
