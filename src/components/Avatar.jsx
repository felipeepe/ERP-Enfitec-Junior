// Avatar de uma pessoa: foto se houver, senão iniciais sobre a cor escolhida
// por ela. Usado no cabeçalho, nos cartões, nos comentários e no chat — por
// isso vive num componente só.

export function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/)
  const primeira = partes[0]?.[0] || '?'
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

export default function Avatar({ pessoa, tamanho = 38, titulo }) {
  const nome = pessoa?.apelido || pessoa?.nome || 'Usuário'
  const estilo = {
    width: tamanho,
    height: tamanho,
    fontSize: Math.max(10, Math.round(tamanho * 0.34)),
  }

  if (pessoa?.foto) {
    return (
      <img
        className="avatar avatar--foto"
        style={estilo}
        src={pessoa.foto}
        alt=""
        title={titulo ?? nome}
      />
    )
  }

  return (
    <span
      className="avatar"
      style={{ ...estilo, background: pessoa?.cor_avatar || undefined }}
      title={titulo ?? nome}
      aria-hidden="true"
    >
      {iniciais(pessoa?.nome || nome)}
    </span>
  )
}
