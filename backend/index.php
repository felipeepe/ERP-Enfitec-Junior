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
        // Ex.: /api/index.php/auth/login-senha -> /auth/login-senha
        $rota = substr($uri, $pos + strlen('index.php'));
    } else {
        // Ex. (rewrite): /api/auth/login-senha -> remove o diretório do script (/api)
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
    require_once __DIR__ . '/lib/erp_comum.php';
    $d = corpo_json();
    // Cast explícito: sob strict_types, {"email": []} viraria TypeError e HTTP 500.
    $email = strtolower(campo_texto($d, 'email'));
    $senha = is_scalar($d['senha'] ?? null) ? (string) $d['senha'] : '';

    // ---- Freio contra tentativa em massa ----
    // Sem isto, um script testa milhares de senhas por minuto. Conta as falhas
    // recentes do MESMO e-mail e recusa antes de sequer verificar o hash.
    $JANELA_MIN = 15;
    $LIMITE = 5;
    $desde = date('Y-m-d H:i:s', time() - $JANELA_MIN * 60);

    // Aproveita para limpar o que já não importa, evitando crescer sem fim.
    $PDO->prepare('DELETE FROM tentativas_login WHERE criado_em < ?')
        ->execute([date('Y-m-d H:i:s', time() - 24 * 3600)]);

    $ct = $PDO->prepare('SELECT COUNT(*) AS n FROM tentativas_login WHERE email = ? AND criado_em >= ?');
    $ct->execute([$email, $desde]);
    $falhas = (int) $ct->fetch()['n'];

    if ($falhas >= $LIMITE) {
        // 429 e não 401: a diferença importa para quem está legitimamente travado.
        erro("Muitas tentativas. Aguarde $JANELA_MIN minutos e tente de novo.", 429);
    }

    $membro = membro_por_email($PDO, $email);
    if (!$membro || !(int) $membro['ativo'] || empty($membro['senha_hash'])
        || !password_verify($senha, $membro['senha_hash'])) {
        $PDO->prepare('INSERT INTO tentativas_login (email, origem, criado_em) VALUES (?, ?, ?)')
            ->execute([$email, substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 60), agora()]);
        // Mensagem única para e-mail inexistente, senha errada e conta inativa:
        // diferenciar permitiria descobrir quem tem cadastro.
        erro('E-mail ou senha inválidos.', 401);
    }

    // Entrou: zera o histórico de falhas dessa conta.
    $PDO->prepare('DELETE FROM tentativas_login WHERE email = ?')->execute([$email]);
    $sessao = jwt_criar(['sub' => (string) $membro['id'], 'tipo' => 'sessao'], $CONFIG['jwt_secret'], $CONFIG['sessao_expira_min']);
    responder([
        'access_token' => $sessao,
        'token_type' => 'bearer',
        'membro' => [
            'id' => (int) $membro['id'],
            'email' => $membro['email'],
            'nome' => $membro['nome'],
            'role' => $membro['role'],
            'setor' => $membro['setor'],
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
        'role' => $m['role'], 'setor' => $m['setor'],
        'senha_provisoria' => (bool) (int) $m['senha_provisoria'],
    ]);
}

