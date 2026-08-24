<?php
// Carrega config, abre o banco e expõe helpers. Incluído por todos os endpoints.

declare(strict_types=1);

// ---- Compatibilidade com PHP 7.4 (funções que só existem no PHP 8) ----
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $h, string $n): bool
    {
        return $n === '' || strncmp($h, $n, strlen($n)) === 0;
    }
}
if (!function_exists('str_contains')) {
    function str_contains(string $h, string $n): bool
    {
        return $n === '' || strpos($h, $n) !== false;
    }
}

// ---- Fuso ----
// O PHP assume UTC quando o date.timezone não está definido, e boa parte da
// hospedagem não define. Sem isto, das 21h à meia-noite o servidor já está em
// amanhã: compromisso marcado some do dia, tarefa que vence hoje aparece
// atrasada e concluida_em grava três horas no futuro.
date_default_timezone_set('America/Sao_Paulo');

// ---- Config ----
$config_path = __DIR__ . '/../config.php';
if (!file_exists($config_path)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['erro' => 'Backend não configurado: crie config.php a partir de config.example.php.']);
    exit;
}
$CONFIG = require $config_path;

// ---- CORS ----
function aplicar_cors(array $config): void
{
    header('Access-Control-Allow-Origin: ' . $config['frontend_url']);
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ---- Respostas JSON ----
function responder($dados, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function erro(string $mensagem, int $status = 400): void
{
    responder(['erro' => $mensagem], $status);
}

// Lê o corpo JSON da requisição.
function corpo_json(): array
{
    $bruto = file_get_contents('php://input');
    $dados = json_decode($bruto ?: '[]', true);
    return is_array($dados) ? $dados : [];
}

// ---- Banco (PDO) ----
function conectar_db(array $config): PDO
{
    $pdo = new PDO($config['db_dsn'], $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    if (str_starts_with($config['db_dsn'], 'sqlite:')) {
        $pdo->exec('PRAGMA foreign_keys = ON');
    }
    return $pdo;
}

$PDO = conectar_db($CONFIG);
