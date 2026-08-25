<?php
// Helpers compartilhados pelas rotas do ERP.

declare(strict_types=1);

// ---- Leitura segura do corpo JSON ----
// O corpo vem do cliente: {"titulo": 123} ou {"titulo": []} passaria um não-texto
// para trim() e, sob strict_types, viraria TypeError → HTTP 500 em vez de 400.
function campo_texto(array $d, string $chave, string $padrao = ''): string
{
    $v = $d[$chave] ?? null;
    return is_scalar($v) ? trim((string) $v) : $padrao;
}

function campo_ou_nulo(array $d, string $chave): ?string
{
    $v = campo_texto($d, $chave);
    return $v !== '' ? $v : null;
}

function campo_int(array $d, string $chave, ?int $padrao = null): ?int
{
    $v = $d[$chave] ?? null;
    if ($v === null || $v === '' || !is_numeric($v)) {
        return $padrao;
    }
    return (int) $v;
}

function campo_lista_int(array $d, string $chave): array
{
    $v = $d[$chave] ?? [];
    if (!is_array($v)) {
        return [];
    }
    $saida = [];
    foreach ($v as $item) {
        if (is_numeric($item)) {
            $saida[] = (int) $item;
        }
    }
    return array_values(array_unique($saida));
}

function agora(): string
{
    return date('Y-m-d H:i:s');
}

// Valida 'AAAA-MM-DD' (ou devolve null).
function campo_data(array $d, string $chave): ?string
{
    $v = campo_texto($d, $chave);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null;
}

// ---- Escopo por diretoria ----
// Gestor enxerga tudo. Membro enxerga a própria diretoria. Membro sem diretoria
// definida enxerga nada — e a tela precisa mostrar vazio, não quebrar.
function e_gestor(array $membro): bool
{
    return ($membro['role'] ?? '') === 'gestor';
}

function setores_visiveis(array $membro): ?array
{
    if (e_gestor($membro)) {
        return null; // null = sem filtro
    }
    $setor = $membro['setor'] ?? null;
    return $setor ? [$setor] : [];
}

// Monta o predicado SQL de escopo. Devolve [trechoSql, params].
function filtro_setor(array $membro, string $coluna = 'p.setor'): array
{
    $setores = setores_visiveis($membro);
    if ($setores === null) {
        return ['', []];
    }
    if ($setores === []) {
        return [' AND 1 = 0', []]; // sem diretoria: não vê nada
    }
    $marcas = implode(',', array_fill(0, count($setores), '?'));
    return [" AND $coluna IN ($marcas)", $setores];
}

// Carrega um projeto respeitando o escopo; encerra com 404 se não puder ver.
function projeto_visivel(PDO $pdo, array $membro, int $id): array
{
    $st = $pdo->prepare('SELECT * FROM projetos WHERE id = ? AND excluido_em IS NULL');
    $st->execute([$id]);
    $p = $st->fetch();
    if (!$p) {
        erro('Projeto não encontrado', 404);
    }
    $setores = setores_visiveis($membro);
    if ($setores !== null && !in_array($p['setor'], $setores, true)) {
        erro('Projeto não encontrado', 404);
    }
    return $p;
}

// Carrega uma tarefa junto do projeto dela, respeitando o escopo.
function tarefa_visivel(PDO $pdo, array $membro, int $id): array
{
    $st = $pdo->prepare('SELECT * FROM tarefas WHERE id = ? AND excluido_em IS NULL');
    $st->execute([$id]);
    $t = $st->fetch();
    if (!$t) {
        erro('Tarefa não encontrada', 404);
    }
    projeto_visivel($pdo, $membro, (int) $t['projeto_id']); // encerra se não puder
    return $t;
}

// ---- Histórico ----
// Append-only. Não é retroativo: por isso grava desde a primeira tarefa.
function registrar_historico(PDO $pdo, int $tarefaId, ?int $membroId, string $acao, ?string $campo = null, $de = null, $para = null): void
{
    $pdo->prepare('INSERT INTO tarefa_historico (tarefa_id, membro_id, acao, campo, de, para, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $tarefaId, $membroId, $acao, $campo,
            $de === null ? null : (string) $de,
            $para === null ? null : (string) $para,
            agora(),
        ]);
}

