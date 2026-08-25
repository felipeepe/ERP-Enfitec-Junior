<?php
// Notificações, lixeira, duplicação de projeto e exportação da documentação.
// Incluído por index.php, que já definiu $rota, $metodo, $PDO e $CONFIG.

declare(strict_types=1);

require_once __DIR__ . '/erp_comum.php';

// ============================ NOTIFICAÇÕES ============================

if ($rota === '/notificacoes' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT * FROM notificacoes WHERE membro_id = ?
                         ORDER BY CASE WHEN lida_em IS NULL THEN 0 ELSE 1 END, id DESC LIMIT 40');
    $st->execute([(int) $m['id']]);
    responder(array_map(fn($n) => [
        'id' => (int) $n['id'],
        'tipo' => $n['tipo'],
        'titulo' => $n['titulo'],
        'texto' => $n['texto'],
        'link' => $n['link'],
        'lida' => $n['lida_em'] !== null,
        'criado_em' => $n['criado_em'],
    ], $st->fetchAll()));
}

if ($rota === '/notificacoes/nao-lidas' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $st = $PDO->prepare('SELECT COUNT(*) AS n FROM notificacoes WHERE membro_id = ? AND lida_em IS NULL');
    $st->execute([(int) $m['id']]);
    responder(['total' => (int) $st->fetch()['n']]);
}

// Marca uma, ou todas quando não vem id.
if ($rota === '/notificacoes/lidas' && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $id = campo_int(corpo_json(), 'id');
    if ($id === null) {
        $PDO->prepare('UPDATE notificacoes SET lida_em = ? WHERE membro_id = ? AND lida_em IS NULL')
            ->execute([agora(), (int) $m['id']]);
    } else {
        $PDO->prepare('UPDATE notificacoes SET lida_em = ? WHERE id = ? AND membro_id = ?')
            ->execute([agora(), $id, (int) $m['id']]);
    }
    responder(['ok' => true]);
}

// ============================ LIXEIRA ============================
// O soft delete já existia em tudo, mas nada restaurava: só voltava pelo
// phpMyAdmin. Numa equipe que troca a cada semestre, alguém vai apagar o
// projeto errado na primeira semana.

