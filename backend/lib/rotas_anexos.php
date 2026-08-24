<?php
// Anexos de tarefas e documentos.
//
// Detalhe importante: <a href>, <img> e <video> NÃO mandam o cabeçalho
// Authorization. Como a sessão daqui é Bearer em JavaScript, um link direto para
// o arquivo daria 401. Por isso o download usa URL ASSINADA: a API devolve um
// link com HMAC e validade, conferido sem depender do cabeçalho.

declare(strict_types=1);

require_once __DIR__ . '/erp_comum.php';

const ANEXO_MAX_BYTES = 8 * 1024 * 1024;          // 8 MB — hospedagem compartilhada é apertada
const ANEXO_VALIDADE_SEG = 60 * 30;               // link vale 30 minutos

// Extensões aceitas. Lista de permissão, nunca de bloqueio: qualquer coisa fora
// disso é recusada, o que impede subir .php e conseguir execução no servidor.
const ANEXO_TIPOS = [
    'pdf' => 'application/pdf',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
    'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml',
    'txt' => 'text/plain', 'md' => 'text/markdown', 'csv' => 'text/csv',
    'zip' => 'application/zip',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'step' => 'model/step', 'stp' => 'model/step', 'stl' => 'model/stl',
    'ino' => 'text/plain', 'dxf' => 'image/vnd.dxf',
];

function pasta_anexos(): string
{
    $dir = __DIR__ . '/../arquivos';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    // Impede que o Apache sirva ou execute qualquer coisa daqui direto.
    $guarda = $dir . '/.htaccess';
    if (!file_exists($guarda)) {
        file_put_contents($guarda, "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    }
    return $dir;
}

function assinar_anexo(int $id, string $segredo): string
{
    $exp = time() + ANEXO_VALIDADE_SEG;
    $assinatura = hash_hmac('sha256', "$id.$exp", $segredo);
    return "$exp.$assinatura";
}

function conferir_assinatura(int $id, string $chave, string $segredo): bool
{
    $partes = explode('.', $chave);
    if (count($partes) !== 2) {
        return false;
    }
    [$exp, $assinatura] = $partes;
    if (!ctype_digit($exp) || time() > (int) $exp) {
        return false;
    }
    return hash_equals(hash_hmac('sha256', "$id.$exp", $segredo), $assinatura);
}

// Confere que a pessoa pode mexer no alvo (tarefa ou documento).
function alvo_permitido(PDO $pdo, array $membro, string $tipo, int $id): void
{
    if ($tipo === 'tarefa') {
        tarefa_visivel($pdo, $membro, $id);
    } else {
        documento_visivel($pdo, $membro, $id);
    }
}

// ---- Listar ----
if (preg_match('#^/anexos/(tarefa|documento)/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    alvo_permitido($PDO, $m, $mm[1], (int) $mm[2]);

    $st = $PDO->prepare('SELECT a.*, mb.nome AS membro_nome FROM anexos a
                         LEFT JOIN membros mb ON mb.id = a.membro_id
                         WHERE a.alvo_tipo = ? AND a.alvo_id = ? ORDER BY a.id');
    $st->execute([$mm[1], (int) $mm[2]]);
    responder(array_map(fn($a) => [
        'id' => (int) $a['id'],
        'nome' => $a['nome'],
        'mime' => $a['mime'],
        'tamanho' => (int) $a['tamanho'],
        'membro_nome' => $a['membro_nome'],
        'criado_em' => $a['criado_em'],
        // Link já assinado: o navegador baixa sem precisar do cabeçalho.
        'url' => '/anexos/' . (int) $a['id'] . '?chave=' . assinar_anexo((int) $a['id'], $CONFIG['jwt_secret']),
    ], $st->fetchAll()));
}

// ---- Enviar ----
if (preg_match('#^/anexos/(tarefa|documento)/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $tipo = $mm[1];
    $alvo = (int) $mm[2];
    alvo_permitido($PDO, $m, $tipo, $alvo);

    if (!isset($_FILES['arquivo']) || !is_array($_FILES['arquivo'])) {
        erro('Nenhum arquivo recebido.');
    }
    $f = $_FILES['arquivo'];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        // O limite do PHP costuma ser menor que o nosso; a mensagem precisa dizer isso.
        erro($f['error'] === UPLOAD_ERR_INI_SIZE
            ? 'Arquivo maior que o limite do servidor (upload_max_filesize).'
            : 'Falha no envio do arquivo.');
    }
    if ((int) $f['size'] > ANEXO_MAX_BYTES) {
        erro('Arquivo maior que ' . (ANEXO_MAX_BYTES / 1024 / 1024) . ' MB.');
    }

    $nomeOriginal = (string) $f['name'];
    $ext = strtolower((string) pathinfo($nomeOriginal, PATHINFO_EXTENSION));
    if (!isset(ANEXO_TIPOS[$ext])) {
        erro('Tipo de arquivo não aceito: .' . $ext);
    }

    // Nome no disco é gerado por nós — o nome enviado pelo cliente nunca vira caminho.
    $arquivo = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], pasta_anexos() . '/' . $arquivo)) {
        erro('Não foi possível gravar o arquivo no servidor.', 500);
    }

    $PDO->prepare('INSERT INTO anexos (alvo_tipo, alvo_id, nome, mime, tamanho, arquivo, membro_id, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $tipo, $alvo,
            mb_substr($nomeOriginal, 0, 240),
            ANEXO_TIPOS[$ext],
            (int) $f['size'],
            $arquivo,
            (int) $m['id'],
            agora(),
        ]);
    $id = (int) $PDO->lastInsertId();
    if ($tipo === 'tarefa') {
        registrar_historico($PDO, $alvo, (int) $m['id'], 'anexou', 'arquivo', null, $nomeOriginal);
    }

    responder([
        'id' => $id,
        'nome' => $nomeOriginal,
        'tamanho' => (int) $f['size'],
        'url' => '/anexos/' . $id . '?chave=' . assinar_anexo($id, $CONFIG['jwt_secret']),
    ], 201);
}

