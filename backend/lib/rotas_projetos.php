<?php
// Rotas de Projetos e Tarefas. Incluído por index.php, que já definiu
// $rota, $metodo, $PDO e $CONFIG. As funções responder()/erro() encerram a
// requisição, então basta cair no bloco certo.

declare(strict_types=1);

require_once __DIR__ . '/erp_comum.php';

// Equipe: qualquer pessoa logada precisa disso para atribuir responsáveis.
// Diferente de /gestao/membros, devolve só o necessário e nenhum dado de acesso.
if ($rota === '/equipe' && $metodo === 'GET') {
    exigir_login($PDO, $CONFIG);
    $st = $PDO->query('SELECT id, nome, setor FROM membros WHERE ativo = 1 ORDER BY nome');
    responder(array_map(fn($m) => [
        'id' => (int) $m['id'], 'nome' => $m['nome'], 'setor' => $m['setor'],
    ], $st->fetchAll()));
}

// ============================ PROJETOS ============================

// Lista os projetos visíveis para quem está logado (escopo por diretoria).
if ($rota === '/projetos' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    [$filtro, $params] = filtro_setor($m, 'p.setor');

    $st = $PDO->prepare(
        "SELECT p.*, r.nome AS responsavel_nome
         FROM projetos p LEFT JOIN membros r ON r.id = p.responsavel_id
         WHERE p.excluido_em IS NULL$filtro
         ORDER BY CASE p.situacao WHEN 'ativo' THEN 0 WHEN 'pausado' THEN 1 ELSE 2 END, p.nome"
    );
    $st->execute($params);
    $projetos = $st->fetchAll();

    // Contagem de tarefas por projeto, em uma consulta só.
    $contagem = [];
    if ($projetos) {
        $ids = array_map(fn($p) => (int) $p['id'], $projetos);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $ct = $PDO->prepare(
            "SELECT t.projeto_id,
                    COUNT(*) AS total,
                    SUM(CASE WHEN s.categoria = 'concluido' THEN 1 ELSE 0 END) AS concluidas
             FROM tarefas t LEFT JOIN projeto_status s ON s.id = t.status_id
             WHERE t.excluido_em IS NULL AND t.projeto_id IN ($marcas)
             GROUP BY t.projeto_id"
        );
        $ct->execute($ids);
        foreach ($ct->fetchAll() as $l) {
            $contagem[(int) $l['projeto_id']] = [
                'total' => (int) $l['total'],
                'concluidas' => (int) $l['concluidas'],
            ];
        }
    }

    responder(array_map(fn($p) => [
        'id' => (int) $p['id'],
        'codigo' => $p['codigo'],
        'nome' => $p['nome'],
        'descricao' => $p['descricao'],
        'setor' => $p['setor'],
        'situacao' => $p['situacao'],
        'responsavel_id' => $p['responsavel_id'] !== null ? (int) $p['responsavel_id'] : null,
        'responsavel_nome' => $p['responsavel_nome'],
        'inicio' => $p['inicio'],
        'prazo' => $p['prazo'],
        'tarefas' => $contagem[(int) $p['id']] ?? ['total' => 0, 'concluidas' => 0],
    ], $projetos));
}

