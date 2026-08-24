<?php
// Rotas de Documentação, comentários, busca global, OKRs e painel.
// Incluído por index.php, que já definiu $rota, $metodo, $PDO e $CONFIG.

declare(strict_types=1);

require_once __DIR__ . '/erp_comum.php';

// Documento com setor NULL é institucional: todo mundo enxerga.
// Com setor preenchido, vale o escopo por diretoria.
function filtro_doc(array $membro): array
{
    $setores = setores_visiveis($membro);
    if ($setores === null) {
        return ['', []];
    }
    if ($setores === []) {
        return [' AND setor IS NULL', []];
    }
    $marcas = implode(',', array_fill(0, count($setores), '?'));
    return [" AND (setor IS NULL OR setor IN ($marcas))", $setores];
}

function documento_visivel(PDO $pdo, array $membro, int $id): array
{
    $st = $pdo->prepare('SELECT * FROM documentos WHERE id = ? AND excluido_em IS NULL');
    $st->execute([$id]);
    $d = $st->fetch();
    if (!$d) {
        erro('Documento não encontrado', 404);
    }
    $setores = setores_visiveis($membro);
    if ($setores !== null && $d['setor'] !== null && !in_array($d['setor'], $setores, true)) {
        erro('Documento não encontrado', 404);
    }
    return $d;
}

// ============================ DOCUMENTAÇÃO ============================

// Árvore inteira (sem o conteúdo, que pode ser grande). O front monta a hierarquia.
if ($rota === '/documentos' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    [$filtro, $params] = filtro_doc($m);
    $st = $PDO->prepare("SELECT id, pai_id, setor, projeto_id, titulo, icone, ordem, atualizado_em
                         FROM documentos WHERE excluido_em IS NULL$filtro
                         ORDER BY ordem, titulo");
    $st->execute($params);
    responder(array_map(fn($d) => [
        'id' => (int) $d['id'],
        'pai_id' => $d['pai_id'] !== null ? (int) $d['pai_id'] : null,
        'setor' => $d['setor'],
        'projeto_id' => $d['projeto_id'] !== null ? (int) $d['projeto_id'] : null,
        'titulo' => $d['titulo'],
        'icone' => $d['icone'],
        'ordem' => (int) $d['ordem'],
        'atualizado_em' => $d['atualizado_em'],
    ], $st->fetchAll()));
}

if ($rota === '/documentos' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();
    $titulo = campo_texto($d, 'titulo');
    if ($titulo === '') {
        erro('Informe o título da página.');
    }

    // Herda a diretoria do pai; sem pai, usa a informada (ou institucional).
    $paiId = campo_int($d, 'pai_id');
    $setor = campo_ou_nulo($d, 'setor');
    if ($paiId !== null) {
        $pai = documento_visivel($PDO, $m, $paiId);
        $setor = $pai['setor'];
    }

    $ord = $PDO->prepare('SELECT COALESCE(MAX(ordem), -1) + 1 AS n FROM documentos WHERE '
        . ($paiId === null ? 'pai_id IS NULL' : 'pai_id = ?'));
    $ord->execute($paiId === null ? [] : [$paiId]);

    $PDO->prepare('INSERT INTO documentos (pai_id, setor, projeto_id, titulo, icone, conteudo, formato, ordem, criado_por, criado_em, atualizado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $paiId, $setor, campo_int($d, 'projeto_id'), $titulo,
            campo_ou_nulo($d, 'icone'), campo_texto($d, 'conteudo'), 'md',
            (int) $ord->fetch()['n'], (int) $m['id'], agora(), agora(),
        ]);
    responder(['id' => (int) $PDO->lastInsertId(), 'titulo' => $titulo], 201);
}

