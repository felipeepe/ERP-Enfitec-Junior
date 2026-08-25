import { useCallback, useEffect, useState } from 'react'
import { getMembro, listarComentarios, comentar, removerComentario } from '../lib/api'
import Avatar from './Avatar.jsx'
import CampoComentario from './CampoComentario.jsx'

// Fio de discussão reutilizável. Serve para projeto, tarefa e documento — o
// backend deriva a permissão do que está sendo comentado, então o componente
// não precisa saber nada sobre escopo.
export default function Discussao({ tipo, alvoId, titulo, subtitulo, aoMudar }) {
  const eu = getMembro()
  const [comentarios, setComentarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(
    () => listarComentarios(tipo, alvoId)
      .then(setComentarios)
      .catch(() => setComentarios([]))
      .finally(() => setCarregando(false)),
    [tipo, alvoId],
  )

  useEffect(() => { carregar() }, [carregar])

  async function enviar(conteudo, mencionados) {
    setEnviando(true)
    try {
      await comentar(tipo, alvoId, conteudo, mencionados)
      await carregar()
      aoMudar?.()
    } catch (err) {
      alert(err?.message || 'Não foi possível comentar.')
    } finally {
      setEnviando(false)
    }
  }

  async function apagar(id) {
    if (!window.confirm('Apagar este comentário?')) return
    await removerComentario(id)
    carregar()
    aoMudar?.()
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{titulo}</h2>
          <p className="panel-sub">{subtitulo}</p>
        </div>
      </div>

      {carregando ? (
        <p className="panel-sub">Carregando…</p>
      ) : comentarios.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">💬</div>
          <p>Nenhuma mensagem ainda.</p>
          <span>Comece a discussão abaixo.</span>
        </div>
      ) : (
        <ul className="discussao">
          {comentarios.map((c) => (
            <li key={c.id}>
              <Avatar
                pessoa={{ nome: c.membro_nome, apelido: c.membro_apelido, cor_avatar: c.cor_avatar, foto: c.foto }}
                tamanho={36}
              />
              <div className="discussao-corpo">
                <div className="discussao-topo">
                  <strong>{c.membro_apelido || c.membro_nome}</strong>
                  <span className="comentario-data">
                    {String(c.criado_em || '').slice(0, 16).replace('T', ' ')}
                  </span>
                  {(c.membro_id === eu?.id || eu?.role === 'gestor') && (
                    <button className="icon-btn" onClick={() => apagar(c.id)} title="Apagar">✕</button>
                  )}
                </div>
                <p className="discussao-texto">{c.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CampoComentario
        aoEnviar={enviar}
        enviando={enviando}
        placeholder="Escreva para a equipe… use @ para chamar alguém"
      />
    </section>
  )
}
