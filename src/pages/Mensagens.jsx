import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMembro, listarConversas, abrirConversa, enviarMensagem,
  removerMensagem, listarEquipe,
} from '../lib/api'
import Avatar from '../components/Avatar.jsx'
import { rotuloData, hoje } from '../lib/datas'

// Hospedagem compartilhada não roda processo contínuo, logo não há WebSocket.
// A conversa aberta é reconsultada de tempos em tempos — suficiente para uma EJ,
// e honesto sobre o limite do ambiente.
const INTERVALO_MS = 8000

// "22/08 14:30" ou só a hora, quando é de hoje.
function quando(iso) {
  if (!iso) return ''
  const [dia, hora] = String(iso).split(' ')
  // hoje() vem de lib/datas e já respeita o fuso de Brasília.
  return dia === hoje()
    ? (hora || '').slice(0, 5)
    : `${rotuloData(dia).slice(0, 5)} ${(hora || '').slice(0, 5)}`
}

export default function Mensagens() {
  const eu = getMembro()
  const [params, setParams] = useSearchParams()
  const aberta = params.get('com') ? Number(params.get('com')) : null

  const [conversas, setConversas] = useState([])
  const [equipe, setEquipe] = useState([])
  const [thread, setThread] = useState(null)
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [novaConversa, setNovaConversa] = useState(false)

  const fim = useRef(null)

  const recarregarLista = useCallback(
    () => listarConversas().then(setConversas).catch(() => {}),
    [],
  )

  useEffect(() => {
    Promise.all([recarregarLista(), listarEquipe().then(setEquipe).catch(() => {})])
      .finally(() => setCarregando(false))
  }, [recarregarLista])

  const carregarThread = useCallback(() => {
    if (!aberta) { setThread(null); return Promise.resolve() }
    return abrirConversa(aberta).then(setThread).catch(() => setThread(null))
  }, [aberta])

  useEffect(() => { carregarThread() }, [carregarThread])

  // Enquanto a conversa está aberta, verifica se chegou coisa nova.
  useEffect(() => {
    if (!aberta) return undefined
    const t = setInterval(() => {
      carregarThread()
      recarregarLista()
    }, INTERVALO_MS)
    return () => clearInterval(t)
  }, [aberta, carregarThread, recarregarLista])

  // Rola para a última mensagem quando a conversa muda de tamanho.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [thread?.mensagens?.length])

  async function enviar(e) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || !aberta) return
    setTexto('')
    // Otimista: a mensagem aparece antes da confirmação do servidor.
    setThread((t) => t && {
      ...t,
      mensagens: [...t.mensagens, { id: `tmp-${Date.now()}`, texto: conteudo, criado_em: '', minha: true }],
    })
    try {
      await enviarMensagem(aberta, conteudo)
      await carregarThread()
      recarregarLista()
    } catch (err) {
      alert(err?.message || 'Não foi possível enviar.')
      carregarThread()
    }
  }

  async function apagar(id) {
    if (String(id).startsWith('tmp-')) return
    if (!window.confirm('Apagar esta mensagem?')) return
    await removerMensagem(id)
    carregarThread()
    recarregarLista()
  }

  const jaConversa = new Set(conversas.map((c) => c.membro.id))
  const candidatos = equipe
    .filter((p) => p.id !== eu?.id)
    .filter((p) => !buscaPessoa || p.nome.toLowerCase().includes(buscaPessoa.toLowerCase()))

  return (
    <>
      <h1 className="saudacao">Mensagens</h1>

      <div className="chat">
        {/* ---------- Conversas ---------- */}
        <aside className="panel chat-lista">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Conversas</h2>
              <p className="panel-sub">{conversas.length} em andamento</p>
            </div>
            <button className="btn btn-ghost" onClick={() => setNovaConversa((v) => !v)}>
              {novaConversa ? 'Fechar' : '+ Nova'}
            </button>
          </div>

          {novaConversa && (
            <div className="chat-nova">
              <input className="input" placeholder="buscar pessoa…" value={buscaPessoa}
                onChange={(e) => setBuscaPessoa(e.target.value)} />
              <ul className="chat-candidatos">
                {candidatos.map((p) => (
                  <li key={p.id}>
                    <button className="chat-item" onClick={() => {
                      setParams({ com: String(p.id) })
                      setNovaConversa(false)
                      setBuscaPessoa('')
                    }}>
                      <Avatar pessoa={p} tamanho={32} />
                      <span className="chat-item-nome">{p.nome}</span>
                      <span className="chat-item-meta">
                        {jaConversa.has(p.id) ? 'já conversam' : p.setor || ''}
                      </span>
                    </button>
                  </li>
                ))}
                {candidatos.length === 0 && <li className="busca-vazio">Ninguém encontrado.</li>}
              </ul>
            </div>
          )}

          {carregando ? (
            <p className="panel-sub">Carregando…</p>
          ) : conversas.length === 0 ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">💬</div>
              <p>Nenhuma conversa ainda.</p>
              <span>Use “+ Nova” para falar com alguém da equipe.</span>
            </div>
          ) : (
            <ul className="chat-conversas">
              {conversas.map((c) => (
                <li key={c.membro.id}>
                  <button
                    className={`chat-item ${aberta === c.membro.id ? 'ativo' : ''}`}
                    onClick={() => setParams({ com: String(c.membro.id) })}
                  >
                    <Avatar pessoa={c.membro} tamanho={38} />
                    <span className="chat-item-corpo">
                      <span className="chat-item-nome">{c.membro.apelido || c.membro.nome}</span>
                      <span className="chat-item-previa">
                        {c.ultima?.minha ? 'Você: ' : ''}{c.ultima?.texto}
                      </span>
                    </span>
                    {c.nao_lidas > 0 && <span className="chat-badge">{c.nao_lidas}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ---------- Conversa aberta ---------- */}
        <section className="panel chat-thread">
          {!thread ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">✉️</div>
              <p>Escolha uma conversa.</p>
              <span>Ou comece uma nova com alguém da equipe.</span>
            </div>
          ) : (
            <>
              <div className="chat-cabecalho">
                <Avatar pessoa={thread.membro} tamanho={42} />
                <div>
                  <strong>{thread.membro.apelido || thread.membro.nome}</strong>
                  <span className="chat-cabecalho-meta">{thread.membro.setor || 'sem diretoria'}</span>
                </div>
              </div>

              <div className="chat-mensagens">
                {thread.mensagens.length === 0 && (
                  <p className="panel-sub">Nenhuma mensagem ainda. Diga oi.</p>
                )}
                {thread.mensagens.map((msg) => (
                  <div key={msg.id} className={`balao ${msg.minha ? 'minha' : ''}`}>
                    <p className="balao-texto">{msg.texto}</p>
                    <span className="balao-hora">
                      {quando(msg.criado_em)}
                      {msg.minha && (
                        <button className="balao-x" onClick={() => apagar(msg.id)} title="Apagar">✕</button>
                      )}
                    </span>
                  </div>
                ))}
                <div ref={fim} />
              </div>

              <form className="chat-envio" onSubmit={enviar}>
                <input className="input" placeholder="Escreva uma mensagem…" value={texto}
                  onChange={(e) => setTexto(e.target.value)} />
                <button className="btn btn-primary" type="submit">Enviar</button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  )
}
