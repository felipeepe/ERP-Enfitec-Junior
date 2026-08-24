import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscar } from '../lib/api'

const VAZIO = { projetos: [], tarefas: [], documentos: [] }

export default function BuscaGlobal() {
  const navigate = useNavigate()
  const [termo, setTermo] = useState('')
  const [resultado, setResultado] = useState(VAZIO)
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)

  // Espera a digitação parar antes de consultar, para não disparar a cada tecla.
  useEffect(() => {
    if (termo.trim().length < 3) {
      setResultado(VAZIO)
      return
    }
    const t = setTimeout(() => {
      buscar(termo.trim()).then(setResultado).catch(() => setResultado(VAZIO))
    }, 250)
    return () => clearTimeout(t)
  }, [termo])

  // Fecha ao clicar fora.
  useEffect(() => {
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  function ir(destino) {
    setAberto(false)
    setTermo('')
    navigate(destino)
  }

  const total = resultado.projetos.length + resultado.tarefas.length + resultado.documentos.length

  return (
    <div className="busca" ref={caixa}>
      <input
        className="busca-campo"
        type="search"
        placeholder="Buscar projetos, tarefas, documentos…"
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        aria-label="Busca global"
      />

      {aberto && termo.trim().length >= 3 && (
        <div className="busca-resultados">
          {total === 0 ? (
            <p className="busca-vazio">Nada encontrado para “{termo}”.</p>
          ) : (
            <>
              {resultado.projetos.length > 0 && (
                <>
                  <span className="busca-grupo">Projetos</span>
                  {resultado.projetos.map((p) => (
                    <button key={`p${p.id}`} className="busca-item" onClick={() => ir(`/projetos/${p.id}`)}>
                      <span className="tarefa-codigo">{p.codigo}</span>
                      <span className="busca-item-titulo">{p.nome}</span>
                      <span className="busca-item-meta">{p.setor}</span>
                    </button>
                  ))}
                </>
              )}
              {resultado.tarefas.length > 0 && (
                <>
                  <span className="busca-grupo">Tarefas</span>
                  {resultado.tarefas.map((t) => (
                    <button key={`t${t.id}`} className="busca-item"
                      onClick={() => ir(`/projetos/${t.projeto_id || ''}?tarefa=${t.id}`)}>
                      <span className="tarefa-codigo">{t.codigo}</span>
                      <span className="busca-item-titulo">{t.titulo}</span>
                      <span className="busca-item-meta">{t.projeto_nome}</span>
                    </button>
                  ))}
                </>
              )}
              {resultado.documentos.length > 0 && (
                <>
                  <span className="busca-grupo">Documentação</span>
                  {resultado.documentos.map((d) => (
                    <button key={`d${d.id}`} className="busca-item"
                      onClick={() => ir(`/documentacao?pagina=${d.id}`)}>
                      <span className="busca-item-icone">{d.icone || '📄'}</span>
                      <span className="busca-item-titulo">{d.titulo}</span>
                      <span className="busca-item-meta">{d.setor || 'institucional'}</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
