import { useCallback, useEffect, useRef, useState } from 'react'
import { getMembro, listarLixeira, restaurarDaLixeira, excluirDaLixeira } from '../lib/api'

// O soft delete já existia em tudo, mas nada restaurava: só voltava pelo
// phpMyAdmin. Numa equipe que troca a cada semestre, alguém vai apagar o
// projeto errado na primeira semana.
const GRUPOS = [
  ['projetos', 'projeto', 'Projetos', '📁', 'Restaurar traz junto as tarefas que foram apagadas com ele.'],
  ['tarefas', 'tarefa', 'Tarefas', '📌', 'Só as apagadas isoladamente — as que sumiram com o projeto voltam com ele.'],
  ['documentos', 'documento', 'Páginas', '📄', 'Restaurar traz junto as subpáginas apagadas ao mesmo tempo.'],
]

export default function Lixeira() {
  const eu = getMembro()
  const [dados, setDados] = useState({ projetos: [], tarefas: [], documentos: [] })
  const [carregando, setCarregando] = useState(true)

  const [toast, setToast] = useState('')
  const toastTimer = useRef()
  function notificar(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  const carregar = useCallback(
    () => listarLixeira()
      .then(setDados)
      .catch(() => notificar('Erro ao carregar a lixeira'))
      .finally(() => setCarregando(false)),
    [],
  )

  useEffect(() => { carregar() }, [carregar])

  async function restaurar(tipo, item) {
    try {
      await restaurarDaLixeira(tipo, item.id)
      carregar()
      notificar('Restaurado ✓')
    } catch (err) {
      alert(err?.message || 'Não foi possível restaurar.')
    }
  }

  async function excluir(tipo, item) {
    if (!window.confirm(`Excluir "${item.rotulo}" DEFINITIVAMENTE? Não tem como desfazer.`)) return
    try {
      await excluirDaLixeira(tipo, item.id)
      carregar()
      notificar('Excluído definitivamente')
    } catch (err) {
      alert(err?.message || 'Não foi possível excluir.')
    }
  }

  const total = dados.projetos.length + dados.tarefas.length + dados.documentos.length

  return (
    <>
      <h1 className="saudacao">Lixeira</h1>
      <p className="panel-sub" style={{ marginTop: -12, marginBottom: 20 }}>
        O que sai de vista fica aqui e pode voltar.
        {eu?.role === 'gestor' && ' Só a gestão exclui de vez — e aí não tem desfazer.'}
      </p>

      {carregando ? (
        <div className="empty"><p>Carregando…</p></div>
      ) : total === 0 ? (
        <section className="panel">
          <div className="empty">
            <div className="empty-icon" aria-hidden="true">🗑</div>
            <p>A lixeira está vazia.</p>
            <span>Nada foi removido no seu escopo.</span>
          </div>
        </section>
      ) : (
        GRUPOS.map(([chave, tipo, titulo, icone, ajuda]) => (
          dados[chave].length > 0 && (
            <section className="panel" key={chave}>
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">{icone} {titulo} ({dados[chave].length})</h2>
                  <p className="panel-sub">{ajuda}</p>
                </div>
              </div>
              <ul className="lixeira">
                {dados[chave].map((item) => (
                  <li key={item.id}>
                    <span className="lixeira-rotulo">{item.rotulo}</span>
                    {item.setor && <span className="tag">{item.setor}</span>}
                    <span className="lixeira-data">
                      removido em {String(item.excluido_em || '').slice(0, 16)}
                    </span>
                    <button className="btn btn-ghost" onClick={() => restaurar(tipo, item)}>
                      Restaurar
                    </button>
                    {eu?.role === 'gestor' && (
                      <button className="icon-btn" title="Excluir definitivamente"
                        onClick={() => excluir(tipo, item)}>🗑</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        ))
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
