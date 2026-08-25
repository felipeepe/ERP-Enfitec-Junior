<?php
// Agenda: compromissos da EJ e a visão combinada com os prazos de tarefa.
// Incluído por index.php, que já definiu $rota, $metodo, $PDO e $CONFIG.

declare(strict_types=1);

require_once __DIR__ . '/erp_comum.php';

const TIPOS_EVENTO = ['reuniao', 'visita', 'evento', 'treinamento', 'prazo'];

// Evento sem setor é da EJ inteira (assembleia, confraternização); com setor,
// vale o escopo por diretoria, igual ao resto do sistema.
function filtro_evento(array $membro): array
{
    $setores = setores_visiveis($membro);
    if ($setores === null) {
        return ['', []];
    }
    if ($setores === []) {
        return [' AND e.setor IS NULL', []];
    }
    $marcas = implode(',', array_fill(0, count($setores), '?'));
    return [" AND (e.setor IS NULL OR e.setor IN ($marcas))", $setores];
}

function evento_visivel(PDO $pdo, array $membro, int $id): array
{
    $st = $pdo->prepare('SELECT * FROM eventos WHERE id = ? AND excluido_em IS NULL');
    $st->execute([$id]);
    $e = $st->fetch();
    if (!$e) {
        erro('Compromisso não encontrado', 404);
    }
    $setores = setores_visiveis($membro);
    if ($setores !== null && $e['setor'] !== null && !in_array($e['setor'], $setores, true)) {
        erro('Compromisso não encontrado', 404);
    }
    return $e;
}

// Participantes de vários eventos numa consulta só.
function participantes_por_evento(PDO $pdo, array $ids): array
{
    if (!$ids) {
        return [];
    }
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT p.evento_id, p.situacao, m.id, m.nome, m.apelido, m.cor_avatar, m.foto
                         FROM evento_participantes p JOIN membros m ON m.id = p.membro_id
                         WHERE p.evento_id IN ($marcas) ORDER BY m.nome");
    $st->execute($ids);
    $mapa = [];
    foreach ($st->fetchAll() as $l) {
        $mapa[(int) $l['evento_id']][] = [
            'id' => (int) $l['id'], 'nome' => $l['nome'], 'apelido' => $l['apelido'],
            'cor_avatar' => $l['cor_avatar'], 'foto' => $l['foto'], 'situacao' => $l['situacao'],
        ];
    }
    return $mapa;
}

function evento_para_front(array $e, array $participantes = []): array
{
    $id = (int) $e['id'];
    return [
        'id' => $id,
        'titulo' => $e['titulo'],
        'descricao' => $e['descricao'],
        'tipo' => $e['tipo'],
        'local' => $e['local'],
        'data' => $e['data'],
        'data_fim' => $e['data_fim'],
        'hora_inicio' => $e['hora_inicio'],
        'hora_fim' => $e['hora_fim'],
        'dia_inteiro' => (bool) (int) $e['dia_inteiro'],
        'setor' => $e['setor'],
        'projeto_id' => $e['projeto_id'] !== null ? (int) $e['projeto_id'] : null,
        'criado_por' => $e['criado_por'] !== null ? (int) $e['criado_por'] : null,
        'participantes' => $participantes[$id] ?? [],
    ];
}

