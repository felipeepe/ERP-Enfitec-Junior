<?php
// Copie este arquivo para "config.php" e ajuste os valores.
// O config.php NÃO deve ir para o Git (contém segredos).

return [
    // ---- Banco de dados (PDO) ----
    // Produção (MySQL/MariaDB da UFRGS):
    //   'db_dsn'  => 'mysql:host=localhost;dbname=enfitec_horas;charset=utf8mb4',
    //   'db_user' => 'usuario',
    //   'db_pass' => 'senha',
    // Desenvolvimento (SQLite, não precisa de servidor de banco):
    'db_dsn'  => 'sqlite:' . __DIR__ . '/registrador.db',
    'db_user' => null,
    'db_pass' => null,

    // ---- Segurança ----
    // Troque por um valor aleatório longo (ex.: saída de um gerador de senha).
    'jwt_secret'       => 'troque-por-um-segredo-bem-aleatorio',
    'sessao_expira_min' => 60 * 24 * 7, // 7 dias
    'magic_expira_min'  => 15,           // link mágico válido por 15 min

    // ---- Front-end (CORS + montagem do link) ----
    'frontend_url' => 'http://localhost:5173',

    // ---- E-mail (link mágico) ----
    // Se 'smtp_mail' for false, usa a função mail() do PHP.
    // Em desenvolvimento, se não houver envio, o link é gravado em lib/ultimo-link.txt.
    'email_remetente' => 'nao-responder@enfitecjunior.com',
    'email_ativo'     => false, // true em produção (usa mail() do PHP)
];