// Cria um projeto. A diretoria padrão é a de quem criou.
if ($rota === '/projetos' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();

    $nome = campo_texto($d, 'nome');
    if ($nome === '') {
        erro('Informe o nome do projeto.');
    }
    $setor = campo_texto($d, 'setor') ?: (string) ($m['setor'] ?? '');
    if ($setor === '') {
        erro('Defina a diretoria do projeto (seu cadastro não tem diretoria).');
    }
    // Membro só cria dentro da própria diretoria; gestor cria em qualquer uma.
    $visiveis = setores_visiveis($m);
    if ($visiveis !== null && !in_array($setor, $visiveis, true)) {
        erro('Você só pode criar projetos na sua diretoria.', 403);
    }

    $PDO->prepare('INSERT INTO projetos (codigo, nome, descricao, setor, situacao, responsavel_id, inicio, prazo, criado_por, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            gerar_codigo($PDO, $nome),
            $nome,
            campo_ou_nulo($d, 'descricao'),
            $setor,
            'ativo',
            campo_int($d, 'responsavel_id'),
            campo_data($d, 'inicio'),
            campo_data($d, 'prazo'),
            (int) $m['id'],
            agora(),
        ]);
    $id = (int) $PDO->lastInsertId();
    semear_status($PDO, $id);

    $st = $PDO->prepare('SELECT * FROM projetos WHERE id = ?');
    $st->execute([$id]);
    $p = $st->fetch();
    responder(['id' => $id, 'codigo' => $p['codigo'], 'nome' => $p['nome'], 'setor' => $p['setor']], 201);
}