// Intervalo pedido pelo cliente, com um padrão do mês corrente.
function intervalo_pedido(): array
{
    $de = is_string($_GET['de'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['de'])
        ? $_GET['de'] : date('Y-m-01');
    $ate = is_string($_GET['ate'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['ate'])
        ? $_GET['ate'] : date('Y-m-t');
    if ($ate < $de) {
        erro('Intervalo inválido.');
    }
    return [$de, $ate];
}

// ============================ EVENTOS ============================

if ($rota === '/eventos' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    [$de, $ate] = intervalo_pedido();
    [$filtro, $params] = filtro_evento($m);

    // Um evento de vários dias entra se qualquer parte dele cai no intervalo.
    $st = $PDO->prepare(
        "SELECT e.* FROM eventos e
         WHERE e.excluido_em IS NULL
           AND e.data <= ? AND COALESCE(e.data_fim, e.data) >= ?$filtro
         ORDER BY e.data, COALESCE(e.hora_inicio, '99:99')"
    );
    $st->execute(array_merge([$ate, $de], $params));
    $eventos = $st->fetchAll();
    $participantes = participantes_por_evento($PDO, array_map(fn($e) => (int) $e['id'], $eventos));
    responder(array_map(fn($e) => evento_para_front($e, $participantes), $eventos));
}

if ($rota === '/eventos' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();

    $titulo = campo_texto($d, 'titulo');
    if ($titulo === '') {
        erro('Informe o título do compromisso.');
    }
    $data = campo_data($d, 'data');
    if ($data === null) {
        erro('Informe a data (AAAA-MM-DD).');
    }
    $dataFim = campo_data($d, 'data_fim');
    if ($dataFim !== null && $dataFim < $data) {
        erro('A data final não pode ser antes da inicial.');
    }

    $tipo = campo_texto($d, 'tipo', 'reuniao');
    if (!in_array($tipo, TIPOS_EVENTO, true)) {
        $tipo = 'reuniao';
    }

    $diaInteiro = !empty($d['dia_inteiro']) ? 1 : 0;
    $hora = fn(string $c) => preg_match('/^\d{2}:\d{2}$/', campo_texto($d, $c)) ? campo_texto($d, $c) : null;
    $inicio = $diaInteiro ? null : $hora('hora_inicio');
    $fim = $diaInteiro ? null : $hora('hora_fim');
    if ($inicio && $fim && $fim < $inicio && $dataFim === null) {
        erro('O horário final não pode ser antes do inicial.');
    }

    // Sem setor informado, herda a diretoria de quem criou. Só gestor marca
    // compromisso da EJ inteira (setor nulo) ou de outra diretoria.
    $setor = campo_ou_nulo($d, 'setor');
    if (!e_gestor($m)) {
        $setor = $m['setor'] ?? null;
    }

    $projetoId = campo_int($d, 'projeto_id');
    if ($projetoId !== null) {
        projeto_visivel($PDO, $m, $projetoId); // não deixa amarrar a projeto alheio
    }

    $PDO->prepare('INSERT INTO eventos (titulo, descricao, tipo, local, data, data_fim, hora_inicio, hora_fim,
                                        dia_inteiro, setor, projeto_id, criado_por, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $titulo, campo_ou_nulo($d, 'descricao'), $tipo, campo_ou_nulo($d, 'local'),
            $data, $dataFim, $inicio, $fim, $diaInteiro, $setor, $projetoId,
            (int) $m['id'], agora(),
        ]);
    $id = (int) $PDO->lastInsertId();

    // Quem criou já vai; os demais entram como convidados.
    $ins = $PDO->prepare('INSERT INTO evento_participantes (evento_id, membro_id, situacao) VALUES (?, ?, ?)');
    $ins->execute([$id, (int) $m['id'], 'vai']);
    $convidados = [];
    foreach (campo_lista_int($d, 'participantes') as $membroId) {
        if ($membroId !== (int) $m['id']) {
            $ins->execute([$id, $membroId, 'convidado']);
            $convidados[] = $membroId;
        }
    }

    $quando = rtrim($data . ($inicio ? " às $inicio" : ' (dia todo)'));
    notificar_membros($PDO, $convidados, (int) $m['id'], 'convite',
        'Você foi convidado para um compromisso', "$titulo · $quando", '/agenda', $id);

    $st = $PDO->prepare('SELECT * FROM eventos WHERE id = ?');
    $st->execute([$id]);
    responder(evento_para_front($st->fetch(), participantes_por_evento($PDO, [$id])), 201);
}

// Confirmar ou recusar presença — cada pessoa responde pela própria.
if (preg_match('#^/eventos/(\d+)/presenca$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $e = evento_visivel($PDO, $m, (int) $mm[1]);
    $situacao = campo_texto(corpo_json(), 'situacao');
    if (!in_array($situacao, ['vai', 'nao_vai', 'convidado'], true)) {
        erro('Situação inválida.');
    }

    $ja = $PDO->prepare('SELECT 1 FROM evento_participantes WHERE evento_id = ? AND membro_id = ?');
    $ja->execute([(int) $e['id'], (int) $m['id']]);
    if ($ja->fetch()) {
        $PDO->prepare('UPDATE evento_participantes SET situacao = ? WHERE evento_id = ? AND membro_id = ?')
            ->execute([$situacao, (int) $e['id'], (int) $m['id']]);
    } else {
        // Quem enxerga o compromisso pode se autoconvidar.
        $PDO->prepare('INSERT INTO evento_participantes (evento_id, membro_id, situacao) VALUES (?, ?, ?)')
            ->execute([(int) $e['id'], (int) $m['id'], $situacao]);
    }
    responder(['ok' => true]);
}

if (preg_match('#^/eventos/(\d+)/participantes$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $e = evento_visivel($PDO, $m, (int) $mm[1]);
    if ((int) $e['criado_por'] !== (int) $m['id'] && !e_gestor($m)) {
        erro('Só quem criou o compromisso muda a lista de participantes.', 403);
    }

    $pedidos = campo_lista_int(corpo_json(), 'participantes');
    // Preserva quem já respondeu: refazer a lista não pode apagar um "não vou".
    $atuais = $PDO->prepare('SELECT membro_id, situacao FROM evento_participantes WHERE evento_id = ?');
    $atuais->execute([(int) $e['id']]);
    $antes = [];
    foreach ($atuais->fetchAll() as $l) {
        $antes[(int) $l['membro_id']] = $l['situacao'];
    }

    $PDO->prepare('DELETE FROM evento_participantes WHERE evento_id = ?')->execute([(int) $e['id']]);
    $ins = $PDO->prepare('INSERT INTO evento_participantes (evento_id, membro_id, situacao) VALUES (?, ?, ?)');
    foreach (array_unique(array_merge($pedidos, [(int) $e['criado_por']])) as $membroId) {
        $ins->execute([(int) $e['id'], $membroId, $antes[$membroId] ?? 'convidado']);
    }
    responder(['ok' => true]);
}

if (preg_match('#^/eventos/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $e = evento_visivel($PDO, $m, (int) $mm[1]);
    responder(evento_para_front($e, participantes_por_evento($PDO, [(int) $e['id']])));
}

if (preg_match('#^/eventos/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $e = evento_visivel($PDO, $m, (int) $mm[1]);
    if ((int) $e['criado_por'] !== (int) $m['id'] && !e_gestor($m)) {
        erro('Só quem criou o compromisso pode alterá-lo.', 403);
    }
    $d = corpo_json();

    $campos = [];
    $params = [];
    foreach (['titulo' => 'texto', 'descricao' => 'texto', 'local' => 'texto',
              'data' => 'data', 'data_fim' => 'data'] as $campo => $tipo) {
        if (!array_key_exists($campo, $d)) {
            continue;
        }
        $campos[] = "$campo = ?";
        $params[] = $tipo === 'data' ? campo_data($d, $campo) : campo_ou_nulo($d, $campo);
    }
    if (array_key_exists('tipo', $d)) {
        $t = campo_texto($d, 'tipo');
        $campos[] = 'tipo = ?';
        $params[] = in_array($t, TIPOS_EVENTO, true) ? $t : 'reuniao';
    }
    if (array_key_exists('dia_inteiro', $d)) {
        $campos[] = 'dia_inteiro = ?';
        $params[] = !empty($d['dia_inteiro']) ? 1 : 0;
    }
    foreach (['hora_inicio', 'hora_fim'] as $campo) {
        if (!array_key_exists($campo, $d)) {
            continue;
        }
        $v = campo_texto($d, $campo);
        $campos[] = "$campo = ?";
        $params[] = preg_match('/^\d{2}:\d{2}$/', $v) ? $v : null;
    }

    if (!$campos) {
        responder(['ok' => true]);
    }
    $params[] = (int) $e['id'];
    $PDO->prepare('UPDATE eventos SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute($params);

    $st = $PDO->prepare('SELECT * FROM eventos WHERE id = ?');
    $st->execute([(int) $e['id']]);
    responder(evento_para_front($st->fetch(), participantes_por_evento($PDO, [(int) $e['id']])));
}

if (preg_match('#^/eventos/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $e = evento_visivel($PDO, $m, (int) $mm[1]);
    if ((int) $e['criado_por'] !== (int) $m['id'] && !e_gestor($m)) {
        erro('Só quem criou o compromisso pode removê-lo.', 403);
    }
    $PDO->prepare('UPDATE eventos SET excluido_em = ? WHERE id = ?')->execute([agora(), (int) $e['id']]);
    http_response_code(204);
    exit;
}

// ============================ AGENDA COMBINADA ============================
// Compromissos e prazos de tarefa no mesmo intervalo. É o que responde
// "o que eu tenho pela frente" sem obrigar a pessoa a olhar duas telas.
if ($rota === '/agenda' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    [$de, $ate] = intervalo_pedido();
    $soMeus = ($_GET['meus'] ?? '') === '1';

    [$filtroE, $paramsE] = filtro_evento($m);
    $sqlEventos =
        "SELECT e.* FROM eventos e
         WHERE e.excluido_em IS NULL
           AND e.data <= ? AND COALESCE(e.data_fim, e.data) >= ?$filtroE";
    $paramsEventos = array_merge([$ate, $de], $paramsE);

    if ($soMeus) {
        // Só o que a pessoa foi convidada ou criou.
        $sqlEventos .= ' AND EXISTS (SELECT 1 FROM evento_participantes p
                                     WHERE p.evento_id = e.id AND p.membro_id = ?)';
        $paramsEventos[] = (int) $m['id'];
    }
    $sqlEventos .= " ORDER BY e.data, COALESCE(e.hora_inicio, '99:99')";

    $st = $PDO->prepare($sqlEventos);
    $st->execute($paramsEventos);
    $eventos = $st->fetchAll();
    $participantes = participantes_por_evento($PDO, array_map(fn($e) => (int) $e['id'], $eventos));

    // Prazos de tarefa no mesmo intervalo.
    [$filtroP, $paramsP] = filtro_setor($m, 'p.setor');
    $sqlTarefas =
        "SELECT t.id, t.titulo, t.prazo, t.prioridade, t.concluida_em, t.projeto_id,
                t.numero, p.codigo, p.nome AS projeto_nome
         FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
         LEFT JOIN projeto_status s ON s.id = t.status_id
         WHERE t.excluido_em IS NULL AND p.excluido_em IS NULL
           AND t.prazo IS NOT NULL AND t.prazo >= ? AND t.prazo <= ?$filtroP";
    $paramsTarefas = array_merge([$de, $ate], $paramsP);

    if ($soMeus) {
        $sqlTarefas .= ' AND EXISTS (SELECT 1 FROM tarefa_responsaveis tr
                                     WHERE tr.tarefa_id = t.id AND tr.membro_id = ?)';
        $paramsTarefas[] = (int) $m['id'];
    }
    $sqlTarefas .= ' ORDER BY t.prazo';

    $stT = $PDO->prepare($sqlTarefas);
    $stT->execute($paramsTarefas);

    responder([
        'eventos' => array_map(fn($e) => evento_para_front($e, $participantes), $eventos),
        'prazos' => array_map(fn($t) => [
            'id' => (int) $t['id'],
            'titulo' => $t['titulo'],
            'data' => $t['prazo'],
            'prioridade' => $t['prioridade'],
            'concluida' => $t['concluida_em'] !== null,
            'projeto_id' => (int) $t['projeto_id'],
            'projeto_nome' => $t['projeto_nome'],
            'codigo' => $t['codigo'] . '-' . $t['numero'],
        ], $stT->fetchAll()),
    ]);
}