// ---- Baixar (autenticado pela assinatura, não pelo cabeçalho) ----
if (preg_match('#^/anexos/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $id = (int) $mm[1];
    $chave = is_string($_GET['chave'] ?? null) ? $_GET['chave'] : '';
    if (!conferir_assinatura($id, $chave, $CONFIG['jwt_secret'])) {
        erro('Link inválido ou expirado.', 403);
    }

    $st = $PDO->prepare('SELECT * FROM anexos WHERE id = ?');
    $st->execute([$id]);
    $a = $st->fetch();
    if (!$a) {
        erro('Anexo não encontrado', 404);
    }
    $caminho = pasta_anexos() . '/' . $a['arquivo'];
    if (!is_file($caminho)) {
        erro('Arquivo não está mais no servidor.', 404);
    }

    // Content-Disposition inline só para o que é seguro exibir; o resto baixa.
    $exibir = in_array($a['mime'], ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'], true);
    header('Content-Type: ' . ($a['mime'] ?: 'application/octet-stream'));
    header('Content-Length: ' . filesize($caminho));
    header('Content-Disposition: ' . ($exibir ? 'inline' : 'attachment')
        . '; filename="' . str_replace('"', '', $a['nome']) . '"');
    // SVG pode conter script: nunca deixa o navegador interpretar como documento.
    header('X-Content-Type-Options: nosniff');
    readfile($caminho);
    exit;
}

// ---- Remover ----
if (preg_match('#^/anexos/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM anexos WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $a = $st->fetch();
    if (!$a) {
        erro('Anexo não encontrado', 404);
    }
    alvo_permitido($PDO, $m, $a['alvo_tipo'], (int) $a['alvo_id']);
    if ((int) $a['membro_id'] !== (int) $m['id'] && !e_gestor($m)) {
        erro('Você só pode remover os próprios anexos.', 403);
    }
    @unlink(pasta_anexos() . '/' . $a['arquivo']);
    $PDO->prepare('DELETE FROM anexos WHERE id = ?')->execute([(int) $a['id']]);
    http_response_code(204);
    exit;
}
