# Backend — Registrador de Horas ENFITEC (PHP + MySQL)

API em **PHP puro (PDO)**, sem framework nem Composer — feita para rodar em
**hospedagem compartilhada PHP** (como a da UFRGS). Portável: usa **SQLite** em
desenvolvimento e **MySQL/MariaDB** em produção, só trocando o `config.php`.

## Estrutura

```
backend/
  index.php          # controlador: todas as rotas passam por aqui
  .htaccess          # redireciona as requisições para o index.php
  config.example.php # modelo de configuração (copie para config.php)
  schema.sql         # estrutura do banco em MySQL (importar no phpMyAdmin)
  migrar.php         # cria as tabelas (útil no dev com SQLite)
  seed.php           # cadastra membros/gestores
  lib/               # código interno (protegido por .htaccess)
    bootstrap.php    # config + conexão + helpers
    jwt.php          # tokens JWT (HS256)
    auth.php         # identificação do usuário logado e checagem de papel
```

## Rodar localmente (com PHP instalado)

```bash
cd backend
cp config.example.php config.php     # já vem configurado para SQLite (dev)
php seed.php                          # cria as tabelas + membros de exemplo
php -S localhost:8000 router.php      # servidor embutido do PHP (usa o router)
```

Testar: `http://localhost:8000/health` deve responder `{"status":"ok"}`.

> Sem PHP na máquina? Instale em https://www.php.net/downloads (ou XAMPP).
> A API também pode ser testada direto no servidor da UFRGS.

## Fluxo de autenticação (e-mail + senha)

1. `POST /auth/login-senha` `{ "email": "...", "senha": "..." }` → confere o hash
   (`password_verify`) e devolve o `access_token` (JWT HS256) junto com os dados do membro.
2. Se o membro vier com `senha_provisoria: true`, o front obriga a troca em
   `POST /auth/trocar-senha` `{ "nova_senha": "..." }` antes de liberar o resto do app.
3. As rotas autenticadas usam o cabeçalho `Authorization: Bearer <access_token>`
   (`/health` é a exceção pública). O token expira em `sessao_expira_min` — 7 dias por
   padrão — e **não há rota de refresh**: expirou, o usuário faz login de novo.

## Endpoints

Nas rotas de gestão, `mes` é **obrigatório** (formato `AAAA-MM`, senão 400) e `setor` é
opcional — omitido, traz todos os setores.

| Método | Rota | Quem acessa | O quê |
|---|---|---|---|
| GET  | `/health` | público | checagem de saúde (não exige token) |
| POST | `/auth/login-senha` | público | troca e-mail + senha por uma sessão |
| POST | `/auth/trocar-senha` | logado | define a senha pessoal (mín. 6 caracteres) |
| GET  | `/auth/me` | logado | dados do usuário |
| GET  | `/registros` | logado | lista os próprios registros |
| POST | `/registros` | logado | cria um registro |
| DELETE | `/registros/{id}` | logado | remove um registro seu |
| GET  | `/gestao/resumo?mes=AAAA-MM&setor=` | **gestor** | horas por membro e setor |
| GET  | `/gestao/analise?mes=AAAA-MM&setor=` | **gestor** | totais por setor e por atividade |
| GET  | `/gestao/membros` | **gestor** | lista membros e status de acesso |
| POST | `/gestao/membros` | **gestor** | cadastra/atualiza membro (senha inicial provisória) |
| POST | `/gestao/membros/{id}/ativo` | **gestor** | ativa/desativa o acesso |

## Publicar na UFRGS (produção)

1. No painel/phpMyAdmin, criar o banco e **importar `schema.sql`**.
2. Copiar `config.example.php` para `config.php` e preencher:
   - `db_dsn` = `mysql:host=SEU_HOST;dbname=SEU_BANCO;charset=utf8mb4`, `db_user`, `db_pass`;
   - `jwt_secret` = um valor aleatório longo;
   - `frontend_url` = endereço do front publicado (origem liberada no CORS).
3. Enviar a pasta `backend/` para o servidor (ex.: `public_html/api/`).
4. Cadastrar os membros: `php seed.php email@enfitecjunior.com "Nome" membro`
   (ou inserir direto pelo phpMyAdmin).
5. Conferir que o `.htaccess` está ativo (precisa de `mod_rewrite`). Se o servidor
   não tiver rewrite, as rotas ainda funcionam via `index.php/...`.

## Gestão de acesso (a cada semestre)

- Novo membro: `INSERT` na tabela `membros` (ou `php seed.php ...`).
- Tornar gestor (Gestão de Pessoas): `role = 'gestor'`.
- Desligar alguém: `ativo = 0` (bloqueia o acesso e **preserva o histórico**).

> A conta com `role = 'gestor'` **apenas monitora** as horas da equipe — ela não lança
> as próprias. Por isso o front envia o gestor direto ao painel e não mostra o
> formulário de registro.
