<?php
// Identificação do usuário logado a partir do token de sessão (JWT).

declare(strict_types=1);

require_once __DIR__ . '/jwt.php';

// Busca um membro pelo e-mail.
function membro_por_email(PDO $pdo, string $email): ?array
{
    $st = $pdo->prepare('SELECT * FROM membros WHERE email = ?');
    $st->execute([strtolower(trim($email))]);
    $m = $st->fetch();
    return $m ?: null;
}

// Busca um membro pelo id.
function membro_por_id(PDO $pdo, int $id): ?array
{
    $st = $pdo->prepare('SELECT * FROM membros WHERE id = ?');
    $st->execute([$id]);
    $m = $st->fetch();
    return $m ?: null;
}

// Extrai o token "Authorization: Bearer ..." e devolve o membro logado (ou null).
function membro_logado(PDO $pdo, array $config): ?array
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization']
        ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');

    if (!preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
        return null;
    }
    $payload = jwt_verificar(trim($m[1]), $config['jwt_secret']);
    if (!$payload || ($payload['tipo'] ?? '') !== 'sessao') {
        return null;
    }
    $membro = membro_por_id($pdo, (int) $payload['sub']);
    if (!$membro || !(int) $membro['ativo']) {
        return null;
    }
    return $membro;
}

// Exige um usuário logado; encerra com 401 se não houver.
function exigir_login(PDO $pdo, array $config): array
{
    $membro = membro_logado($pdo, $config);
    if (!$membro) {
        erro('Não autenticado', 401);
    }
    return $membro;
}

// Exige um gestor; encerra com 403 se não for.
function exigir_gestor(PDO $pdo, array $config): array
{
    $membro = exigir_login($pdo, $config);
    if (($membro['role'] ?? '') !== 'gestor') {
        erro('Apenas gestores', 403);
    }
    return $membro;
}
