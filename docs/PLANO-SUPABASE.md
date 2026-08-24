# Plano de Conexão com o Supabase — Registrador de Horas ENFITEC

Documento de referência para transformar a casca atual (React + localStorage) num app
funcional com **login real** e **banco de dados**, usando **Supabase** (Postgres + Auth).
Custo estimado no plano gratuito: **R$0/mês** para até ~40 usuários.

---

## 1. Visão geral da arquitetura

```
┌─────────────┐     HTTPS      ┌───────────────────────────┐
│  React app  │ ─────────────▶ │          Supabase          │
│ (Vercel)    │                │  ┌─────────┐  ┌──────────┐ │
│             │ ◀───────────── │  │  Auth   │  │ Postgres │ │
└─────────────┘                │  └─────────┘  └──────────┘ │
                               │        + Row Level Security │
                               └───────────────────────────┘
```

- **Auth**: login por e-mail corporativo (`nome.sobrenome@enfitecjunior.com`).
- **Postgres**: tabela `registros` guarda cada lançamento de horas.
- **RLS (Row Level Security)**: cada usuário só enxerga os próprios registros.
- **Front-end**: o mesmo app de hoje, trocando `localStorage` por chamadas ao Supabase.

---

## 2. Passo 1 — Criar o projeto no Supabase

1. Criar conta em https://supabase.com (grátis).
2. **New Project** → escolher nome (ex.: `enfitec-horas`), senha do banco e região
   (`South America (São Paulo)` para menor latência).
3. Após criar, anotar em **Project Settings → API**:
   - `Project URL` (ex.: `https://xxxx.supabase.co`)
   - `anon public key` (chave pública — pode ir no front-end)
   - ⚠️ **Nunca** usar a `service_role key` no front-end (ela ignora o RLS).

---

## 3. Passo 2 — Modelagem do banco (tabela `registros`)

No painel do Supabase, abrir **SQL Editor** e rodar:

```sql
-- Tabela de registros de horas
create table public.registros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        date not null,
  setor       text not null,
  atividade   text not null,
  minutos     integer not null check (minutos > 0),
  descricao   text,
  created_at  timestamptz not null default now()
);

-- Índice para consultas por usuário e período (mais rápido)
create index registros_user_data_idx on public.registros (user_id, data);
```

Mapa dos campos (batem com o app atual):

| App hoje (`Registro.jsx`) | Coluna no banco |
|---|---|
| `data` (YYYY-MM-DD)       | `data`      |
| `area` (setor)            | `setor`     |
| `tipo` (atividade)        | `atividade` |
| `minutos` (número)        | `minutos`   |
| `descricao`               | `descricao` |
| (novo)                    | `user_id` — quem lançou |

---

## 4. Passo 3 — Segurança por usuário (Row Level Security)

Garante que cada pessoa só acesse os próprios lançamentos.

```sql
-- Ativa o RLS na tabela
alter table public.registros enable row level security;

-- Ler apenas os próprios registros
create policy "ler proprios registros"
  on public.registros for select
  using (auth.uid() = user_id);

-- Inserir registros como o próprio usuário
create policy "inserir proprios registros"
  on public.registros for insert
  with check (auth.uid() = user_id);

-- Remover apenas os próprios registros
create policy "remover proprios registros"
  on public.registros for delete
  using (auth.uid() = user_id);
```

> Se no futuro a diretoria precisar ver o total de todos, cria-se uma *policy* extra
> para um papel de "admin" (ex.: baseada numa tabela de perfis).

---

## 5. Passo 4 — Login por e-mail corporativo

Duas opções (escolher uma):

### Opção A — Magic Link / OTP (recomendada, sem senha)
O usuário digita o e-mail e recebe um link/código para entrar. Combina com o login
atual (que já é só e-mail). Em **Authentication → Providers → Email**, manter *Email* ativo.

### Opção B — E-mail + senha
Cada membro cria uma senha no primeiro acesso. Mais tradicional, exige tela de cadastro.

### Restringir ao domínio `@enfitecjunior.com`
Para aceitar somente e-mails da ENFITEC, criar um *trigger* no banco:

```sql
create or replace function public.bloqueia_email_externo()
returns trigger as $$
begin
  if new.email not like '%@enfitecjunior.com' then
    raise exception 'Apenas e-mails @enfitecjunior.com são permitidos.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger valida_dominio_email
  before insert on auth.users
  for each row execute function public.bloqueia_email_externo();
```

---

## 6. Passo 5 — Instalar o cliente Supabase no front-end

```bash
npm install @supabase/supabase-js
```

Criar `src/lib/supabase.js`:

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey)
```

Criar `.env.local` (NÃO comitar — já ignorado por padrão):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

---

## 7. Passo 6 — Migrar o código (localStorage → Supabase)

### Login (`Login.jsx`)
Trocar o `localStorage.setItem('rh:email', ...)` por autenticação real:

```js
// Opção A — Magic Link
async function handleSubmit(e) {
  e.preventDefault()
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
  if (error) return alert(error.message)
  alert('Enviamos um link de acesso para o seu e-mail.')
}
```

O nome do usuário deixa de ser derivado do e-mail e passa a vir de
`supabase.auth.getUser()` (campo `user.email`).

### Registro (`Registro.jsx`)
Substituir o estado em `localStorage` por chamadas ao banco:

```js
// Carregar registros do usuário (substitui o useState com localStorage)
useEffect(() => {
  supabase
    .from('registros')
    .select('*')
    .order('data', { ascending: false })
    .then(({ data }) => setRegistros(data ?? []))
}, [])