if (preg_match('#^/documentos/(\d+)/versoes$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $doc = documento_visivel($PDO, $m, (int) $mm[1]);
    $st = $PDO->prepare('SELECT v.id, v.titulo, v.criado_em, mb.nome AS membro_nome
                         FROM documento_versoes v LEFT JOIN membros mb ON mb.id = v.membro_id
                         WHERE v.documento_id = ? ORDER BY v.id DESC LIMIT 50');
    $st->execute([(int) $doc['id']]);
    responder(array_map(fn($v) => [
        'id' => (int) $v['id'], 'titulo' => $v['titulo'],
        'criado_em' => $v['criado_em'], 'membro_nome' => $v['membro_nome'],
    ], $st->fetchAll()));
}

// Conteúdo de uma versão, para comparar com a atual.
if (preg_match('#^/versoes/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM documento_versoes WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $v = $st->fetch();
    if (!$v) {
        erro('Versão não encontrada', 404);
    }
    documento_visivel($PDO, $m, (int) $v['documento_id']);
    responder([
        'id' => (int) $v['id'], 'documento_id' => (int) $v['documento_id'],
        'titulo' => $v['titulo'], 'conteudo' => $v['conteudo'], 'criado_em' => $v['criado_em'],
    ]);
}

// Liga/desliga documentação de tarefas — o diferencial pedido.
if (preg_match('#^/documentos/(\d+)/tarefas$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $doc = documento_visivel($PDO, $m, (int) $mm[1]);
    $PDO->prepare('DELETE FROM documento_tarefas WHERE documento_id = ?')->execute([(int) $doc['id']]);
    $ins = $PDO->prepare('INSERT INTO documento_tarefas (documento_id, tarefa_id) VALUES (?, ?)');
    foreach (campo_lista_int(corpo_json(), 'tarefas') as $tarefaId) {
        tarefa_visivel($PDO, $m, $tarefaId); // não deixa ligar a tarefa fora do escopo
        $ins->execute([(int) $doc['id'], $tarefaId]);
    }
    responder(['ok' => true]);
}

if (preg_match('#^/documentos/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $d = documento_visivel($PDO, $m, (int) $mm[1]);

    $tarefas = $PDO->prepare('SELECT t.id, t.titulo, t.numero, p.codigo FROM documento_tarefas dt
                              JOIN tarefas t ON t.id = dt.tarefa_id
                              JOIN projetos p ON p.id = t.projeto_id
                              WHERE dt.documento_id = ? AND t.excluido_em IS NULL');
    $tarefas->execute([(int) $d['id']]);

    $versoes = $PDO->prepare('SELECT COUNT(*) AS n FROM documento_versoes WHERE documento_id = ?');
    $versoes->execute([(int) $d['id']]);

    responder([
        'id' => (int) $d['id'],
        'pai_id' => $d['pai_id'] !== null ? (int) $d['pai_id'] : null,
        'setor' => $d['setor'],
        'projeto_id' => $d['projeto_id'] !== null ? (int) $d['projeto_id'] : null,
        'titulo' => $d['titulo'],
        'icone' => $d['icone'],
        'conteudo' => $d['conteudo'],
        'formato' => $d['formato'],
        'atualizado_em' => $d['atualizado_em'],
        'total_versoes' => (int) $versoes->fetch()['n'],
        'tarefas' => array_map(fn($t) => [
            'id' => (int) $t['id'], 'titulo' => $t['titulo'],
            'codigo' => $t['codigo'] . '-' . $t['numero'],
        ], $tarefas->fetchAll()),
    ]);
}

// Salvar guarda a versão ANTERIOR — é isso que torna o histórico possível.
if (preg_match('#^/documentos/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $doc = documento_visivel($PDO, $m, (int) $mm[1]);
    $d = corpo_json();

    $titulo = array_key_exists('titulo', $d) ? campo_texto($d, 'titulo') : $doc['titulo'];
    if ($titulo === '') {
        erro('O título não pode ficar vazio.');
    }
    $conteudo = array_key_exists('conteudo', $d) ? campo_texto($d, 'conteudo') : (string) $doc['conteudo'];
    $mudou = $titulo !== $doc['titulo'] || $conteudo !== (string) $doc['conteudo'];

    if ($mudou) {
        $PDO->prepare('INSERT INTO documento_versoes (documento_id, titulo, conteudo, membro_id, criado_em)
                       VALUES (?, ?, ?, ?, ?)')
            ->execute([(int) $doc['id'], $doc['titulo'], $doc['conteudo'], (int) $m['id'], agora()]);
    }

    $PDO->prepare('UPDATE documentos SET titulo = ?, conteudo = ?, icone = ?, atualizado_em = ? WHERE id = ?')
        ->execute([
            $titulo, $conteudo,
            array_key_exists('icone', $d) ? campo_ou_nulo($d, 'icone') : $doc['icone'],
            agora(), (int) $doc['id'],
        ]);
    responder(['ok' => true, 'versao_criada' => $mudou]);
}

if (preg_match('#^/documentos/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $doc = documento_visivel($PDO, $m, (int) $mm[1]);
    // Apaga a página e as filhas (a árvore da EJ é rasa; dois níveis bastam).
    $PDO->prepare('UPDATE documentos SET excluido_em = ? WHERE id = ? OR pai_id = ?')
        ->execute([agora(), (int) $doc['id'], (int) $doc['id']]);
    http_response_code(204);
    exit;
}

// ============================ COMENTÁRIOS ============================

if (preg_match('#^/comentarios/(tarefa|documento)/(\d+)$#', $rota, $mm) && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $tipo = $mm[1];
    $alvo = (int) $mm[2];
    $tipo === 'tarefa' ? tarefa_visivel($PDO, $m, $alvo) : documento_visivel($PDO, $m, $alvo);

    $st = $PDO->prepare('SELECT c.*, mb.nome AS membro_nome FROM comentarios c
                         JOIN membros mb ON mb.id = c.membro_id
                         WHERE c.alvo_tipo = ? AND c.alvo_id = ? AND c.excluido_em IS NULL
                         ORDER BY c.id');
    $st->execute([$tipo, $alvo]);
    responder(array_map(fn($c) => [
        'id' => (int) $c['id'],
        'membro_id' => (int) $c['membro_id'],
        'membro_nome' => $c['membro_nome'],
        'texto' => $c['texto'],
        'criado_em' => $c['criado_em'],
    ], $st->fetchAll()));
}

if (preg_match('#^/comentarios/(tarefa|documento)/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $tipo = $mm[1];
    $alvo = (int) $mm[2];
    $tipo === 'tarefa' ? tarefa_visivel($PDO, $m, $alvo) : documento_visivel($PDO, $m, $alvo);

    $texto = campo_texto(corpo_json(), 'texto');
    if ($texto === '') {
        erro('Escreva alguma coisa.');
    }
    $PDO->prepare('INSERT INTO comentarios (alvo_tipo, alvo_id, membro_id, texto, criado_em) VALUES (?, ?, ?, ?, ?)')
        ->execute([$tipo, $alvo, (int) $m['id'], $texto, agora()]);
    // Lê o id ANTES de qualquer outro INSERT: registrar_historico() grava numa
    // segunda tabela e passaria a ser o "último id inserido".
    $id = (int) $PDO->lastInsertId();

    if ($tipo === 'tarefa') {
        registrar_historico($PDO, $alvo, (int) $m['id'], 'comentou');
    }
    responder(['id' => $id], 201);
}

if (preg_match('#^/comentarios/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM comentarios WHERE id = ?');
    $st->execute([(int) $mm[1]]);
    $c = $st->fetch();
    if (!$c) {
        erro('Comentário não encontrado', 404);
    }
    // Só o autor apaga o próprio comentário; gestor apaga qualquer um.
    if ((int) $c['membro_id'] !== (int) $m['id'] && !e_gestor($m)) {
        erro('Você só pode apagar os próprios comentários.', 403);
    }
    $PDO->prepare('UPDATE comentarios SET excluido_em = ? WHERE id = ?')->execute([agora(), (int) $c['id']]);
    http_response_code(204);
    exit;
}

// ============================ BUSCA GLOBAL ============================

if ($rota === '/busca' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $q = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
    if (mb_strlen($q) < 3) {
        responder(['projetos' => [], 'tarefas' => [], 'documentos' => []]);
    }
    $like = '%' . $q . '%';

    [$fProj, $pProj] = filtro_setor($m, 'p.setor');
    $proj = $PDO->prepare("SELECT p.id, p.codigo, p.nome, p.setor FROM projetos p
                           WHERE p.excluido_em IS NULL AND (p.nome LIKE ? OR p.descricao LIKE ?)$fProj
                           LIMIT 20");
    $proj->execute(array_merge([$like, $like], $pProj));

    [$fTar, $pTar] = filtro_setor($m, 'p.setor');
    $tar = $PDO->prepare("SELECT t.id, t.titulo, t.numero, t.projeto_id, p.codigo, p.nome AS projeto_nome
                          FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
                          WHERE t.excluido_em IS NULL AND p.excluido_em IS NULL
                            AND (t.titulo LIKE ? OR t.descricao LIKE ?)$fTar
                          LIMIT 30");
    $tar->execute(array_merge([$like, $like], $pTar));

    [$fDoc, $pDoc] = filtro_doc($m);
    $doc = $PDO->prepare("SELECT id, titulo, icone, setor FROM documentos
                          WHERE excluido_em IS NULL AND (titulo LIKE ? OR conteudo LIKE ?)$fDoc
                          LIMIT 30");
    $doc->execute(array_merge([$like, $like], $pDoc));

    responder([
        'projetos' => array_map(fn($p) => [
            'id' => (int) $p['id'], 'codigo' => $p['codigo'], 'nome' => $p['nome'], 'setor' => $p['setor'],
        ], $proj->fetchAll()),
        'tarefas' => array_map(fn($t) => [
            'id' => (int) $t['id'], 'titulo' => $t['titulo'],
            'projeto_id' => (int) $t['projeto_id'],
            'codigo' => $t['codigo'] . '-' . $t['numero'], 'projeto_nome' => $t['projeto_nome'],
        ], $tar->fetchAll()),
        'documentos' => array_map(fn($d) => [
            'id' => (int) $d['id'], 'titulo' => $d['titulo'], 'icone' => $d['icone'], 'setor' => $d['setor'],
        ], $doc->fetchAll()),
    ]);
}

// ============================ OKRs ============================

if ($rota === '/objetivos' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $setores = setores_visiveis($m);
    if ($setores === null) {
        $st = $PDO->query('SELECT * FROM objetivos WHERE excluido_em IS NULL ORDER BY id DESC');
    } elseif ($setores === []) {
        $st = $PDO->prepare('SELECT * FROM objetivos WHERE excluido_em IS NULL AND setor IS NULL ORDER BY id DESC');
        $st->execute();
    } else {
        $marcas = implode(',', array_fill(0, count($setores), '?'));
        $st = $PDO->prepare("SELECT * FROM objetivos WHERE excluido_em IS NULL
                             AND (setor IS NULL OR setor IN ($marcas)) ORDER BY id DESC");
        $st->execute($setores);
    }
    $objetivos = $st->fetchAll();

    $krs = [];
    if ($objetivos) {
        $ids = array_map(fn($o) => (int) $o['id'], $objetivos);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $k = $PDO->prepare("SELECT * FROM resultados_chave WHERE objetivo_id IN ($marcas) ORDER BY id");
        $k->execute($ids);
        foreach ($k->fetchAll() as $l) {
            $krs[(int) $l['objetivo_id']][] = [
                'id' => (int) $l['id'], 'titulo' => $l['titulo'],
                'alvo' => (int) $l['alvo'], 'atual' => (int) $l['atual'], 'unidade' => $l['unidade'],
            ];
        }
    }

    responder(array_map(fn($o) => [
        'id' => (int) $o['id'], 'setor' => $o['setor'], 'titulo' => $o['titulo'],
        'periodo' => $o['periodo'], 'resultados' => $krs[(int) $o['id']] ?? [],
    ], $objetivos));
}

if ($rota === '/objetivos' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $d = corpo_json();
    $titulo = campo_texto($d, 'titulo');
    if ($titulo === '') {
        erro('Informe o objetivo.');
    }
    $PDO->prepare('INSERT INTO objetivos (setor, titulo, periodo, criado_em) VALUES (?, ?, ?, ?)')
        ->execute([campo_ou_nulo($d, 'setor') ?? ($m['setor'] ?? null), $titulo, campo_ou_nulo($d, 'periodo'), agora()]);
    responder(['id' => (int) $PDO->lastInsertId()], 201);
}

if (preg_match('#^/objetivos/(\d+)/resultados$#', $rota, $mm) && $metodo === 'POST') {
    exigir_login($PDO, $CONFIG);
    $d = corpo_json();
    $titulo = campo_texto($d, 'titulo');
    if ($titulo === '') {
        erro('Informe o resultado-chave.');
    }
    $PDO->prepare('INSERT INTO resultados_chave (objetivo_id, titulo, alvo, atual, unidade) VALUES (?, ?, ?, ?, ?)')
        ->execute([(int) $mm[1], $titulo, campo_int($d, 'alvo', 100), campo_int($d, 'atual', 0), campo_ou_nulo($d, 'unidade')]);
    responder(['id' => (int) $PDO->lastInsertId()], 201);
}

if (preg_match('#^/resultados/(\d+)$#', $rota, $mm) && $metodo === 'POST') {
    exigir_login($PDO, $CONFIG);
    $PDO->prepare('UPDATE resultados_chave SET atual = ? WHERE id = ?')
        ->execute([campo_int(corpo_json(), 'atual', 0), (int) $mm[1]]);
    responder(['ok' => true]);
}

if (preg_match('#^/objetivos/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    exigir_login($PDO, $CONFIG);
    $PDO->prepare('UPDATE objetivos SET excluido_em = ? WHERE id = ?')->execute([agora(), (int) $mm[1]]);
    http_response_code(204);
    exit;
}

// ============================ PAINEL ============================
// Os números que a diretoria realmente pede — uma tela fixa, não widgets.
if ($rota === '/painel' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    [$filtro, $params] = filtro_setor($m, 'p.setor');
    $hoje = date('Y-m-d');

    $contar = function (string $sql, array $p) use ($PDO): int {
        $st = $PDO->prepare($sql);
        $st->execute($p);
        return (int) $st->fetch()['n'];
    };

    $projetosAtivos = $contar("SELECT COUNT(*) AS n FROM projetos p
                          WHERE p.excluido_em IS NULL AND p.situacao = 'ativo'$filtro", $params);

    $baseTarefa = "FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
                   LEFT JOIN projeto_status s ON s.id = t.status_id
                   WHERE t.excluido_em IS NULL AND p.excluido_em IS NULL$filtro";

    $abertas = $contar("SELECT COUNT(*) AS n $baseTarefa
                   AND (s.categoria IS NULL OR s.categoria NOT IN ('concluido','cancelado'))", $params);
    $concluidas = $contar("SELECT COUNT(*) AS n $baseTarefa AND s.categoria = 'concluido'", $params);
    $atrasadas = $contar("SELECT COUNT(*) AS n $baseTarefa
                     AND t.prazo IS NOT NULL AND t.prazo < ?
                     AND (s.categoria IS NULL OR s.categoria NOT IN ('concluido','cancelado'))",
        array_merge($params, [$hoje]));

    // Carga por pessoa: tarefas abertas atribuídas.
    $carga = $PDO->prepare("SELECT mb.nome, COUNT(*) AS n
                            FROM tarefa_responsaveis tr
                            JOIN membros mb ON mb.id = tr.membro_id
                            JOIN tarefas t ON t.id = tr.tarefa_id
                            JOIN projetos p ON p.id = t.projeto_id
                            LEFT JOIN projeto_status s ON s.id = t.status_id
                            WHERE t.excluido_em IS NULL AND p.excluido_em IS NULL
                              AND (s.categoria IS NULL OR s.categoria NOT IN ('concluido','cancelado'))$filtro
                            GROUP BY mb.nome ORDER BY n DESC LIMIT 12");
    $carga->execute($params);

    $docs = $PDO->prepare('SELECT COUNT(*) AS n FROM documentos WHERE excluido_em IS NULL');
    $docs->execute();

    responder([
        'projetos_ativos' => $projetosAtivos,
        'tarefas_abertas' => $abertas,
        'tarefas_concluidas' => $concluidas,
        'tarefas_atrasadas' => $atrasadas,
        'documentos' => (int) $docs->fetch()['n'],
        'carga' => array_map(fn($c) => ['nome' => $c['nome'], 'total' => (int) $c['n']], $carga->fetchAll()),
    ]);
}
