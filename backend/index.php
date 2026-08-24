<?php
// Front controller: todas as requisições da API passam por aqui.

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';   // define $CONFIG, $PDO e helpers
require_once __DIR__ . '/lib/auth.php';

aplicar_cors($CONFIG);

// ---- Descobre a rota (funciona com rewrite, PATH_INFO ou servidor embutido) ----
$rota = $_SERVER['PATH_INFO'] ?? '';
if ($rota === '') {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $pos = strpos($uri, 'index.php');
    if ($pos !== false) {
        // Ex.: /api/index.php/auth/verificar -> /auth/verificar
        $rota = substr($uri, $pos + strlen('index.php'));
    } else {
        // Ex. (rewrite): /api/auth/verificar -> remove o diretório do script (/api)
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        $rota = ($base !== '' && str_starts_with($uri, $base)) ? substr($uri, strlen($base)) : $uri;
    }
}
$rota = '/' . trim($rota, '/');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ---- Utilidades de mês ----
function intervalo_do_mes(string $mes): array
{
    if (!preg_match('/^\d{4}-\d{2}$/', $mes)) {
        erro('Mês inválido (use AAAA-MM).');
    }
    [$ano, $m] = array_map('intval', explode('-', $mes));
    $inicio = sprintf('%04d-%02d-01', $ano, $m);
    $fim = $m === 12 ? sprintf('%04d-01-01', $ano + 1) : sprintf('%04d-%02d-01', $ano, $m + 1);
    return [$inicio, $fim];
}

// =================== ROTAS ===================

// Saúde
if ($rota === '/health' || $rota === '/') {
    responder(['status' => 'ok']);
}

// ---- AUTH (e-mail + senha) ----
if ($rota === '/auth/login-senha' && $metodo === 'POST') {
    $d = corpo_json();
    $email = strtolower(trim($d['email'] ?? ''));
    $senha = (string) ($d['senha'] ?? '');
    $membro = membro_por_email($PDO, $email);
    if (!$membro || !(int) $membro['ativo'] || empty($membro['senha_hash'])
        || !password_verify($senha, $membro['senha_hash'])) {
        erro('E-mail ou senha inválidos.', 401);
    }
    $sessao = jwt_criar(['sub' => (string) $membro['id'], 'tipo' => 'sessao'], $CONFIG['jwt_secret'], $CONFIG['sessao_expira_min']);
    responder([
        'access_token' => $sessao,
        'token_type' => 'bearer',
        'membro' => [
            'id' => (int) $membro['id'],
            'email' => $membro['email'],
            'nome' => $membro['nome'],
            'role' => $membro['role'],
            'senha_provisoria' => (bool) (int) $membro['senha_provisoria'],
        ],
    ]);
}

if ($rota === '/auth/trocar-senha' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $nova = (string) (corpo_json()['nova_senha'] ?? '');
    if (strlen($nova) < 6) {
        erro('A nova senha deve ter ao menos 6 caracteres.');
    }
    $hash = password_hash($nova, PASSWORD_DEFAULT);
    $PDO->prepare('UPDATE membros SET senha_hash = ?, senha_provisoria = 0 WHERE id = ?')
        ->execute([$hash, $m['id']]);
    responder(['ok' => true]);
}

if ($rota === '/auth/me' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    responder([
        'id' => (int) $m['id'], 'email' => $m['email'], 'nome' => $m['nome'],
        'role' => $m['role'], 'senha_provisoria' => (bool) (int) $m['senha_provisoria'],
    ]);
}

// ---- REGISTROS (do próprio usuário) ----
if ($rota === '/registros' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT id, data, setor, atividade, minutos, descricao, criado_em
                         FROM registros WHERE membro_id = ? ORDER BY data DESC, id DESC');
    $st->execute([$m['id']]);
    responder($st->fetchAll());
}

if ($rota === '/registros' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();
    $data = $d['data'] ?? '';
    $setor = trim($d['setor'] ?? '');
    $atividade = trim($d['atividade'] ?? '');
    $minutos = (int) ($d['minutos'] ?? 0);
    $descricao = isset($d['descricao']) && trim((string) $d['descricao']) !== '' ? trim((string) $d['descricao']) : null;

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) {
        erro('Data inválida (use AAAA-MM-DD).');
    }
    if ($setor === '' || $atividade === '') {
        erro('Setor e atividade são obrigatórios.');
    }
    if ($minutos <= 0) {
        erro('Informe o tempo trabalhado.');
    }

    $st = $PDO->prepare('INSERT INTO registros (membro_id, data, setor, atividade, minutos, descricao)
                         VALUES (?, ?, ?, ?, ?, ?)');
    $st->execute([$m['id'], $data, $setor, $atividade, $minutos, $descricao]);
    $id = (int) $PDO->lastInsertId();

    $st = $PDO->prepare('SELECT id, data, setor, atividade, minutos, descricao, criado_em FROM registros WHERE id = ?');
    $st->execute([$id]);
    responder($st->fetch(), 201);
}