if ($rota === '/lixeira' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    [$fp, $pp] = filtro_setor($m, 'p.setor');

    $projetos = $PDO->prepare("SELECT p.id, p.codigo, p.nome, p.setor, p.excluido_em
                               FROM projetos p WHERE p.excluido_em IS NOT NULL$fp
                               ORDER BY p.excluido_em DESC LIMIT 60");
    $projetos->execute($pp);

    // Tarefa só entra na lixeira se o projeto dela NÃO estiver apagado —
    // senão a lista repetiria tudo que já some junto com o projeto.
    $tarefas = $PDO->prepare("SELECT t.id, t.titulo, t.numero, t.excluido_em, p.codigo, p.nome AS projeto_nome
                              FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
                              WHERE t.excluido_em IS NOT NULL AND p.excluido_em IS NULL$fp
                              ORDER BY t.excluido_em DESC LIMIT 60");
    $tarefas->execute($pp);

    $setores = setores_visiveis($m);
    if ($setores === null) {
        $docs = $PDO->query('SELECT id, titulo, icone, setor, excluido_em FROM documentos
                             WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC LIMIT 60');
    } else {
        $marcas = $setores ? implode(',', array_fill(0, count($setores), '?')) : null;
        $sql = 'SELECT id, titulo, icone, setor, excluido_em FROM documentos
                WHERE excluido_em IS NOT NULL AND (setor IS NULL'
             . ($marcas ? " OR setor IN ($marcas)" : '') . ')
                ORDER BY excluido_em DESC LIMIT 60';
        $docs = $PDO->prepare($sql);
        $docs->execute($setores);
    }

    responder([
        'projetos' => array_map(fn($p) => [
            'id' => (int) $p['id'], 'rotulo' => $p['codigo'] . ' · ' . $p['nome'],
            'setor' => $p['setor'], 'excluido_em' => $p['excluido_em'],
        ], $projetos->fetchAll()),
        'tarefas' => array_map(fn($t) => [
            'id' => (int) $t['id'], 'rotulo' => $t['codigo'] . '-' . $t['numero'] . ' · ' . $t['titulo'],
            'setor' => $t['projeto_nome'], 'excluido_em' => $t['excluido_em'],
        ], $tarefas->fetchAll()),
        'documentos' => array_map(fn($d) => [
            'id' => (int) $d['id'], 'rotulo' => ($d['icone'] ?: '📄') . ' ' . $d['titulo'],
            'setor' => $d['setor'], 'excluido_em' => $d['excluido_em'],
        ], $docs->fetchAll()),
    ]);
}

if (preg_match('#^/lixeira/(projeto|tarefa|documento)/(\d+)/restaurar$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $tipo = $mm[1];
    $id = (int) $mm[2];

    // Confere o escopo lendo o item mesmo apagado — projeto_visivel() e as
    // irmãs filtram por excluido_em IS NULL e não servem aqui.
    $tabela = ['projeto' => 'projetos', 'tarefa' => 'tarefas', 'documento' => 'documentos'][$tipo];
    $st = $PDO->prepare("SELECT * FROM $tabela WHERE id = ? AND excluido_em IS NOT NULL");
    $st->execute([$id]);
    $item = $st->fetch();
    if (!$item) {
        erro('Item não encontrado na lixeira', 404);
    }

    $setores = setores_visiveis($m);
    if ($setores !== null) {
        if ($tipo === 'tarefa') {
            $p = $PDO->prepare('SELECT setor FROM projetos WHERE id = ?');
            $p->execute([(int) $item['projeto_id']]);
            $setorItem = $p->fetch()['setor'] ?? null;
        } else {
            $setorItem = $item['setor'] ?? null;
        }
        if ($setorItem !== null && !in_array($setorItem, $setores, true)) {
            erro('Item não encontrado na lixeira', 404);
        }
    }

    $PDO->prepare("UPDATE $tabela SET excluido_em = NULL WHERE id = ?")->execute([$id]);

    // Apagar um projeto ou documento apagou os filhos junto; restaurar devolve
    // os que caíram no MESMO instante, sem ressuscitar o que já estava apagado antes.
    if ($tipo === 'projeto') {
        $PDO->prepare('UPDATE tarefas SET excluido_em = NULL WHERE projeto_id = ? AND excluido_em = ?')
            ->execute([$id, $item['excluido_em']]);
    } elseif ($tipo === 'documento') {
        $PDO->prepare('UPDATE documentos SET excluido_em = NULL WHERE pai_id = ? AND excluido_em = ?')
            ->execute([$id, $item['excluido_em']]);
    }

    responder(['ok' => true]);
}

// Excluir de vez. Sem isto a lixeira só cresce — e o soft delete vira um jeito
// caro de nunca apagar nada. Só gestor, porque não tem volta.
if (preg_match('#^/lixeira/(projeto|tarefa|documento)/(\d+)$#', $rota, $mm) && $metodo === 'DELETE') {
    $m = exigir_gestor($PDO, $CONFIG);
    $tipo = $mm[1];
    $id = (int) $mm[2];
    $tabela = ['projeto' => 'projetos', 'tarefa' => 'tarefas', 'documento' => 'documentos'][$tipo];

    // Só apaga o que JÁ está na lixeira: nunca atalho para excluir algo em uso.
    $st = $PDO->prepare("SELECT id FROM $tabela WHERE id = ? AND excluido_em IS NOT NULL");
    $st->execute([$id]);
    if (!$st->fetch()) {
        erro('Item não encontrado na lixeira', 404);
    }

    if ($tipo === 'projeto') {
        // Apaga o que pendura no projeto, senão sobram linhas órfãs sem dono.
        $tarefas = $PDO->prepare('SELECT id FROM tarefas WHERE projeto_id = ?');
        $tarefas->execute([$id]);
        foreach ($tarefas->fetchAll() as $t) {
            limpar_dependentes_da_tarefa($PDO, (int) $t['id']);
        }
        foreach (['tarefas', 'projeto_status', 'etiquetas', 'marcos'] as $tab) {
            $PDO->prepare("DELETE FROM $tab WHERE projeto_id = ?")->execute([$id]);
        }
        $PDO->prepare('DELETE FROM comentarios WHERE alvo_tipo = ? AND alvo_id = ?')->execute(['projeto', $id]);
        // A hora lançada NÃO some junto: ela é registro de trabalho realizado.
        $PDO->prepare('UPDATE registros SET projeto_id = NULL, tarefa_id = NULL WHERE projeto_id = ?')
            ->execute([$id]);
    } elseif ($tipo === 'tarefa') {
        limpar_dependentes_da_tarefa($PDO, $id);
        $PDO->prepare('UPDATE registros SET tarefa_id = NULL WHERE tarefa_id = ?')->execute([$id]);
    } else {
        // Subpáginas que caíram na lixeira junto com esta vão junto de vez —
        // senão viram órfãs soltas na lixeira, apontando para um pai que não
        // existe mais. As que foram restauradas individualmente sobem a raiz.
        $filhos = $PDO->prepare('SELECT id FROM documentos WHERE pai_id = ? AND excluido_em IS NOT NULL');
        $filhos->execute([$id]);
        foreach ($filhos->fetchAll() as $f) {
            limpar_dependentes_do_documento($PDO, (int) $f['id']);
            $PDO->prepare('DELETE FROM documentos WHERE id = ?')->execute([(int) $f['id']]);
        }
        $PDO->prepare('UPDATE documentos SET pai_id = NULL WHERE pai_id = ?')->execute([$id]);
        limpar_dependentes_do_documento($PDO, $id);
    }

    $PDO->prepare("DELETE FROM $tabela WHERE id = ?")->execute([$id]);
    http_response_code(204);
    exit;
}

// Tudo que pendura numa página e não faz sentido sem ela.
function limpar_dependentes_do_documento(PDO $pdo, int $id): void
{
    $pdo->prepare('DELETE FROM documento_versoes WHERE documento_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM documento_tarefas WHERE documento_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM comentarios WHERE alvo_tipo = ? AND alvo_id = ?')->execute(['documento', $id]);
}

// Tudo que pendura numa tarefa e não faz sentido sem ela.
function limpar_dependentes_da_tarefa(PDO $pdo, int $id): void
{
    foreach ([
        'tarefa_responsaveis', 'tarefa_checklist', 'tarefa_historico',
        'tarefa_etiquetas', 'cronometros', 'documento_tarefas',
    ] as $tab) {
        $pdo->prepare("DELETE FROM $tab WHERE tarefa_id = ?")->execute([$id]);
    }
    $pdo->prepare('DELETE FROM tarefa_dependencias WHERE tarefa_id = ? OR depende_de_id = ?')
        ->execute([$id, $id]);
    $pdo->prepare('DELETE FROM comentarios WHERE alvo_tipo = ? AND alvo_id = ?')->execute(['tarefa', $id]);
}

// ============================ DUPLICAR PROJETO ============================
// Toda EJ repete a mesma estrutura a cada semestre. Clonar substitui
// recorrência, que é armadilha, e custa uma fração do esforço.

if (preg_match('#^/projetos/(\d+)/duplicar$#', $rota, $mm) && $metodo === 'POST') {
    $m = exigir_login($PDO, $CONFIG);
    $origem = projeto_visivel($PDO, $m, (int) $mm[1]);
    $d = corpo_json();

    $nome = campo_texto($d, 'nome') ?: ($origem['nome'] . ' (cópia)');
    $comTarefas = !isset($d['com_tarefas']) || !empty($d['com_tarefas']);
    $comResponsaveis = !empty($d['com_responsaveis']);
    $comChecklist = !isset($d['com_checklist']) || !empty($d['com_checklist']);

    $PDO->prepare('INSERT INTO projetos (codigo, nome, descricao, setor, situacao, responsavel_id, inicio, prazo, criado_por, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            gerar_codigo($PDO, $nome), $nome, $origem['descricao'], $origem['setor'],
            'ativo', $origem['responsavel_id'],
            campo_data($d, 'inicio'), campo_data($d, 'prazo'),
            (int) $m['id'], agora(),
        ]);
    $novoId = (int) $PDO->lastInsertId();

    // Status e etiquetas vão sempre: são a configuração do quadro.
    $mapaStatus = [];
    $st = $PDO->prepare('SELECT * FROM projeto_status WHERE projeto_id = ? ORDER BY ordem');
    $st->execute([(int) $origem['id']]);
    $ins = $PDO->prepare('INSERT INTO projeto_status (projeto_id, nome, categoria, cor, ordem) VALUES (?, ?, ?, ?, ?)');
    foreach ($st->fetchAll() as $s) {
        $ins->execute([$novoId, $s['nome'], $s['categoria'], $s['cor'], (int) $s['ordem']]);
        $mapaStatus[(int) $s['id']] = (int) $PDO->lastInsertId();
    }

    $mapaEtiq = [];
    $et = $PDO->prepare('SELECT * FROM etiquetas WHERE projeto_id = ?');
    $et->execute([(int) $origem['id']]);
    $insEt = $PDO->prepare('INSERT INTO etiquetas (projeto_id, nome, cor) VALUES (?, ?, ?)');
    foreach ($et->fetchAll() as $e) {
        $insEt->execute([$novoId, $e['nome'], $e['cor']]);
        $mapaEtiq[(int) $e['id']] = (int) $PDO->lastInsertId();
    }

    $copiadas = 0;
    if ($comTarefas) {
        // Copia primeiro as de topo, depois as filhas, para o pai já existir.
        $tf = $PDO->prepare('SELECT * FROM tarefas WHERE projeto_id = ? AND excluido_em IS NULL
                             ORDER BY CASE WHEN tarefa_pai_id IS NULL THEN 0 ELSE 1 END, id');
        $tf->execute([(int) $origem['id']]);

        $mapaTarefa = [];
        $insT = $PDO->prepare('INSERT INTO tarefas (projeto_id, tarefa_pai_id, numero, titulo, descricao, status_id,
                                                    prioridade, estimativa_min, ordem, criado_por, criado_em)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $numero = 0;
        foreach ($tf->fetchAll() as $t) {
            $numero++;
            $insT->execute([
                $novoId,
                $t['tarefa_pai_id'] !== null ? ($mapaTarefa[(int) $t['tarefa_pai_id']] ?? null) : null,
                $numero, $t['titulo'], $t['descricao'],
                $t['status_id'] !== null ? ($mapaStatus[(int) $t['status_id']] ?? null) : null,
                $t['prioridade'], $t['estimativa_min'], (int) $t['ordem'],
                (int) $m['id'], agora(),
            ]);
            $novaTarefa = (int) $PDO->lastInsertId();
            $mapaTarefa[(int) $t['id']] = $novaTarefa;
            $copiadas++;

            // Prazo e conclusão NÃO são copiados: são do ciclo anterior.
            if ($comResponsaveis) {
                $r = $PDO->prepare('SELECT membro_id FROM tarefa_responsaveis WHERE tarefa_id = ?');
                $r->execute([(int) $t['id']]);
                $insR = $PDO->prepare('INSERT INTO tarefa_responsaveis (tarefa_id, membro_id) VALUES (?, ?)');
                foreach ($r->fetchAll() as $l) {
                    $insR->execute([$novaTarefa, (int) $l['membro_id']]);
                }
            }
            if ($comChecklist) {
                $c = $PDO->prepare('SELECT texto, ordem FROM tarefa_checklist WHERE tarefa_id = ? ORDER BY ordem');
                $c->execute([(int) $t['id']]);
                $insC = $PDO->prepare('INSERT INTO tarefa_checklist (tarefa_id, texto, feito, ordem) VALUES (?, ?, 0, ?)');
                foreach ($c->fetchAll() as $l) {
                    $insC->execute([$novaTarefa, $l['texto'], (int) $l['ordem']]);
                }
            }
            $e = $PDO->prepare('SELECT etiqueta_id FROM tarefa_etiquetas WHERE tarefa_id = ?');
            $e->execute([(int) $t['id']]);
            $insTE = $PDO->prepare('INSERT INTO tarefa_etiquetas (tarefa_id, etiqueta_id) VALUES (?, ?)');
            foreach ($e->fetchAll() as $l) {
                if (isset($mapaEtiq[(int) $l['etiqueta_id']])) {
                    $insTE->execute([$novaTarefa, $mapaEtiq[(int) $l['etiqueta_id']]]);
                }
            }
            registrar_historico($PDO, $novaTarefa, (int) $m['id'], 'criou');
        }
    }

    responder(['id' => $novoId, 'tarefas_copiadas' => $copiadas], 201);
}

// ============================ EXPORTAR DOCUMENTAÇÃO ============================
// Garante que o conhecimento da EJ não fique refém do banco se ninguém
// mantiver o ERP daqui a dois semestres.

if ($rota === '/documentos/exportar' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    if (!class_exists('ZipArchive')) {
        erro('O servidor não tem a extensão zip do PHP habilitada.', 501);
    }

    [$filtro, $params] = (function (array $membro) {
        $setores = setores_visiveis($membro);
        if ($setores === null) {
            return ['', []];
        }
        if ($setores === []) {
            return [' AND setor IS NULL', []];
        }
        $marcas = implode(',', array_fill(0, count($setores), '?'));
        return [" AND (setor IS NULL OR setor IN ($marcas))", $setores];
    })($m);

    $st = $PDO->prepare("SELECT id, pai_id, titulo, conteudo, setor, atualizado_em
                         FROM documentos WHERE excluido_em IS NULL$filtro ORDER BY ordem, titulo");
    $st->execute($params);
    $paginas = $st->fetchAll();

    // Nome de arquivo seguro: o título é escrito por gente e vira caminho.
    $limpar = function (string $s): string {
        $s = strtr($s, ['á'=>'a','à'=>'a','ã'=>'a','â'=>'a','é'=>'e','ê'=>'e','í'=>'i',
                        'ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ç'=>'c','Á'=>'A','É'=>'E',
                        'Í'=>'I','Ó'=>'O','Ú'=>'U','Ç'=>'C','ã'=>'a']);
        $s = preg_replace('/[^A-Za-z0-9 _-]/', '', $s) ?? '';
        $s = trim(preg_replace('/\s+/', '-', $s) ?? '');
        return $s !== '' ? mb_substr($s, 0, 60) : 'pagina';
    };

    $porId = [];
    foreach ($paginas as $p) {
        $porId[(int) $p['id']] = $p;
    }
    // Reconstrói o caminho de pastas subindo pelos pais.
    $caminho = function (array $p) use (&$caminho, $porId, $limpar): string {
        $nome = $limpar($p['titulo']);
        if ($p['pai_id'] === null || !isset($porId[(int) $p['pai_id']])) {
            return $nome;
        }
        return $caminho($porId[(int) $p['pai_id']]) . '/' . $nome;
    };

    $arquivo = sys_get_temp_dir() . '/doc-enfitec-' . bin2hex(random_bytes(6)) . '.zip';
    $zip = new ZipArchive();
    if ($zip->open($arquivo, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        erro('Não foi possível montar o arquivo.', 500);
    }

    $indice = "# Documentação ENFITEC Júnior\n\nExportado em " . date('d/m/Y H:i') . "\n\n";
    foreach ($paginas as $p) {
        $rel = $caminho($p) . '.md';
        $cabecalho = '# ' . $p['titulo'] . "\n\n"
            . '> Diretoria: ' . ($p['setor'] ?: 'institucional')
            . ' · atualizado em ' . substr((string) $p['atualizado_em'], 0, 16) . "\n\n";
        // Se o conteúdo já começa com o título, não repete.
        $corpo = (string) $p['conteudo'];
        $zip->addFromString($rel, str_starts_with(ltrim($corpo), '# ') ? $cabecalho . $corpo : $cabecalho . $corpo);
        $indice .= "- [{$p['titulo']}]($rel)\n";
    }
    $zip->addFromString('INDICE.md', $indice);
    $zip->close();

    header('Content-Type: application/zip');
    header('Content-Length: ' . filesize($arquivo));
    header('Content-Disposition: attachment; filename="documentacao-enfitec-' . date('Y-m-d') . '.zip"');
    header('X-Content-Type-Options: nosniff');
    readfile($arquivo);
    @unlink($arquivo);
    exit;
}

// ============================ RELATÓRIO INDIVIDUAL ============================
// Membro de EJ precisa comprovar horas para certificado e para a coordenação
// do curso. Até agora só existia "últimos 7 dias" e "total do mês".

if ($rota === '/meu-relatorio' && $metodo === 'GET') {
    $m = exigir_login($PDO, $CONFIG);
    $de = is_string($_GET['de'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['de'])
        ? $_GET['de'] : date('Y-01-01');
    $ate = is_string($_GET['ate'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['ate'])
        ? $_GET['ate'] : date('Y-m-d');
    if ($ate < $de) {
        erro('Intervalo inválido.');
    }

    $agrupado = function (string $coluna) use ($PDO, $m, $de, $ate) {
        $st = $PDO->prepare("SELECT $coluna AS rotulo, SUM(minutos) AS total, COUNT(*) AS qtd
                             FROM registros WHERE membro_id = ? AND data >= ? AND data <= ?
                             GROUP BY $coluna ORDER BY total DESC");
        $st->execute([(int) $m['id'], $de, $ate]);
        return array_map(fn($l) => [
            'rotulo' => $l['rotulo'] ?? '—',
            'total_minutos' => (int) $l['total'],
            'qtd' => (int) $l['qtd'],
        ], $st->fetchAll());
    };

    $total = $PDO->prepare('SELECT COALESCE(SUM(minutos),0) AS t, COUNT(*) AS q
                            FROM registros WHERE membro_id = ? AND data >= ? AND data <= ?');
    $total->execute([(int) $m['id'], $de, $ate]);
    $geral = $total->fetch();

    $porProjeto = $PDO->prepare("SELECT p.codigo, p.nome, SUM(r.minutos) AS total
                                 FROM registros r JOIN projetos p ON p.id = r.projeto_id
                                 WHERE r.membro_id = ? AND r.data >= ? AND r.data <= ?
                                 GROUP BY p.codigo, p.nome ORDER BY total DESC");
    $porProjeto->execute([(int) $m['id'], $de, $ate]);

    $porMes = $PDO->prepare("SELECT substr(data, 1, 7) AS mes, SUM(minutos) AS total
                             FROM registros WHERE membro_id = ? AND data >= ? AND data <= ?
                             GROUP BY mes ORDER BY mes");
    $porMes->execute([(int) $m['id'], $de, $ate]);

    responder([
        'membro' => ['nome' => $m['nome'], 'email' => $m['email'], 'setor' => $m['setor']],
        'de' => $de,
        'ate' => $ate,
        'total_minutos' => (int) $geral['t'],
        'lancamentos' => (int) $geral['q'],
        'por_tipo' => $agrupado('tipo_hora'),
        'por_setor' => $agrupado('setor'),
        'por_atividade' => $agrupado('atividade'),
        'por_projeto' => array_map(fn($l) => [
            'rotulo' => $l['codigo'] . ' · ' . $l['nome'],
            'total_minutos' => (int) $l['total'],
        ], $porProjeto->fetchAll()),
        'por_mes' => array_map(fn($l) => [
            'rotulo' => $l['mes'], 'total_minutos' => (int) $l['total'],
        ], $porMes->fetchAll()),
    ]);
}
