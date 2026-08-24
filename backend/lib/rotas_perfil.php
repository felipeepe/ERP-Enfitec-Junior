<?php
// Perfil de cada pessoa e mensagens diretas.
// Incluído por index.php, que já definiu $rota, $metodo, $PDO e $CONFIG.

declare(strict_types=1);

require_once __DIR__ . '/erp_comum.php';

// A foto vem como data URI já redimensionada pelo navegador. Aceitar qualquer
// string aqui deixaria alguém guardar HTML ou SVG com script e servir isso
// dentro de um <img> na tela de todo mundo — por isso o formato é conferido.
const FOTO_MAX_BYTES = 300 * 1024;

function validar_foto(?string $dataUri): ?string
{
    if ($dataUri === null || $dataUri === '') {
        return null;
    }
    if (!preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $dataUri)) {
        erro('Formato de imagem não aceito (use PNG, JPEG ou WebP).');
    }
    if (strlen($dataUri) > FOTO_MAX_BYTES) {
        erro('Imagem grande demais depois de processada.');
    }
    return $dataUri;
}

// Só o que pode aparecer para as outras pessoas.
function perfil_publico(array $m): array
{
    return [
        'id' => (int) $m['id'],
        'nome' => $m['nome'],
        'apelido' => $m['apelido'] ?? null,
        'email' => $m['email'],
        'setor' => $m['setor'] ?? null,
        'role' => $m['role'],
        'bio' => $m['bio'] ?? null,
        'telefone' => $m['telefone'] ?? null,
        'cor_avatar' => $m['cor_avatar'] ?? null,
        'foto' => $m['foto'] ?? null,
        'ativo' => (bool) (int) $m['ativo'],
    ];
}

// ============================ PERFIL ============================

if ($rota === '/perfil' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    responder(perfil_publico($m) + ['senha_provisoria' => (bool) (int) $m['senha_provisoria']]);
}