// Adicionar (dentro do handleSubmit, no lugar do setRegistros local)
const { data: { user } } = await supabase.auth.getUser()
const { data, error } = await supabase.from('registros').insert({
  user_id: user.id,
  data: form.data,
  setor: form.area,
  atividade: form.tipo,
  minutos,
  descricao: form.descricao || null,
}).select().single()
if (error) return alert(error.message)
setRegistros((r) => [data, ...r])

// Remover
await supabase.from('registros').delete().eq('id', id)
```

> A lógica de **campos, formato H:MM, histórico semanal e navegação de meses**
> continua igual — muda só a *fonte* dos dados (banco em vez de localStorage).

---

## 8. Passo 7 — Soma mensal feita no banco

Em vez de somar no front, criar uma função no Postgres que devolve o total por mês:

```sql
create or replace function public.total_por_mes(mes text)
returns table (total_minutos integer, qtd integer)
language sql stable as $$
  select coalesce(sum(minutos), 0)::int as total_minutos,
         count(*)::int as qtd
  from public.registros
  where user_id = auth.uid()
    and to_char(data, 'YYYY-MM') = mes;
$$;
```

Chamada no front-end (para o cartão "Total do mês"):

```js
const { data } = await supabase.rpc('total_por_mes', { mes: mesView })
// data[0].total_minutos, data[0].qtd
```

Assim a soma mensal roda no servidor, compartilhada e consistente entre dispositivos.

---

## 9. Passo 8 — Deploy (produção)

1. Subir o código para o GitHub.
2. Em https://vercel.com → **Import Project** → selecionar o repositório.
3. Em **Environment Variables**, adicionar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Deploy. A Vercel gera uma URL (ex.: `enfitec-horas.vercel.app`).
5. (Opcional) Apontar um domínio próprio (~R$40/ano).

---

## 10. Checklist de implementação

- [ ] Criar projeto no Supabase (região São Paulo)
- [ ] Rodar SQL: tabela `registros` + índice
- [ ] Ativar RLS + policies
- [ ] Configurar Auth (Magic Link) e trigger de domínio
- [ ] `npm install @supabase/supabase-js` + `src/lib/supabase.js` + `.env.local`
- [ ] Migrar `Login.jsx` para `signInWithOtp`
- [ ] Migrar `Registro.jsx` (carregar/inserir/remover via banco)
- [ ] Criar função `total_por_mes` e ligar no cartão mensal
- [ ] Deploy na Vercel com as variáveis de ambiente

---

## 10b. Papel de gestor (Gestão de Pessoas) — visão da equipe

Em vez de uma única conta admin, **todos os responsáveis da diretoria de Gestão de
Pessoas** recebem o papel de **gestor**. Um gestor vê as **horas trabalhadas** e a
**área/atividade** de **cada membro**. Podem existir vários gestores ao mesmo tempo.

### Tabela de perfis com papel
```sql
create table public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  nome  text,
  role  text not null default 'membro' check (role in ('membro', 'gestor'))
);
alter table public.profiles enable row level security;
create policy "ver proprio perfil"
  on public.profiles for select using (auth.uid() = id);

-- cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.cria_perfil()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nome) values (new.id, new.email);
  return new;
end; $$;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.cria_perfil();
```

### Função que verifica se é gestor
```sql
create or replace function public.is_gestor()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'gestor'
  );
$$;
```

### Regra: gestor lê os registros de todos (soma-se às policies existentes)
```sql
create policy "gestor le todos os registros"
  on public.registros for select
  using (public.is_gestor());
```
> Como cada registro guarda `setor`, `atividade`, `minutos` e `data`, essa única regra
> já dá ao gestor a visão completa: **quanto** cada membro trabalhou e **em qual área**.

### Promover os responsáveis da Gestão de Pessoas a gestores
Rodar uma vez por semestre, com os e-mails da diretoria (pode listar vários):
```sql
update public.profiles set role = 'gestor'
where id in (
  select id from auth.users
  where email in (
    'responsavel1@enfitecjunior.com',
    'responsavel2@enfitecjunior.com',
    'responsavel3@enfitecjunior.com'
  )
);
```
> Para rebaixar quem saiu da diretoria: mesmo comando com `role = 'membro'`.

### Consulta consolidada por membro (horas + área)
```sql
create or replace function public.resumo_equipe(mes text)
returns table (nome text, setor text, total_minutos integer, qtd integer)
language sql stable security definer as $$
  select p.nome,
         r.setor,
         coalesce(sum(r.minutos), 0)::int as total_minutos,
         count(r.id)::int as qtd
  from public.profiles p
  left join public.registros r
    on r.user_id = p.id and to_char(r.data, 'YYYY-MM') = mes
  where public.is_gestor()          -- só gestor executa
  group by p.nome, r.setor
  order by p.nome, total_minutos desc;
$$;
```
> Retorna, por membro, o total de horas **em cada setor/área** naquele mês — exatamente
> a visão que a Gestão de Pessoas precisa. Para um total puro por membro, basta agrupar
> só por `p.nome`.

> Segurança: quem é gestor fica **no banco** (protegido por RLS). Um membro comum não
> consegue "virar gestor" pelo navegador. No front-end, o app só decide **qual tela
> mostrar** com base em `is_gestor()`, mas o banco é a barreira real.

---

## 11. Custos e segurança (resumo)

- **Plano gratuito** cobre ~40 usuários com folga (banco 500 MB, auth ~50k usuários/mês).
- Usar **apenas a `anon key`** no front-end; o RLS protege os dados.
- Nunca expor a `service_role key`.
- Backups automáticos e "sem hibernação" ficam disponíveis no plano pago (~US$25/mês),
  só necessários em escala maior.
```
