// Diff de linhas entre duas versões de um documento.
//
// É por LINHA, não por caractere: markdown é texto de linha, e comparar
// caractere a caractere produz ruído ilegível em parágrafos reescritos.
// Usa a maior subsequência comum (LCS), que é o mesmo princípio do `diff`.

const LIMITE_LINHAS = 1500 // acima disso a matriz LCS fica cara demais no navegador

// Matriz de comprimentos da LCS entre dois vetores de linhas.
function tabelaLCS(a, b) {
  const tabela = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      tabela[i][j] = a[i] === b[j]
        ? tabela[i + 1][j + 1] + 1
        : Math.max(tabela[i + 1][j], tabela[i][j + 1])
    }
  }
  return tabela
}

/**
 * Compara dois textos e devolve a lista de operações por linha.
 * Cada item: { tipo: 'igual' | 'saiu' | 'entrou', texto }
 */
export function compararTextos(antigo, novo) {
  const a = String(antigo ?? '').split('\n')
  const b = String(novo ?? '').split('\n')

  // Documento grande demais: degrada para uma comparação grosseira em vez de travar a aba.
  if (a.length > LIMITE_LINHAS || b.length > LIMITE_LINHAS) {
    return [
      { tipo: 'saiu', texto: `(versão anterior — ${a.length} linhas)` },
      { tipo: 'entrou', texto: `(versão atual — ${b.length} linhas)` },
    ]
  }

  const tabela = tabelaLCS(a, b)
  const saida = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      saida.push({ tipo: 'igual', texto: a[i] })
      i++
      j++
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) {
      saida.push({ tipo: 'saiu', texto: a[i] })
      i++
    } else {
      saida.push({ tipo: 'entrou', texto: b[j] })
      j++
    }
  }
  while (i < a.length) saida.push({ tipo: 'saiu', texto: a[i++] })
  while (j < b.length) saida.push({ tipo: 'entrou', texto: b[j++] })

  return saida
}

/**
 * Colapsa blocos longos de linhas iguais, deixando algumas de contexto —
 * senão o diff de um documento grande vira uma parede de texto inalterado.
 */
export function comContexto(operacoes, contexto = 2) {
  const manter = new Set()
  operacoes.forEach((op, i) => {
    if (op.tipo === 'igual') return
    for (let k = i - contexto; k <= i + contexto; k++) {
      if (k >= 0 && k < operacoes.length) manter.add(k)
    }
  })

  const saida = []
  let pulando = 0
  operacoes.forEach((op, i) => {
    if (manter.has(i)) {
      if (pulando > 0) {
        saida.push({ tipo: 'pulo', texto: `⋯ ${pulando} linha(s) sem alteração` })
        pulando = 0
      }
      saida.push(op)
    } else {
      pulando++
    }
  })
  if (pulando > 0) saida.push({ tipo: 'pulo', texto: `⋯ ${pulando} linha(s) sem alteração` })
  return saida
}

// Resumo curto: quantas linhas entraram e saíram.
export function resumoDiff(operacoes) {
  const entraram = operacoes.filter((o) => o.tipo === 'entrou').length
  const sairam = operacoes.filter((o) => o.tipo === 'saiu').length
  if (!entraram && !sairam) return 'sem alterações no texto'
  const partes = []
  if (entraram) partes.push(`+${entraram}`)
  if (sairam) partes.push(`−${sairam}`)
  return `${partes.join(' ')} linha(s)`
}
