import { useEffect, useRef, useState } from 'react'
import { listarEquipe } from '../lib/api'

// Campo de comentário com menção. Digitar "@" abre a lista de pessoas.
//
// Os ids das pessoas mencionadas são enviados à parte, e não deduzidos do texto:
// tentar casar "@Nome" com a equipe erraria com nome repetido, nome composto e
// acento — e erro aqui significa notificar a pessoa errada.
export default function CampoComentario({ aoEnviar, placeholder = 'Escreva um comentário…', enviando }) {
  const [texto, setTexto] = useState('')
  const [mencionados, setMencionados] = useState([])
  const [equipe, setEquipe] = useState([])
  const [sugerindo, setSugerindo] = useState(false)
  const [filtro, setFiltro] = useState('')
  const campo = useRef(null)

  useEffect(() => { listarEquipe().then(setEquipe).catch(() => {}) }, [])

  function digitou(valor) {
    setTexto(valor)
    // Só sugere enquanto o "@" mais recente ainda está sendo escrito.
    const ate = valor.slice(0, campo.current?.selectionStart ?? valor.length)
    const encontro = ate.match(/@([\p{L}]*)$/u)
    setSugerindo(!!encontro)
    setFiltro(encontro ? encontro[1].toLowerCase() : '')
  }

  function escolher(pessoa) {
    const pos = campo.current?.selectionStart ?? texto.length
    const antes = texto.slice(0, pos).replace(/@[\p{L}]*$/u, '')
    const nome = (pessoa.apelido || pessoa.nome).split(' ')[0]
    const novo = `${antes}@${nome} ${texto.slice(pos)}`
    setTexto(novo)
    setMencionados((m) => (m.includes(pessoa.id) ? m : [...m, pessoa.id]))
    setSugerindo(false)
    campo.current?.focus()
  }

  async function enviar(e) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo) return
    // Só manda quem ainda está citado no texto: apagar a menção desfaz o aviso.
    const citados = mencionados.filter((id) => {
      const p = equipe.find((x) => x.id === id)
      if (!p) return false
      const nome = (p.apelido || p.nome).split(' ')[0]
      return conteudo.includes(`@${nome}`)
    })
    await aoEnviar(conteudo, citados)
    setTexto('')
    setMencionados([])
  }

  const candidatos = equipe
    .filter((p) => (p.apelido || p.nome).toLowerCase().includes(filtro))
    .slice(0, 6)

  return (
    <form className="campo-comentario" onSubmit={enviar}>
      <div className="campo-comentario-caixa">
        <input
          ref={campo}
          className="input"
          placeholder={placeholder}
          value={texto}
          onChange={(e) => digitou(e.target.value)}
          onBlur={() => setTimeout(() => setSugerindo(false), 150)}
        />
        {sugerindo && candidatos.length > 0 && (
          <ul className="mencoes">
            {candidatos.map((p) => (
              <li key={p.id}>
                <button type="button" className="mencao-item" onClick={() => escolher(p)}>
                  <strong>{p.apelido || p.nome}</strong>
                  <span>{p.setor || 'sem diretoria'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  )
}
