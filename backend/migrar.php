<?php
// Cria as tabelas no banco configurado. Use no desenvolvimento (SQLite) ou como
// alternativa ao import do schema.sql. Rode:  php migrar.php
declare(strict_types=1);

$CONFIG = require __DIR__ . '/config.php';
require_once __DIR__ . '/lib/bootstrap.php'; // já cria $PDO a partir do config

$sqlite = str_starts_with($CONFIG['db_dsn'], 'sqlite:');

if ($sqlite) {
    $PDO->exec("CREATE TABLE IF NOT EXISTS membros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'membro',
        ativo INTEGER NOT NULL DEFAULT 1,
        senha_hash TEXT,
        senha_provisoria INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $PDO->exec("CREATE TABLE IF NOT EXISTS registros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        membro_id INTEGER NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        setor TEXT NOT NULL,
        atividade TEXT NOT NULL,
        minutos INTEGER NOT NULL,
        descricao TEXT,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $PDO->exec("CREATE INDEX IF NOT EXISTS idx_membro_data ON registros(membro_id, data)");
} else {
    // MySQL/MariaDB: executa o schema.sql (removendo as linhas de comentário antes).
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        if ($stmt !== '') {
            $PDO->exec($stmt);
        }
    }
}

// Segurança para bancos já existentes: adiciona colunas que faltarem.
foreach ([
    'senha_hash' => $sqlite ? 'TEXT' : 'VARCHAR(255) NULL',
    'senha_provisoria' => $sqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'TINYINT(1) NOT NULL DEFAULT 0',
] as $coluna => $tipo) {
    try {
        $PDO->exec("ALTER TABLE membros ADD COLUMN $coluna $tipo");
    } catch (Throwable $e) {
        // Coluna já existe — ignora.
    }
}

echo "Tabelas criadas/atualizadas com sucesso.\n";
