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
    auth.php         # link mágico e identificação do usuário
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

## Fluxo de autenticação (link mágico, sem senha)

1. `POST /auth/solicitar-acesso` `{ "email": "..." }` → se autorizado e ativo, gera o link.
   - Em produção (`email_ativo => true`), envia por e-mail com a função `mail()` do PHP.
   - Em dev, grava o link em `lib/ultimo-link.txt` para você copiar.
2. `POST /auth/verificar` `{ "token": "..." }` → devolve o `access_token` de sessão.
3. Demais rotas usam o cabeçalho `Authorization: Bearer <access_token>`.

## Endpoints

| Método | Rota | Quem acessa | O quê |
|---|---|---|---|
| POST | `/auth/solicitar-acesso` | público | pede o link mágico |
| POST | `/auth/verificar` | público | troca o link por sessão |
| GET  | `/auth/me` | logado | dados do usuário |
| GET  | `/registros` | logado | lista os próprios registros |
| POST | `/registros` | logado | cria um registro |
| DELETE | `/registros/{id}` | logado | remove um registro seu |
| GET  | `/gestao/resumo?mes=AAAA-MM` | **gestor** | horas por membro e setor |

## Publicar na UFRGS (produção)

1. No painel/phpMyAdmin, criar o banco e **importar `schema.sql`**.
2. Copiar `config.example.php` para `config.php` e preencher:
   - `db_dsn` = `mysql:host=SEU_HOST;dbname=SEU_BANCO;charset=utf8mb4`, `db_user`, `db_pass`;
   - `jwt_secret` = um valor aleatório longo;
   - `frontend_url` = endereço do front publicado;
   - `email_ativo => true` (para enviar os links por e-mail).
3. Enviar a pasta `backend/` para o servidor (ex.: `public_html/api/`).
4. Cadastrar os membros: `php seed.php email@enfitecjunior.com "Nome" membro`
   (ou inserir direto pelo phpMyAdmin).
5. Conferir que o `.htaccess` está ativo (precisa de `mod_rewrite`). Se o servidor
   não tiver rewrite, as rotas ainda funcionam via `index.php/...`.

## Gestão de acesso (a cada semestre)

- Novo membro: `INSERT` na tabela `membros` (ou `php seed.php ...`).
- Tornar gestor (Gestão de Pessoas): `role = 'gestor'`.
- Desligar alguém: `ativo = 0` (bloqueia o acesso e **preserva o histórico**).
