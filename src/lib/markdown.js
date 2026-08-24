import { marked } from 'marked'
import DOMPurify from 'dompurify'

// O conteúdo das páginas é escrito por membros da EJ, mas ainda assim passa pelo
// sanitizador: um documento é lido por todo mundo, então HTML colado de fora não
// pode virar script executando na sessão de quem lê.
marked.setOptions({
  gfm: true,      // tabelas, listas de tarefa, ~~riscado~~
  breaks: true,   // quebra de linha simples vira <br>, que é o que a pessoa espera
})

export function renderizarMarkdown(texto) {
  if (!texto) return ''
  return DOMPurify.sanitize(marked.parse(texto), {
    ADD_ATTR: ['target', 'rel'],
  })
}

// Resumo de uma página para listagem: primeira linha que não seja título.
export function resumoMarkdown(texto, limite = 120) {
  if (!texto) return ''
  const linha = texto
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('```'))
  if (!linha) return ''
  const limpo = linha.replace(/[*_`>[\]()]/g, '')
  return limpo.length > limite ? limpo.slice(0, limite) + '…' : limpo
}