// Cada pessoa edita o PRÓPRIO perfil. Papel, diretoria e e-mail ficam de fora
// de propósito: são atribuições da gestão, não personalização.
if ($rota === '/perfil' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();

    $campos = [];
    $params = [];
    foreach (['apelido', 'bio', 'telefone', 'cor_avatar'] as $campo) {
        if (!array_key_exists($campo, $d)) {
            continue;
        }
        $campos[] = "$campo = ?";
        $params[] = campo_ou_nulo($d, $campo);
    }
    if (array_key_exists('foto', $d)) {
        $campos[] = 'foto = ?';
        $params[] = validar_foto(campo_ou_nulo($d, 'foto'));
    }
    if (!$campos) {
        responder(['ok' => true]);
    }
    $params[] = (int) $m['id'];
    $PDO->prepare('UPDATE membros SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute($params);

    $atualizado = membro_por_id($PDO, (int) $m['id']);
    responder(perfil_publico($atualizado));
}

// Troca de senha por vontade própria — diferente de /auth/trocar-senha, que é a
// troca obrigatória do primeiro acesso: aqui a senha atual precisa ser conferida.
if ($rota === '/perfil/senha' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();
    $atual = (string) ($d['senha_atual'] ?? '');
    $nova = (string) ($d['nova_senha'] ?? '');

    if (empty($m['senha_hash']) || !password_verify($atual, $m['senha_hash'])) {
        erro('Senha atual incorreta.', 403);
    }
    if (mb_strlen($nova) < 6) {
        erro('A nova senha deve ter ao menos 6 caracteres.');
    }
    $PDO->prepare('UPDATE membros SET senha_hash = ?, senha_provisoria = 0 WHERE id = ?')
        ->execute([password_hash($nova, PASSWORD_DEFAULT), (int) $m['id']]);
    responder(['ok' => true]);
}

// Perfil de outra pessoa (para abrir a partir de uma tarefa ou de uma conversa).
if (preg_match('#^/perfil/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    exigir_login($PDO, $CONFIG);
    $outro = membro_por_id($PDO, (int) $mm[1]);
    if (!$outro) {
        erro('Pessoa não encontrada', 404);
    }
    responder(perfil_publico($outro));
}

// ============================ MENSAGENS ============================

// Lista de conversas: última mensagem de cada pessoa e quantas não foram lidas.
if ($rota === '/mensagens' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $eu = (int) $m['id'];

    // A "outra ponta" da conversa depende de quem enviou.
    $st = $PDO->prepare(
        'SELECT
            CASE WHEN remetente_id = ? THEN destinatario_id ELSE remetente_id END AS outro_id,
            MAX(id) AS ultima_id
         FROM mensagens
         WHERE (remetente_id = ? OR destinatario_id = ?) AND excluido_em IS NULL
         GROUP BY outro_id'
    );
    $st->execute([$eu, $eu, $eu]);
    $pares = $st->fetchAll();
    if (!$pares) {
        responder([]);
    }

    $ids = array_map(fn($p) => (int) $p['ultima_id'], $pares);
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $ult = $PDO->prepare("SELECT * FROM mensagens WHERE id IN ($marcas)");
    $ult->execute($ids);
    $porId = [];
    foreach ($ult->fetchAll() as $x) {
        $porId[(int) $x['id']] = $x;
    }

    $naoLidas = $PDO->prepare(
        'SELECT remetente_id, COUNT(*) AS n FROM mensagens
         WHERE destinatario_id = ? AND lida_em IS NULL AND excluido_em IS NULL
         GROUP BY remetente_id'
    );
    $naoLidas->execute([$eu]);
    $pendentes = [];
    foreach ($naoLidas->fetchAll() as $x) {
        $pendentes[(int) $x['remetente_id']] = (int) $x['n'];
    }

    $conversas = [];
    foreach ($pares as $p) {
        $outroId = (int) $p['outro_id'];
        $outro = membro_por_id($PDO, $outroId);
        if (!$outro) {
            continue;
        }
        $ultima = $porId[(int) $p['ultima_id']] ?? null;
        $conversas[] = [
            'membro' => [
                'id' => $outroId,
                'nome' => $outro['nome'],
                'apelido' => $outro['apelido'] ?? null,
                'setor' => $outro['setor'] ?? null,
                'cor_avatar' => $outro['cor_avatar'] ?? null,
                'foto' => $outro['foto'] ?? null,
            ],
            'ultima' => $ultima ? [
                'texto' => mb_substr((string) $ultima['texto'], 0, 120),
                'criado_em' => $ultima['criado_em'],
                'minha' => (int) $ultima['remetente_id'] === $eu,
            ] : null,
            'nao_lidas' => $pendentes[$outroId] ?? 0,
        ];
    }

    // Conversa com mensagem mais recente primeiro.
    usort($conversas, fn($a, $b) => strcmp($b['ultima']['criado_em'] ?? '', $a['ultima']['criado_em'] ?? ''));
    responder($conversas);
}

// Só o total, para o contador do menu. Consulta barata, chamada com frequência.
if ($rota === '/mensagens/nao-lidas' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT COUNT(*) AS n FROM mensagens
                         WHERE destinatario_id = ? AND lida_em IS NULL AND excluido_em IS NULL');
    $st->execute([(int) $m['id']]);
    responder(['total' => (int) $st->fetch()['n']]);
}

// Conversa com uma pessoa. Abrir a conversa marca como lida o que veio dela.
if (preg_match('#^/mensagens/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $eu = (int) $m['id'];
    $outroId = (int) $mm[1];

    $outro = membro_por_id($PDO, $outroId);
    if (!$outro) {
        erro('Pessoa não encontrada', 404);
    }

    $st = $PDO->prepare(
        'SELECT * FROM mensagens
         WHERE excluido_em IS NULL
           AND ((remetente_id = ? AND destinatario_id = ?) OR (remetente_id = ? AND destinatario_id = ?))
         ORDER BY id'
    );
    $st->execute([$eu, $outroId, $outroId, $eu]);
    $mensagens = $st->fetchAll();

    $PDO->prepare('UPDATE mensagens SET lida_em = ? WHERE destinatario_id = ? AND remetente_id = ? AND lida_em IS NULL')
        ->execute([agora(), $eu, $outroId]);

    responder([
        'membro' => [
            'id' => $outroId,
            'nome' => $outro['nome'],
            'apelido' => $outro['apelido'] ?? null,
            'setor' => $outro['setor'] ?? null,
            'cor_avatar' => $outro['cor_avatar'] ?? null,
            'foto' => $outro['foto'] ?? null,
        ],
        'mensagens' => array_map(fn($x) => [
            'id' => (int) $x['id'],
            'texto' => $x['texto'],
            'criado_em' => $x['criado_em'],
            'lida_em' => $x['lida_em'],
            'minha' => (int) $x['remetente_id'] === $eu,
        ], $mensagens),
    ]);
}

if (preg_match('#^/mensagens/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $eu = (int) $m['id'];
    $outroId = (int) $mm[1];

    if ($outroId === $eu) {
        erro('Não dá para mandar mensagem para si mesmo.');
    }
    $outro = membro_por_id($PDO, $outroId);
    if (!$outro || !(int) $outro['ativo']) {
        erro('Pessoa não encontrada ou sem acesso ativo.', 404);
    }

    $texto = campo_texto(corpo_json(), 'texto');
    if ($texto === '') {
        erro('Escreva alguma coisa.');
    }
    if (mb_strlen($texto) > 4000) {
        erro('Mensagem longa demais.');
    }

    $PDO->prepare('INSERT INTO mensagens (remetente_id, destinatario_id, texto, criado_em) VALUES (?, ?, ?, ?)')
        ->execute([$eu, $outroId, $texto, agora()]);

    responder(['id' => (int) $PDO->lastInsertId(), 'criado_em' => agora()], 201);
}

// Apagar apaga só para quem enviou — e só a própria mensagem.
if (preg_match('#^/mensagens/item/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM mensagens WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $msg = $st->fetch();
    if (!$msg) {
        erro('Mensagem não encontrada', 404);
    }
    if ((int) $msg['remetente_id'] !== (int) $m['id']) {
        erro('Você só pode apagar as próprias mensagens.', 403);
    }
    $PDO->prepare('UPDATE mensagens SET excluido_em = ? WHERE id = ?')->execute([agora(), (int) $msg['id']]);
    http_response_code(204);
    exit;
}
