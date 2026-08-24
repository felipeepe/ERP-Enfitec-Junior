<?php
// JWT (HS256) minimalista, sem dependências externas.

declare(strict_types=1);

function base64url_encode(string $dados): string
{
    return rtrim(strtr(base64_encode($dados), '+/', '-_'), '=');
}

function base64url_decode(string $dados): string
{
    return base64_decode(strtr($dados, '-_', '+/')) ?: '';
}

function jwt_criar(array $payload, string $segredo, int $expira_min): string
{
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload['exp'] = time() + $expira_min * 60;

    $h = base64url_encode(json_encode($header, JSON_UNESCAPED_UNICODE));
    $p = base64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $assinatura = hash_hmac('sha256', "$h.$p", $segredo, true);
    $s = base64url_encode($assinatura);
    return "$h.$p.$s";
}

// Retorna o payload (array) se válido, ou null se inválido/expirado.
function jwt_verificar(string $token, string $segredo): ?array
{
    $partes = explode('.', $token);
    if (count($partes) !== 3) {
        return null;
    }
    [$h, $p, $s] = $partes;

    $esperado = base64url_encode(hash_hmac('sha256', "$h.$p", $segredo, true));
    if (!hash_equals($esperado, $s)) {
        return null;
    }

    $payload = json_decode(base64url_decode($p), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
        return null;
    }
    return $payload;
}
