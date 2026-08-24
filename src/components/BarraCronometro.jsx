import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cronometroAtual, pararCronometro, descartarCronometro, EVENTO_CRONOMETRO } from '../lib/api'

// Barra fixa que aparece em qualquer tela enquanto há tempo correndo. Sem ela,
// a pessoa esquece o cronômetro ligado e o lançamento sai errado.
function relogio(segundos) {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  const dois = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`
}

export default function BarraCronometro() {
  const navigate = useNavigate()
  const [cron, setCron] = useState(null)
  const [segundos, setSegundos] = useState(0)
  const [parando, setParando] = useState(false)
  const [nota, setNota] = useState('')

  const sincronizar = useCallback(
    () => cronometroAtual()
      .then((c) => {
        setCron(c)
        // O contador parte dos segundos do SERVIDOR: o relógio da máquina pode
        // estar torto, e é o do servidor que vale para a hora lançada.
        setSegundos(c ? c.segundos : 0)
      })
      .catch(() => setCron(null)),
    [],
  )

  useEffect(() => { sincronizar() }, [sincronizar])

  // Começar ou parar em outra tela avisa por evento.
  useEffect(() => {
    const aoMudar = () => sincronizar()
    window.addEventListener(EVENTO_CRONOMETRO, aoMudar)
    return () => window.removeEventListener(EVENTO_CRONOMETRO, aoMudar)
  }, [sincronizar])

  // Conta localmente de segundo em segundo e reconfere com o servidor de vez
  // em quando, para não acumular desvio numa sessão longa.
  useEffect(() => {
    if (!cron) return undefined
    const tique = setInterval(() => setSegundos((s) => s + 1), 1000)
    const ajuste = setInterval(sincronizar, 60000)
    return () => { clearInterval(tique); clearInterval(ajuste) }
  }, [cron, sincronizar])

  if (!cron) return null

  async function parar() {
    try {
      const r = await pararCronometro({ descricao: nota.trim() || null })
      setNota('')
      setParando(false)
      setCron(null)
      window.dispatchEvent(new CustomEvent(EVENTO_CRONOMETRO))
      alert(r.registrado
        ? `Lançado: ${r.minutos} minuto(s) na tarefa.`
        : 'Menos de um minuto — nada foi lançado.')
    } catch (err) {
      alert(err?.message || 'Não foi possível parar o cronômetro.')
    }
  }

  async function descartar() {
    if (!window.confirm('Descartar este tempo sem lançar hora?')) return
    await descartarCronometro()
    setCron(null)
    setParando(false)
    window.dispatchEvent(new CustomEvent(EVENTO_CRONOMETRO))
  }

  return (
    <div className="barra-cronometro" role="status">
      <span className="cron-pulso" aria-hidden="true" />
      <span className="cron-tempo">{relogio(segundos)}</span>

      <button className="cron-tarefa" onClick={() => navigate(`/projetos/${cron.projeto_id}?tarefa=${cron.tarefa_id}`)}>
        <span className="tarefa-codigo">{cron.codigo}</span>
        <span className="cron-titulo">{cron.titulo}</span>
      </button>

      {parando ? (
        <>
          <input
            className="input cron-nota"
            autoFocus
            placeholder="O que você fez? (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && parar()}
          />
          <button className="btn btn-primary" onClick={parar}>Lançar hora</button>
          <button className="btn btn-ghost" onClick={() => setParando(false)}>Voltar</button>
        </>
      ) : (
        <>
          <button className="btn btn-primary" onClick={() => setParando(true)}>⏹ Parar</button>
          <button className="btn btn-ghost" onClick={descartar} title="Descartar sem lançar">Descartar</button>
        </>
      )}
    </div>
  )
}
