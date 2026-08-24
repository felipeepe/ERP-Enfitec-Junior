// Datas sempre no fuso de Brasília.
//
// Cuidado: `new Date().toISOString()` devolve UTC. Às 21h em Porto Alegre já é o
// dia seguinte em UTC, então usar toISOString() para "hoje" pré-preenchia o
// formulário com a data de amanhã justamente no horário em que a equipe lança
// horas. Todo cálculo de dia/mês passa por aqui.
const FUSO = 'America/Sao_Paulo'

// 'en-CA' formata como AAAA-MM-DD, que é o formato aceito por <input type="date">.
const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Um Date qualquer como 'AAAA-MM-DD' no fuso de Brasília.
export function diaISO(data) {
  return formatador.format(data)
}

export function hoje() {
  return diaISO(new Date())
}

export function mesAtual() {
  return hoje().slice(0, 7)
}

// Datas dos últimos N dias, do mais recente ao mais antigo.
export function ultimosDias(quantidade) {
  const base = new Date()
  const dias = []
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    dias.push(diaISO(d))
  }
  return dias
}

// Desloca 'AAAA-MM' em N meses (ex.: -1 -> mês anterior).
export function deslocarMes(ym, delta) {
  const [ano, mes] = ym.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function rotuloMes(ym) {
  const [ano, mes] = ym.split('-').map(Number)
  return `${MESES[mes - 1]}/${ano}`
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

// Formata 'AAAA-MM-DD' como "seg, 18/08".
export function rotuloDia(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  return `${DIAS_SEMANA[d.getDay()]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

// Formata 'AAAA-MM-DD' como "18/08/2026".
export function rotuloData(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

// Minutos totais como "H:MM".
export function formatarMinutos(total) {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// Células de um mês para desenhar em grade de 7 colunas, incluindo as sobras
// das semanas do começo e do fim. Usada pelo calendário de prazos e pela agenda.
export function gradeDoMes(ym) {
  const [ano, mes] = ym.split('-').map(Number)
  const primeiro = new Date(ano, mes - 1, 1)
  const inicio = new Date(primeiro)
  inicio.setDate(1 - primeiro.getDay()) // recua até o domingo

  const celulas = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    celulas.push({ iso, dia: d.getDate(), doMes: d.getMonth() === mes - 1 })
    // Para de desenhar assim que o mês acabou e a semana fechou no sábado.
    if (i >= 27 && d.getMonth() !== mes - 1 && d.getDay() === 6) break
  }
  return celulas
}

// Primeiro e último dia de um mês 'AAAA-MM', em 'AAAA-MM-DD'.
export function limitesDoMes(ym) {
  const [ano, mes] = ym.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  return [`${ym}-01`, `${ym}-${String(ultimo).padStart(2, '0')}`]
}

export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