// ---- REGISTROS (do próprio usuário) ----
if ($rota === '/registros' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT r.id, r.data, r.setor, r.atividade, r.minutos, r.descricao,
                                r.tipo_hora, r.projeto_id, r.tarefa_id, r.criado_em,
                                p.nome AS projeto_nome, p.codigo AS projeto_codigo,
                                t.titulo AS tarefa_titulo, t.numero AS tarefa_numero
                         FROM registros r
                         LEFT JOIN projetos p ON p.id = r.projeto_id
                         LEFT JOIN tarefas t ON t.id = r.tarefa_id
                         WHERE r.membro_id = ? ORDER BY r.data DESC, r.id DESC');
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

    // Natureza da hora. Nem todo trabalho de uma EJ é técnico em projeto:
    // reunião administrativa, evento e estudo também contam como hora dedicada.
    $tipoHora = $d['tipo_hora'] ?? 'tecnica';
    if (!in_array($tipoHora, ['tecnica', 'administrativa', 'evento', 'estudo'], true)) {
        erro('Tipo de hora inválido.');
    }

    $projetoId = isset($d['projeto_id']) && is_numeric($d['projeto_id']) ? (int) $d['projeto_id'] : null;
    $tarefaId = isset($d['tarefa_id']) && is_numeric($d['tarefa_id']) ? (int) $d['tarefa_id'] : null;

    if ($tipoHora === 'tecnica') {
        if ($projetoId === null) {
            erro('Hora técnica precisa estar ligada a um projeto.');
        }
        // Confere que a pessoa realmente enxerga esse projeto — senão daria para
        // lançar hora em projeto de outra diretoria e distorcer o relatório dela.
        require_once __DIR__ . '/lib/erp_comum.php';
        $projeto = projeto_visivel($PDO, $m, $projetoId);
        if ($tarefaId !== null) {
            $vt = $PDO->prepare('SELECT projeto_id FROM tarefas WHERE id = ? AND excluido_em IS NULL');
            $vt->execute([$tarefaId]);
            $t = $vt->fetch();
            if (!$t || (int) $t['projeto_id'] !== (int) $projeto['id']) {
                erro('A tarefa escolhida não pertence a esse projeto.');
            }
        }
    } else {
        // Só hora técnica se liga a projeto; o resto fica solto de propósito.
        $projetoId = null;
        $tarefaId = null;
    }

    $st = $PDO->prepare('INSERT INTO registros (membro_id, data, setor, atividade, minutos, descricao, tipo_hora, projeto_id, tarefa_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $st->execute([$m['id'], $data, $setor, $atividade, $minutos, $descricao, $tipoHora, $projetoId, $tarefaId]);
    $id = (int) $PDO->lastInsertId();

    $st = $PDO->prepare('SELECT r.id, r.data, r.setor, r.atividade, r.minutos, r.descricao,
                                r.tipo_hora, r.projeto_id, r.tarefa_id, r.criado_em,
                                p.nome AS projeto_nome, p.codigo AS projeto_codigo,
                                t.titulo AS tarefa_titulo, t.numero AS tarefa_numero
                         FROM registros r
                         LEFT JOIN projetos p ON p.id = r.projeto_id
                         LEFT JOIN tarefas t ON t.id = r.tarefa_id
                         WHERE r.id = ?');
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
    $st = $PDO->query('SELECT id, email, nome, role, setor, ativo FROM membros ORDER BY ativo DESC, nome');
    $membros = array_map(fn($m) => [
        'id' => (int) $m['id'],
        'email' => $m['email'],
        'nome' => $m['nome'],
        'role' => $m['role'],
        'setor' => $m['setor'],
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
    // Diretoria de atuação. Uma por membro; vazio vira NULL (sem diretoria definida).
    $setorTexto = trim((string) ($d['setor'] ?? ''));
    $setor = $setorTexto !== '' ? $setorTexto : null;

    $existe = membro_por_email($PDO, $email);
    if ($existe) {
        // Atualiza dados; se uma senha nova foi informada, ela vira provisória (o membro troca no acesso).
        if ($senha) {
            $PDO->prepare('UPDATE membros SET nome = ?, role = ?, setor = ?, ativo = 1, senha_hash = ?, senha_provisoria = 1 WHERE id = ?')
                ->execute([$nome, $role, $setor, $senha, $existe['id']]);
        } else {
            $PDO->prepare('UPDATE membros SET nome = ?, role = ?, setor = ?, ativo = 1 WHERE id = ?')
                ->execute([$nome, $role, $setor, $existe['id']]);
        }
    } else {
        // Novo membro exige uma senha inicial (provisória).
        if (!$senha) {
            erro('Defina uma senha inicial para o novo membro.');
        }
        $PDO->prepare('INSERT INTO membros (email, nome, role, setor, ativo, senha_hash, senha_provisoria) VALUES (?, ?, ?, ?, 1, ?, 1)')
            ->execute([$email, $nome, $role, $setor, $senha]);
    }
    responder(['ok' => true], 201);
}

if (preg_match('#^/gestao/membros/(\d+)/ativo$#', $rota, $mm) && $metodo === 'POST') {
    exigir_gestor($PDO, $CONFIG);
    $ativo = !empty(corpo_json()['ativo']) ? 1 : 0;
    $PDO->prepare('UPDATE membros SET ativo = ? WHERE id = ?')->execute([$ativo, (int) $mm[1]]);
    responder(['ok' => true]);
}

// ---- Módulos do ERP (Projetos, Documentação, busca, OKRs, painel) ----
require __DIR__ . '/lib/rotas_projetos.php';
require __DIR__ . '/lib/rotas_documentos.php';   // define documento_visivel(), usada abaixo
require __DIR__ . '/lib/rotas_anexos.php';
require __DIR__ . '/lib/rotas_perfil.php';
require __DIR__ . '/lib/rotas_agenda.php';

// Nenhuma rota casou
erro('Rota não encontrada: ' . $metodo . ' ' . $rota, 404);