if (preg_match('#^/registros/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $id = (int) $mm[1];
    $st = $PDO->prepare('SELECT membro_id FROM registros WHERE id = ?');
    $st->execute([$id]);
    $reg = $st->fetch();
    if (!$reg || (int) $reg['membro_id'] !== (int) $m['id']) {
        erro('Registro não encontrado', 404);
    }
    $PDO->prepare('DELETE FROM registros WHERE id = ?')->execute([$id]);
    http_response_code(204);
    exit;
}

// ---- GESTÃO (gestores: horas por membro e setor) ----
if ($rota === '/gestao/resumo' && $metodo === 'GET') {
    exigir_gestor($PDO, $CONFIG);
    [$inicio, $fim] = intervalo_do_mes($_GET['mes'] ?? '');
    $setor = trim($_GET['setor'] ?? '');
    $params = [$inicio, $fim];
    $filtroSetor = '';
    if ($setor !== '') {
        $filtroSetor = ' AND r.setor = ?';
        $params[] = $setor;
    }
    $st = $PDO->prepare(
        "SELECT m.nome AS nome, r.setor AS setor,
                SUM(r.minutos) AS total_minutos, COUNT(r.id) AS qtd
         FROM registros r JOIN membros m ON m.id = r.membro_id
         WHERE r.data >= ? AND r.data < ?$filtroSetor
         GROUP BY m.nome, r.setor
         ORDER BY m.nome"
    );
    $st->execute($params);
    $linhas = array_map(fn($l) => [
        'nome' => $l['nome'],
        'setor' => $l['setor'],
        'total_minutos' => (int) $l['total_minutos'],
        'qtd' => (int) $l['qtd'],
    ], $st->fetchAll());
    responder($linhas);
}

// ---- GESTÃO: análise (só gestor) — horas por setor e por atividade ----
if ($rota === '/gestao/analise' && $metodo === 'GET') {
    exigir_gestor($PDO, $CONFIG);
    [$inicio, $fim] = intervalo_do_mes($_GET['mes'] ?? '');
    $setor = trim($_GET['setor'] ?? '');
    $params = [$inicio, $fim];
    $filtroSetor = '';
    if ($setor !== '') {
        $filtroSetor = ' AND setor = ?';
        $params[] = $setor;
    }

    $porSetor = $PDO->prepare(
        "SELECT setor, SUM(minutos) AS total FROM registros
         WHERE data >= ? AND data < ?$filtroSetor GROUP BY setor ORDER BY total DESC"
    );
    $porSetor->execute($params);

    $porAtiv = $PDO->prepare(
        "SELECT atividade, SUM(minutos) AS total FROM registros
         WHERE data >= ? AND data < ?$filtroSetor GROUP BY atividade ORDER BY total DESC"
    );
    $porAtiv->execute($params);

    responder([
        'por_setor' => array_map(fn($l) => ['rotulo' => $l['setor'], 'total_minutos' => (int) $l['total']], $porSetor->fetchAll()),
        'por_atividade' => array_map(fn($l) => ['rotulo' => $l['atividade'], 'total_minutos' => (int) $l['total']], $porAtiv->fetchAll()),
    ]);
}

// ---- GESTÃO DE MEMBROS (só gestor) — cadastra/ativa/desativa acessos ----
if ($rota === '/gestao/membros' && $metodo === 'GET') {
    exigir_gestor($PDO, $CONFIG);
    $st = $PDO->query('SELECT id, email, nome, role, ativo FROM membros ORDER BY ativo DESC, nome');
    $membros = array_map(fn($m) => [
        'id' => (int) $m['id'],
        'email' => $m['email'],
        'nome' => $m['nome'],
        'role' => $m['role'],
        'ativo' => (bool) (int) $m['ativo'],
    ], $st->fetchAll());
    responder($membros);
}

if ($rota === '/gestao/membros' && $metodo === 'POST') {
    exigir_gestor($PDO, $CONFIG);
    $d = corpo_json();
    $email = strtolower(trim($d['email'] ?? ''));
    $nome = trim($d['nome'] ?? '');
    $role = ($d['role'] ?? 'membro') === 'gestor' ? 'gestor' : 'membro';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $nome === '') {
        erro('Informe um e-mail válido e o nome.');
    }
    $senhaTexto = trim((string) ($d['senha'] ?? ''));
    $senha = $senhaTexto !== '' ? password_hash($senhaTexto, PASSWORD_DEFAULT) : null;

    $existe = membro_por_email($PDO, $email);
    if ($existe) {
        // Atualiza dados; se uma senha nova foi informada, ela vira provisória (o membro troca no acesso).
        if ($senha) {
            $PDO->prepare('UPDATE membros SET nome = ?, role = ?, ativo = 1, senha_hash = ?, senha_provisoria = 1 WHERE id = ?')
                ->execute([$nome, $role, $senha, $existe['id']]);
        } else {
            $PDO->prepare('UPDATE membros SET nome = ?, role = ?, ativo = 1 WHERE id = ?')
                ->execute([$nome, $role, $existe['id']]);
        }
    } else {
        // Novo membro exige uma senha inicial (provisória).
        if (!$senha) {
            erro('Defina uma senha inicial para o novo membro.');
        }
        $PDO->prepare('INSERT INTO membros (email, nome, role, ativo, senha_hash, senha_provisoria) VALUES (?, ?, ?, 1, ?, 1)')
            ->execute([$email, $nome, $role, $senha]);
    }
    responder(['ok' => true], 201);
}

if (preg_match('#^/gestao/membros/(\d+)/ativo$#', $rota, $mm) && $metodo === 'POST') {
    exigir_gestor($PDO, $CONFIG);
    $ativo = !empty(corpo_json()['ativo']) ? 1 : 0;
    $PDO->prepare('UPDATE membros SET ativo = ? WHERE id = ?')->execute([$ativo, (int) $mm[1]]);
    responder(['ok' => true]);
}

// Nenhuma rota casou
erro('Rota não encontrada: ' . $metodo . ' ' . $rota, 404);