// ---- Notificações ----
// Nunca notifica quem causou o evento: ninguém precisa ser avisado do que
// acabou de fazer. Silencioso de propósito — falha aqui não pode derrubar a
// ação principal que a pessoa pediu.
function notificar_membros(PDO $pdo, array $destinos, int $autorId, string $tipo, string $titulo, ?string $texto = null, ?string $link = null, ?int $origemId = null): void
{
    $destinos = array_values(array_unique(array_filter(
        array_map('intval', $destinos),
        fn($id) => $id > 0 && $id !== $autorId,
    )));
    if (!$destinos) {
        return;
    }
    try {
        $st = $pdo->prepare('INSERT INTO notificacoes (membro_id, tipo, titulo, texto, link, origem_id, criado_em)
                             VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($destinos as $id) {
            $st->execute([$id, $tipo, mb_substr($titulo, 0, 200), $texto, $link, $origemId, agora()]);
        }
    } catch (Throwable $e) {
        // Notificação é acessório: não vale falhar a criação da tarefa por ela.
    }
}

// ---- Status padrão de um projeto novo ----
function semear_status(PDO $pdo, int $projetoId): void
{
    $padrao = [
        ['A fazer',     'aberto',     '#607086', 0],
        ['Em andamento', 'andamento', '#1565c0', 1],
        ['Em revisão',  'andamento',  '#b8860b', 2],
        ['Concluído',   'concluido',  '#2e7d32', 3],
    ];
    $st = $pdo->prepare('INSERT INTO projeto_status (projeto_id, nome, categoria, cor, ordem) VALUES (?, ?, ?, ?, ?)');
    foreach ($padrao as [$nome, $cat, $cor, $ordem]) {
        $st->execute([$projetoId, $nome, $cat, $cor, $ordem]);
    }
}

// Gera um código curto e único para o projeto (ex.: "BRACO", "BRACO2").
function gerar_codigo(PDO $pdo, string $nome): string
{
    $base = strtoupper((string) preg_replace('/[^A-Za-z0-9]/', '', strtr(
        $nome,
        ['á'=>'a','à'=>'a','ã'=>'a','â'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ç'=>'c',
         'Á'=>'A','À'=>'A','Ã'=>'A','Â'=>'A','É'=>'E','Ê'=>'E','Í'=>'I','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ú'=>'U','Ç'=>'C']
    )));
    $base = substr($base !== '' ? $base : 'PROJ', 0, 6);
    $codigo = $base;
    $n = 1;
    $st = $pdo->prepare('SELECT 1 FROM projetos WHERE codigo = ?');
    while (true) {
        $st->execute([$codigo]);
        if (!$st->fetch()) {
            return $codigo;
        }
        $n++;
        $codigo = $base . $n;
    }
}

// Próximo número sequencial de tarefa dentro do projeto (dá o "BRACO-12").
function proximo_numero(PDO $pdo, int $projetoId): int
{
    $st = $pdo->prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM tarefas WHERE projeto_id = ?');
    $st->execute([$projetoId]);
    return (int) $st->fetch()['n'];
}

// ---- Carregamento em lote (evita N+1 nas listagens) ----
function responsaveis_por_tarefa(PDO $pdo, array $ids): array
{
    if (!$ids) {
        return [];
    }
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT tr.tarefa_id, m.id, m.nome
                         FROM tarefa_responsaveis tr JOIN membros m ON m.id = tr.membro_id
                         WHERE tr.tarefa_id IN ($marcas)");
    $st->execute($ids);
    $mapa = [];
    foreach ($st->fetchAll() as $l) {
        $mapa[(int) $l['tarefa_id']][] = ['id' => (int) $l['id'], 'nome' => $l['nome']];
    }
    return $mapa;
}

function etiquetas_por_tarefa(PDO $pdo, array $ids): array
{
    if (!$ids) {
        return [];
    }
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT te.tarefa_id, e.id, e.nome, e.cor
                         FROM tarefa_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
                         WHERE te.tarefa_id IN ($marcas)");
    $st->execute($ids);
    $mapa = [];
    foreach ($st->fetchAll() as $l) {
        $mapa[(int) $l['tarefa_id']][] = ['id' => (int) $l['id'], 'nome' => $l['nome'], 'cor' => $l['cor']];
    }
    return $mapa;
}

function checklist_resumo(PDO $pdo, array $ids): array
{
    if (!$ids) {
        return [];
    }
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT tarefa_id, COUNT(*) AS total, SUM(feito) AS feitos
                         FROM tarefa_checklist WHERE tarefa_id IN ($marcas) GROUP BY tarefa_id");
    $st->execute($ids);
    $mapa = [];
    foreach ($st->fetchAll() as $l) {
        $mapa[(int) $l['tarefa_id']] = ['total' => (int) $l['total'], 'feitos' => (int) $l['feitos']];
    }
    return $mapa;
}

// Formata uma tarefa para o front, anexando as coleções carregadas em lote.
function tarefa_para_front(array $t, array $resp = [], array $etiq = [], array $chk = []): array
{
    $id = (int) $t['id'];
    return [
        'id' => $id,
        'projeto_id' => (int) $t['projeto_id'],
        'tarefa_pai_id' => $t['tarefa_pai_id'] !== null ? (int) $t['tarefa_pai_id'] : null,
        'numero' => (int) $t['numero'],
        'titulo' => $t['titulo'],
        'descricao' => $t['descricao'],
        'status_id' => $t['status_id'] !== null ? (int) $t['status_id'] : null,
        'prioridade' => $t['prioridade'],
        'data_inicio' => $t['data_inicio'],
        'prazo' => $t['prazo'],
        'estimativa_min' => $t['estimativa_min'] !== null ? (int) $t['estimativa_min'] : null,
        'recorrencia' => $t['recorrencia'] ?? null,
        'ordem' => (int) $t['ordem'],
        'concluida_em' => $t['concluida_em'],
        'responsaveis' => $resp[$id] ?? [],
        'etiquetas' => $etiq[$id] ?? [],
        'checklist' => $chk[$id] ?? ['total' => 0, 'feitos' => 0],
    ];
}