// ---- Tarefas de um projeto (antes da rota /projetos/{id}) ----
if (preg_match('#^/projetos/(\d+)/tarefas$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $projeto = projeto_visivel($PDO, $m, (int) $mm[1]);

    $st = $PDO->prepare('SELECT * FROM tarefas WHERE projeto_id = ? AND excluido_em IS NULL
                         ORDER BY ordem, id');
    $st->execute([(int) $projeto['id']]);
    $tarefas = $st->fetchAll();
    $ids = array_map(fn($t) => (int) $t['id'], $tarefas);

    $resp = responsaveis_por_tarefa($PDO, $ids);
    $etiq = etiquetas_por_tarefa($PDO, $ids);
    $chk = checklist_resumo($PDO, $ids);

    responder(array_map(fn($t) => tarefa_para_front($t, $resp, $etiq, $chk), $tarefas));
}

if (preg_match('#^/projetos/(\d+)/tarefas$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $projeto = projeto_visivel($PDO, $m, (int) $mm[1]);
    $d = corpo_json();

    $titulo = campo_texto($d, 'titulo');
    if ($titulo === '') {
        erro('Informe o título da tarefa.');
    }

    // Status inicial: o informado, ou o primeiro da coluna 'aberto'.
    $statusId = campo_int($d, 'status_id');
    if ($statusId === null) {
        $s = $PDO->prepare('SELECT id FROM projeto_status WHERE projeto_id = ? ORDER BY ordem LIMIT 1');
        $s->execute([(int) $projeto['id']]);
        $linha = $s->fetch();
        $statusId = $linha ? (int) $linha['id'] : null;
    }

    $PDO->prepare('INSERT INTO tarefas (projeto_id, tarefa_pai_id, numero, titulo, descricao, status_id,
                                        prioridade, data_inicio, prazo, estimativa_min, recorrencia, ordem, criado_por, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            (int) $projeto['id'],
            campo_int($d, 'tarefa_pai_id'),
            proximo_numero($PDO, (int) $projeto['id']),
            $titulo,
            campo_ou_nulo($d, 'descricao'),
            $statusId,
            campo_texto($d, 'prioridade', 'media') ?: 'media',
            campo_data($d, 'data_inicio'),
            campo_data($d, 'prazo'),
            campo_int($d, 'estimativa_min'),
            campo_ou_nulo($d, 'recorrencia'),
            campo_int($d, 'ordem', 0),
            (int) $m['id'],
            agora(),
        ]);
    $id = (int) $PDO->lastInsertId();

    foreach (campo_lista_int($d, 'responsaveis') as $membroId) {
        $PDO->prepare('INSERT INTO tarefa_responsaveis (tarefa_id, membro_id) VALUES (?, ?)')
            ->execute([$id, $membroId]);
    }
    registrar_historico($PDO, $id, (int) $m['id'], 'criou');

    $st = $PDO->prepare('SELECT * FROM tarefas WHERE id = ?');
    $st->execute([$id]);
    $resp = responsaveis_por_tarefa($PDO, [$id]);
    responder(tarefa_para_front($st->fetch(), $resp), 201);
}

// ---- Status configuráveis ----
if (preg_match('#^/projetos/(\d+)/status$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $projeto = projeto_visivel($PDO, $m, (int) $mm[1]);
    $d = corpo_json();

    $nome = campo_texto($d, 'nome');
    if ($nome === '') {
        erro('Informe o nome do status.');
    }
    $categoria = campo_texto($d, 'categoria', 'aberto');
    if (!in_array($categoria, ['aberto', 'andamento', 'concluido', 'cancelado'], true)) {
        $categoria = 'aberto';
    }
    $ord = $PDO->prepare('SELECT COALESCE(MAX(ordem), -1) + 1 AS n FROM projeto_status WHERE projeto_id = ?');
    $ord->execute([(int) $projeto['id']]);

    $PDO->prepare('INSERT INTO projeto_status (projeto_id, nome, categoria, cor, ordem) VALUES (?, ?, ?, ?, ?)')
        ->execute([
            (int) $projeto['id'], $nome, $categoria,
            campo_texto($d, 'cor', '#607086') ?: '#607086',
            (int) $ord->fetch()['n'],
        ]);
    responder(['ok' => true], 201);
}

if (preg_match('#^/status/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM projeto_status WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $status = $st->fetch();
    if (!$status) {
        erro('Status não encontrado', 404);
    }
    projeto_visivel($PDO, $m, (int) $status['projeto_id']);

    // Não deixa a coluna sumir levando tarefas junto: elas voltam para a primeira.
    $primeiro = $PDO->prepare('SELECT id FROM projeto_status WHERE projeto_id = ? AND id <> ? ORDER BY ordem LIMIT 1');
    $primeiro->execute([(int) $status['projeto_id'], (int) $status['id']]);
    $destino = $primeiro->fetch();
    if (!$destino) {
        erro('O projeto precisa de pelo menos um status.');
    }
    $PDO->prepare('UPDATE tarefas SET status_id = ? WHERE status_id = ?')
        ->execute([(int) $destino['id'], (int) $status['id']]);
    $PDO->prepare('DELETE FROM projeto_status WHERE id = ?')->execute([(int) $status['id']]);
    responder(['ok' => true]);
}

// ---- Etiquetas do projeto ----
if (preg_match('#^/projetos/(\d+)/etiquetas$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $projeto = projeto_visivel($PDO, $m, (int) $mm[1]);
    $nome = campo_texto(corpo_json(), 'nome');
    if ($nome === '') {
        erro('Informe o nome da etiqueta.');
    }
    $PDO->prepare('INSERT INTO etiquetas (projeto_id, nome, cor) VALUES (?, ?, ?)')
        ->execute([(int) $projeto['id'], $nome, campo_texto(corpo_json(), 'cor', '#1565c0') ?: '#1565c0']);
    responder(['id' => (int) $PDO->lastInsertId(), 'nome' => $nome], 201);
}

// ---- Marcos ----
if (preg_match('#^/projetos/(\d+)/marcos$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $projeto = projeto_visivel($PDO, $m, (int) $mm[1]);
    $d = corpo_json();
    $nome = campo_texto($d, 'nome');
    if ($nome === '') {
        erro('Informe o nome do marco.');
    }
    $ord = $PDO->prepare('SELECT COALESCE(MAX(ordem), -1) + 1 AS n FROM marcos WHERE projeto_id = ?');
    $ord->execute([(int) $projeto['id']]);
    $PDO->prepare('INSERT INTO marcos (projeto_id, nome, data, concluido, ordem) VALUES (?, ?, ?, 0, ?)')
        ->execute([(int) $projeto['id'], $nome, campo_data($d, 'data'), (int) $ord->fetch()['n']]);
    responder(['ok' => true], 201);
}

if (preg_match('#^/marcos/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM marcos WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $marco = $st->fetch();
    if (!$marco) {
        erro('Marco não encontrado', 404);
    }
    projeto_visivel($PDO, $m, (int) $marco['projeto_id']);
    $PDO->prepare('UPDATE marcos SET concluido = ? WHERE id = ?')
        ->execute([!empty(corpo_json()['concluido']) ? 1 : 0, (int) $marco['id']]);
    responder(['ok' => true]);
}

if (preg_match('#^/marcos/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM marcos WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $marco = $st->fetch();
    if (!$marco) {
        erro('Marco não encontrado', 404);
    }
    projeto_visivel($PDO, $m, (int) $marco['projeto_id']);
    $PDO->prepare('DELETE FROM marcos WHERE id = ?')->execute([(int) $marco['id']]);
    http_response_code(204);
    exit;
}

// ---- Detalhe do projeto (depois das sub-rotas) ----
if (preg_match('#^/projetos/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $p = projeto_visivel($PDO, $m, (int) $mm[1]);
    $id = (int) $p['id'];

    $status = $PDO->prepare('SELECT id, nome, categoria, cor, ordem FROM projeto_status WHERE projeto_id = ? ORDER BY ordem');
    $status->execute([$id]);

    $etiquetas = $PDO->prepare('SELECT id, nome, cor FROM etiquetas WHERE projeto_id = ? ORDER BY nome');
    $etiquetas->execute([$id]);

    $marcos = $PDO->prepare('SELECT id, nome, data, concluido FROM marcos WHERE projeto_id = ? ORDER BY ordem, data');
    $marcos->execute([$id]);

    // Horas lançadas nas tarefas deste projeto — a ponte com o Painel de Horas.
    $horas = $PDO->prepare('SELECT COALESCE(SUM(r.minutos), 0) AS total FROM registros r
                            JOIN tarefas t ON t.id = r.tarefa_id WHERE t.projeto_id = ?');
    $horas->execute([$id]);

    responder([
        'id' => $id,
        'codigo' => $p['codigo'],
        'nome' => $p['nome'],
        'descricao' => $p['descricao'],
        'setor' => $p['setor'],
        'situacao' => $p['situacao'],
        'responsavel_id' => $p['responsavel_id'] !== null ? (int) $p['responsavel_id'] : null,
        'inicio' => $p['inicio'],
        'prazo' => $p['prazo'],
        'minutos_lancados' => (int) $horas->fetch()['total'],
        'status' => array_map(fn($s) => [
            'id' => (int) $s['id'], 'nome' => $s['nome'], 'categoria' => $s['categoria'],
            'cor' => $s['cor'], 'ordem' => (int) $s['ordem'],
        ], $status->fetchAll()),
        'etiquetas' => array_map(fn($e) => [
            'id' => (int) $e['id'], 'nome' => $e['nome'], 'cor' => $e['cor'],
        ], $etiquetas->fetchAll()),
        'marcos' => array_map(fn($x) => [
            'id' => (int) $x['id'], 'nome' => $x['nome'], 'data' => $x['data'],
            'concluido' => (bool) (int) $x['concluido'],
        ], $marcos->fetchAll()),
    ]);
}

if (preg_match('#^/projetos/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $p = projeto_visivel($PDO, $m, (int) $mm[1]);
    $d = corpo_json();

    $campos = [];
    $params = [];
    foreach (['nome' => 'texto', 'descricao' => 'texto', 'situacao' => 'texto',
              'inicio' => 'data', 'prazo' => 'data', 'responsavel_id' => 'int'] as $campo => $tipo) {
        if (!array_key_exists($campo, $d)) {
            continue;
        }
        $campos[] = "$campo = ?";
        $params[] = $tipo === 'data' ? campo_data($d, $campo)
            : ($tipo === 'int' ? campo_int($d, $campo) : campo_ou_nulo($d, $campo));
    }
    if (!$campos) {
        responder(['ok' => true]);
    }
    $campos[] = 'atualizado_em = ?';
    $params[] = agora();
    $params[] = (int) $p['id'];
    $PDO->prepare('UPDATE projetos SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute($params);
    responder(['ok' => true]);
}

if (preg_match('#^/projetos/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $p = projeto_visivel($PDO, $m, (int) $mm[1]);
    // Soft delete: alguém vai apagar o projeto errado na primeira semana.
    $PDO->prepare('UPDATE projetos SET excluido_em = ? WHERE id = ?')->execute([agora(), (int) $p['id']]);
    http_response_code(204);
    exit;
}

// ============================ TAREFAS ============================

// "Minhas tarefas" — atalho que é ~80% do valor de um gerenciador.
if ($rota === '/minhas-tarefas' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare(
        "SELECT t.*, p.nome AS projeto_nome, p.codigo AS projeto_codigo, s.nome AS status_nome, s.categoria
         FROM tarefas t
         JOIN tarefa_responsaveis tr ON tr.tarefa_id = t.id
         JOIN projetos p ON p.id = t.projeto_id
         LEFT JOIN projeto_status s ON s.id = t.status_id
         WHERE tr.membro_id = ? AND t.excluido_em IS NULL AND p.excluido_em IS NULL
           AND (s.categoria IS NULL OR s.categoria NOT IN ('concluido', 'cancelado'))
         ORDER BY CASE WHEN t.prazo IS NULL THEN 1 ELSE 0 END, t.prazo, t.id"
    );
    $st->execute([(int) $m['id']]);
    responder(array_map(fn($t) => [
        'id' => (int) $t['id'],
        'projeto_id' => (int) $t['projeto_id'],
        'projeto_nome' => $t['projeto_nome'],
        'codigo' => $t['projeto_codigo'] . '-' . $t['numero'],
        'titulo' => $t['titulo'],
        'prioridade' => $t['prioridade'],
        'prazo' => $t['prazo'],
        'status_nome' => $t['status_nome'],
    ], $st->fetchAll()));
}

// Detalhe completo de uma tarefa.
if (preg_match('#^/tarefas/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $t = tarefa_visivel($PDO, $m, (int) $mm[1]);
    $id = (int) $t['id'];

    $chk = $PDO->prepare('SELECT id, texto, feito, ordem FROM tarefa_checklist WHERE tarefa_id = ? ORDER BY ordem, id');
    $chk->execute([$id]);

    $deps = $PDO->prepare('SELECT d.depende_de_id AS id, t.titulo, t.numero, p.codigo
                           FROM tarefa_dependencias d
                           JOIN tarefas t ON t.id = d.depende_de_id
                           JOIN projetos p ON p.id = t.projeto_id
                           WHERE d.tarefa_id = ?');
    $deps->execute([$id]);

    $subs = $PDO->prepare('SELECT id, titulo, status_id, concluida_em FROM tarefas
                           WHERE tarefa_pai_id = ? AND excluido_em IS NULL ORDER BY ordem, id');
    $subs->execute([$id]);

    $docs = $PDO->prepare('SELECT d.id, d.titulo, d.icone FROM documento_tarefas dt
                           JOIN documentos d ON d.id = dt.documento_id
                           WHERE dt.tarefa_id = ? AND d.excluido_em IS NULL');
    $docs->execute([$id]);

    $horas = $PDO->prepare('SELECT COALESCE(SUM(minutos), 0) AS total FROM registros WHERE tarefa_id = ?');
    $horas->execute([$id]);

    $resp = responsaveis_por_tarefa($PDO, [$id]);
    $etiq = etiquetas_por_tarefa($PDO, [$id]);
    $base = tarefa_para_front($t, $resp, $etiq);

    responder($base + [
        'itens_checklist' => array_map(fn($c) => [
            'id' => (int) $c['id'], 'texto' => $c['texto'], 'feito' => (bool) (int) $c['feito'],
        ], $chk->fetchAll()),
        'dependencias' => array_map(fn($x) => [
            'id' => (int) $x['id'], 'titulo' => $x['titulo'],
            'codigo' => $x['codigo'] . '-' . $x['numero'],
        ], $deps->fetchAll()),
        'subtarefas' => array_map(fn($s) => [
            'id' => (int) $s['id'], 'titulo' => $s['titulo'],
            'status_id' => $s['status_id'] !== null ? (int) $s['status_id'] : null,
            'concluida_em' => $s['concluida_em'],
        ], $subs->fetchAll()),
        'documentos' => array_map(fn($x) => [
            'id' => (int) $x['id'], 'titulo' => $x['titulo'], 'icone' => $x['icone'],
        ], $docs->fetchAll()),
        'minutos_lancados' => (int) $horas->fetch()['total'],
    ]);
}

// Atualização parcial: só o que veio no corpo, com histórico do que mudou.
if (preg_match('#^/tarefas/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $t = tarefa_visivel($PDO, $m, (int) $mm[1]);
    $id = (int) $t['id'];
    $d = corpo_json();

    $campos = [];
    $params = [];
    $mudancas = [];

    $simples = [
        'titulo' => 'texto', 'descricao' => 'texto', 'prioridade' => 'texto',
        'data_inicio' => 'data', 'prazo' => 'data', 'estimativa_min' => 'int',
        'status_id' => 'int', 'ordem' => 'int', 'tarefa_pai_id' => 'int',
        'recorrencia' => 'texto',
    ];
    foreach ($simples as $campo => $tipo) {
        if (!array_key_exists($campo, $d)) {
            continue;
        }
        $novo = $tipo === 'data' ? campo_data($d, $campo)
            : ($tipo === 'int' ? campo_int($d, $campo) : campo_ou_nulo($d, $campo));
        if ((string) $novo === (string) $t[$campo]) {
            continue;
        }
        $campos[] = "$campo = ?";
        $params[] = $novo;
        $mudancas[] = [$campo, $t[$campo], $novo];
    }

    // Concluir/reabrir conforme a categoria do status escolhido.
    if (array_key_exists('status_id', $d)) {
        $novoStatus = campo_int($d, 'status_id');
        $cat = null;
        if ($novoStatus !== null) {
            $s = $PDO->prepare('SELECT categoria FROM projeto_status WHERE id = ?');
            $s->execute([$novoStatus]);
            $linha = $s->fetch();
            $cat = $linha ? $linha['categoria'] : null;
        }
        $campos[] = 'concluida_em = ?';
        $params[] = $cat === 'concluido' ? agora() : null;
    }

    if ($campos) {
        $campos[] = 'atualizado_em = ?';
        $params[] = agora();
        $params[] = $id;
        $PDO->prepare('UPDATE tarefas SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute($params);
        foreach ($mudancas as [$campo, $de, $para]) {
            registrar_historico($PDO, $id, (int) $m['id'], 'alterou', $campo, $de, $para);
        }
    }

    // Coleções N:N: só mexe se vieram no corpo.
    if (array_key_exists('responsaveis', $d)) {
        $novos = campo_lista_int($d, 'responsaveis');
        $PDO->prepare('DELETE FROM tarefa_responsaveis WHERE tarefa_id = ?')->execute([$id]);
        $ins = $PDO->prepare('INSERT INTO tarefa_responsaveis (tarefa_id, membro_id) VALUES (?, ?)');
        foreach ($novos as $membroId) {
            $ins->execute([$id, $membroId]);
        }
        registrar_historico($PDO, $id, (int) $m['id'], 'alterou', 'responsaveis', null, implode(',', $novos));
    }
    if (array_key_exists('etiquetas', $d)) {
        $PDO->prepare('DELETE FROM tarefa_etiquetas WHERE tarefa_id = ?')->execute([$id]);
        $ins = $PDO->prepare('INSERT INTO tarefa_etiquetas (tarefa_id, etiqueta_id) VALUES (?, ?)');
        foreach (campo_lista_int($d, 'etiquetas') as $etiquetaId) {
            $ins->execute([$id, $etiquetaId]);
        }
    }
    if (array_key_exists('dependencias', $d)) {
        $PDO->prepare('DELETE FROM tarefa_dependencias WHERE tarefa_id = ?')->execute([$id]);
        $ins = $PDO->prepare('INSERT INTO tarefa_dependencias (tarefa_id, depende_de_id) VALUES (?, ?)');
        foreach (campo_lista_int($d, 'dependencias') as $outra) {
            if ($outra === $id) {
                continue; // uma tarefa não depende de si mesma
            }
            $ins->execute([$id, $outra]);
        }
    }

    responder(['ok' => true]);
}

if (preg_match('#^/tarefas/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $t = tarefa_visivel($PDO, $m, (int) $mm[1]);
    $PDO->prepare('UPDATE tarefas SET excluido_em = ? WHERE id = ? OR tarefa_pai_id = ?')
        ->execute([agora(), (int) $t['id'], (int) $t['id']]);
    http_response_code(204);
    exit;
}

// ---- Checklist ----
if (preg_match('#^/tarefas/(\d+)/checklist$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $t = tarefa_visivel($PDO, $m, (int) $mm[1]);
    $texto = campo_texto(corpo_json(), 'texto');
    if ($texto === '') {
        erro('Informe o texto do item.');
    }
    $ord = $PDO->prepare('SELECT COALESCE(MAX(ordem), -1) + 1 AS n FROM tarefa_checklist WHERE tarefa_id = ?');
    $ord->execute([(int) $t['id']]);
    $PDO->prepare('INSERT INTO tarefa_checklist (tarefa_id, texto, feito, ordem) VALUES (?, ?, 0, ?)')
        ->execute([(int) $t['id'], $texto, (int) $ord->fetch()['n']]);
    responder(['id' => (int) $PDO->lastInsertId(), 'texto' => $texto, 'feito' => false], 201);
}

if (preg_match('#^/checklist/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM tarefa_checklist WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $item = $st->fetch();
    if (!$item) {
        erro('Item não encontrado', 404);
    }
    tarefa_visivel($PDO, $m, (int) $item['tarefa_id']);
    $PDO->prepare('UPDATE tarefa_checklist SET feito = ? WHERE id = ?')
        ->execute([!empty(corpo_json()['feito']) ? 1 : 0, (int) $item['id']]);
    responder(['ok' => true]);
}

if (preg_match('#^/checklist/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM tarefa_checklist WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $item = $st->fetch();
    if (!$item) {
        erro('Item não encontrado', 404);
    }
    tarefa_visivel($PDO, $m, (int) $item['tarefa_id']);
    $PDO->prepare('DELETE FROM tarefa_checklist WHERE id = ?')->execute([(int) $item['id']]);
    http_response_code(204);
    exit;
}

// ---- Histórico de alterações ----
if (preg_match('#^/tarefas/(\d+)/historico$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $t = tarefa_visivel($PDO, $m, (int) $mm[1]);
    $st = $PDO->prepare('SELECT h.*, m.nome AS membro_nome FROM tarefa_historico h
                         LEFT JOIN membros m ON m.id = h.membro_id
                         WHERE h.tarefa_id = ? ORDER BY h.id DESC LIMIT 100');
    $st->execute([(int) $t['id']]);
    responder(array_map(fn($h) => [
        'id' => (int) $h['id'],
        'membro_nome' => $h['membro_nome'],
        'acao' => $h['acao'],
        'campo' => $h['campo'],
        'de' => $h['de'],
        'para' => $h['para'],
        'criado_em' => $h['criado_em'],
    ], $st->fetchAll()));
}
