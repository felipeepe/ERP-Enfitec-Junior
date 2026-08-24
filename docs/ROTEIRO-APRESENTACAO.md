# Roteiro de Apresentação — Registrador de Horas ENFITEC Júnior

> Guia de fala para a apresentação. Tempo estimado: **6–8 minutos**.
> As falas estão em primeira pessoa; adapte ao seu jeito.
> **[AÇÃO: ...]** = o que fazer/clicar na tela enquanto fala.

---

## 1. Abertura (≈ 30s)

> "Bom dia/boa tarde a todos. Hoje eu quero apresentar uma ferramenta que
> desenvolvemos para resolver um problema do dia a dia da nossa empresa júnior:
> o **controle das horas trabalhadas** por cada membro — de um jeito simples,
> rápido e que qualquer pessoa consegue usar."

---

## 2. O problema (≈ 45s)

> "Numa empresa júnior, cada membro dedica horas a projetos, reuniões, pesquisa,
> visitas técnicas... Mas hoje esse registro costuma ser informal — anotado em
> planilhas soltas, mensagens ou até de cabeça. Isso dificulta saber **quanto
> tempo a equipe está dedicando**, **em quê**, e acompanhar a participação de
> cada um ao longo do semestre."
>
> "A ideia do projeto é centralizar isso numa aplicação própria da ENFITEC:
> cada membro registra suas horas, e a gestão consegue enxergar o todo."

---

## 3. A solução — demonstração ao vivo (≈ 2–3 min)

> "Deixa eu mostrar como funciona."

**[AÇÃO: abrir o app em http://localhost:5173 — tela de login]**

> "Essa é a tela de entrada. O acesso é feito pelo **e-mail corporativo** de cada
> membro, no padrão `nome.sobrenome@enfitecjunior.com`. Sem burocracia."

**[AÇÃO: digitar um e-mail, ex.: felipe.baseggio@enfitecjunior.com, e entrar]**

> "Assim que entro, o sistema já me reconhece pelo e-mail — 'Olá Felipe!' — e me
> leva direto para o registro de horas."

**[AÇÃO: mostrar o formulário]**

> "Aqui eu lanço quanto tempo trabalhei — em **horas e minutos**, com toda a
> flexibilidade — escolho o **setor** (nossas diretorias) e a **atividade**:
> visita técnica, pesquisa, desenvolvimento de projeto, reunião de alinhamento
> ou reunião com cliente. Posso ainda descrever o que foi feito."

**[AÇÃO: preencher e clicar em "Adicionar registro" — aparece o toast e o item na lista]**

> "Pronto — o registro entra no meu **histórico da semana**, organizado por dia,
> com o total de cada dia."

**[AÇÃO: apontar para os cartões do topo]**

> "E aqui em cima eu tenho os resumos: o **total do mês** — que posso navegar
> para ver meses anteriores — e o **total dos últimos 7 dias**. Tudo somado
> automaticamente."

> "Toda a interface está com a **identidade visual da ENFITEC** e foi construída
> em **React**, o que deixa fácil personalizar e evoluir daqui pra frente."

---

## 4. Como funciona por trás — a implementação (≈ 2 min)

> "O que mostrei é a interface. Para virar uma ferramenta completa e de verdade,
> o plano é conectá-la a uma plataforma chamada **Supabase**, que nos dá **banco
> de dados** e **login** prontos, sem precisar montar um servidor do zero."

> "Três pontos principais dessa implementação:"

**1. Banco de dados**
> "Cada registro de hora fica guardado num banco de dados seguro. É ele que faz
> as **somas mensais** automaticamente e mantém o histórico de todos os membros."

**2. Login sem senha (Magic Link)**
> "O acesso é por **link mágico**: a pessoa digita o e-mail e recebe um link para
> entrar — **sem senha**. Isso elimina o problema de gerenciar e resetar senhas."

> "E o acesso é controlado por uma **lista de e-mails autorizados**: só entra quem
> a gestão liberou. Isso resolve um ponto crítico da nossa realidade — a **alta
> rotatividade**. A cada semestre, a nova gestão só edita essa lista (como uma
> planilha): adiciona os novos membros e desativa os que saíram. Sem programar."

> "Importante: ao desligar um membro, **desativamos o acesso mas mantemos o
> histórico** de horas dele, preservando a memória da empresa."

**3. Segurança e visão de gestão**
> "Cada membro só enxerga os próprios registros. E os responsáveis da diretoria de
> **Gestão de Pessoas** têm um perfil de **gestor**, com acesso às **horas trabalhadas e
> à área de atuação de cada membro** — para acompanhar a dedicação de toda a equipe."

---

## 5. Custo e hospedagem (≈ 30s)

> "E o custo? Pelo tamanho da nossa empresa — algo em torno de 40 pessoas — a
> aplicação roda **inteiramente no plano gratuito**. Ou seja, **R$0 por mês**."
>
> "O único gasto opcional seria um domínio próprio, algo como **R$40 por ano**,
> se quisermos um endereço personalizado."

---

## 6. Próximos passos (≈ 30s)

> "Hoje entregamos a **interface funcional** — a 'casca' completa e navegável.
> Os próximos passos são:"
>
> - "Conectar o banco de dados e o login (Supabase);"
> - "Publicar a aplicação online para todos acessarem;"
> - "E, se fizer sentido, evoluir com relatórios e a visão de gestão."

---

## 7. Fechamento (≈ 30s)

> "Em resumo: criamos uma ferramenta **simples, com a cara da ENFITEC, de baixo
> custo e pensada para a nossa rotatividade**, que vai nos ajudar a entender e
> valorizar o tempo que cada membro dedica à empresa."
>
> "Obrigado! Fico à disposição para perguntas."

---

## Apêndice — Perguntas prováveis e respostas

**"Quanto custa para manter?"**
> R$0/mês no plano gratuito para o nosso tamanho; opcionalmente ~R$40/ano por um domínio.

**"E quando as pessoas trocam a cada semestre?"**
> A gestão edita uma lista de e-mails autorizados (como planilha), sem código. Quem sai é
> desativado, mas o histórico de horas é mantido.

**"Precisa de senha? E se esquecerem?"**
> Não há senha. O acesso é por link enviado ao e-mail (Magic Link).

**"Os dados estão seguros?"**
> Sim. Cada membro só acessa os próprios registros; o controle fica no banco de dados,
> não dá para burlar pelo navegador.

**"Dá para ver as horas de todo mundo?"**
> Sim. Os responsáveis da Gestão de Pessoas têm perfil de gestor e enxergam as horas e a
> área de atuação de cada membro. Podem ser vários gestores ao mesmo tempo.

**"Por que React / por que Supabase?"**
> React deixa a interface fácil de manter e evoluir. Supabase entrega banco + login
> prontos e gratuitos, acelerando muito a implementação.
