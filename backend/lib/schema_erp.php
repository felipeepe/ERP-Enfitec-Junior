<?php
// Estrutura das tabelas do ERP (Projetos, Documentação, OKRs, anexos).
//
// Escrita UMA vez e adaptada aos dois dialetos, para não haver duas fontes de
// verdade entre o SQLite do desenvolvimento e o MySQL da produção.

declare(strict_types=1);

// Devolve a lista de CREATE TABLE / CREATE INDEX já no dialeto certo.
function schema_erp(bool $sqlite): array
{
    // Diferenças entre os dois bancos, resolvidas em um lugar só.
    $pk    = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
    $int   = $sqlite ? 'INTEGER' : 'INT';
    $bool  = $sqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'TINYINT(1) NOT NULL DEFAULT 0';
    $txt   = 'TEXT';
    $dt    = $sqlite ? 'TEXT' : 'DATETIME';
    $data  = $sqlite ? 'TEXT' : 'DATE';
    $agora = 'CURRENT_TIMESTAMP';
    $fim   = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    $vc    = fn(int $n) => $sqlite ? 'TEXT' : "VARCHAR($n)";

    $t = [];

    // ---------- Projetos ----------
    $t[] = "CREATE TABLE IF NOT EXISTS projetos (
        id $pk,
        codigo {$vc(12)} NOT NULL UNIQUE,
        nome {$vc(160)} NOT NULL,
        descricao $txt,
        setor {$vc(60)} NOT NULL,
        situacao {$vc(20)} NOT NULL DEFAULT 'ativo',
        responsavel_id $int,
        inicio $data,
        prazo $data,
        criado_por $int,
        criado_em $dt NOT NULL DEFAULT $agora,
        atualizado_em $dt,
        excluido_em $dt
    )$fim";

    // Status configuráveis por projeto. 'categoria' é o que o sistema entende;
    // 'nome' é o que a equipe escreve. Permite renomear sem quebrar relatório.
    $t[] = "CREATE TABLE IF NOT EXISTS projeto_status (
        id $pk,
        projeto_id $int NOT NULL,
        nome {$vc(60)} NOT NULL,
        categoria {$vc(20)} NOT NULL DEFAULT 'aberto',
        cor {$vc(20)} NOT NULL DEFAULT '#607086',
        ordem $int NOT NULL DEFAULT 0
    )$fim";

    // ---------- Tarefas ----------
    $t[] = "CREATE TABLE IF NOT EXISTS tarefas (
        id $pk,
        projeto_id $int NOT NULL,
        tarefa_pai_id $int,
        numero $int NOT NULL DEFAULT 0,
        titulo {$vc(240)} NOT NULL,
        descricao $txt,
        status_id $int,
        prioridade {$vc(12)} NOT NULL DEFAULT 'media',
        data_inicio $data,
        prazo $data,
        estimativa_min $int,
        recorrencia {$vc(12)},
        ordem $int NOT NULL DEFAULT 0,
        criado_por $int,
        criado_em $dt NOT NULL DEFAULT $agora,
        atualizado_em $dt,
        concluida_em $dt,
        excluido_em $dt
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS tarefa_responsaveis (
        tarefa_id $int NOT NULL,
        membro_id $int NOT NULL,
        PRIMARY KEY (tarefa_id, membro_id)
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS etiquetas (
        id $pk,
        projeto_id $int NOT NULL,
        nome {$vc(60)} NOT NULL,
        cor {$vc(20)} NOT NULL DEFAULT '#1565c0'
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS tarefa_etiquetas (
        tarefa_id $int NOT NULL,
        etiqueta_id $int NOT NULL,
        PRIMARY KEY (tarefa_id, etiqueta_id)
    )$fim";

    // Dependência: 'tarefa_id' está bloqueada por 'depende_de_id'.
    $t[] = "CREATE TABLE IF NOT EXISTS tarefa_dependencias (
        tarefa_id $int NOT NULL,
        depende_de_id $int NOT NULL,
        PRIMARY KEY (tarefa_id, depende_de_id)
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS tarefa_checklist (
        id $pk,
        tarefa_id $int NOT NULL,
        texto {$vc(240)} NOT NULL,
        feito $bool,
        ordem $int NOT NULL DEFAULT 0
    )$fim";

    // Histórico append-only: não é retroativo, por isso grava desde o dia 1.
    $t[] = "CREATE TABLE IF NOT EXISTS tarefa_historico (
        id $pk,
        tarefa_id $int NOT NULL,
        membro_id $int,
        acao {$vc(40)} NOT NULL,
        campo {$vc(40)},
        de $txt,
        para $txt,
        criado_em $dt NOT NULL DEFAULT $agora
    )$fim";

    // ---------- Comentários (tarefas e documentos) ----------
    $t[] = "CREATE TABLE IF NOT EXISTS comentarios (
        id $pk,
        alvo_tipo {$vc(12)} NOT NULL,
        alvo_id $int NOT NULL,
        membro_id $int NOT NULL,
        texto $txt NOT NULL,
        criado_em $dt NOT NULL DEFAULT $agora,
        excluido_em $dt
    )$fim";

    // ---------- Documentação ----------
    // Hierarquia por adjacency list (pai_id): simples, e a árvore de uma EJ é rasa.
    // 'conteudo' é markdown — formato reversível, ver a coluna 'formato'.
    $t[] = "CREATE TABLE IF NOT EXISTS documentos (
        id $pk,
        pai_id $int,
        setor {$vc(60)},
        projeto_id $int,
        titulo {$vc(240)} NOT NULL,
        icone {$vc(8)},
        conteudo $txt,
        formato {$vc(8)} NOT NULL DEFAULT 'md',
        ordem $int NOT NULL DEFAULT 0,
        criado_por $int,
        criado_em $dt NOT NULL DEFAULT $agora,
        atualizado_em $dt,
        excluido_em $dt
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS documento_versoes (
        id $pk,
        documento_id $int NOT NULL,
        titulo {$vc(240)} NOT NULL,
        conteudo $txt,
        membro_id $int,
        criado_em $dt NOT NULL DEFAULT $agora
    )$fim";

    // O diferencial: documentação ligada à execução.
    $t[] = "CREATE TABLE IF NOT EXISTS documento_tarefas (
        documento_id $int NOT NULL,
        tarefa_id $int NOT NULL,
        PRIMARY KEY (documento_id, tarefa_id)
    )$fim";

    // ---------- Marcos ----------
    $t[] = "CREATE TABLE IF NOT EXISTS marcos (
        id $pk,
        projeto_id $int NOT NULL,
        nome {$vc(160)} NOT NULL,
        data $data,
        concluido $bool,
        ordem $int NOT NULL DEFAULT 0
    )$fim";

    // ---------- OKRs ----------
    $t[] = "CREATE TABLE IF NOT EXISTS objetivos (
        id $pk,
        setor {$vc(60)},
        titulo {$vc(240)} NOT NULL,
        periodo {$vc(20)},
        criado_em $dt NOT NULL DEFAULT $agora,
        excluido_em $dt
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS resultados_chave (
        id $pk,
        objetivo_id $int NOT NULL,
        titulo {$vc(240)} NOT NULL,
        alvo $int NOT NULL DEFAULT 100,
        atual $int NOT NULL DEFAULT 0,
        unidade {$vc(20)}
    )$fim";

    $t[] = "CREATE TABLE IF NOT EXISTS projeto_resultados (
        projeto_id $int NOT NULL,
        resultado_id $int NOT NULL,
        PRIMARY KEY (projeto_id, resultado_id)
    )$fim";

    // ---------- Anexos ----------
    $t[] = "CREATE TABLE IF NOT EXISTS anexos (
        id $pk,
        alvo_tipo {$vc(12)} NOT NULL,
        alvo_id $int NOT NULL,
        nome {$vc(240)} NOT NULL,
        mime {$vc(120)},
        tamanho $int,
        arquivo {$vc(80)} NOT NULL,
        membro_id $int,
        criado_em $dt NOT NULL DEFAULT $agora
    )$fim";

    return $t;
}

// Índices, separados das tabelas porque o MySQL não aceita
// "CREATE INDEX IF NOT EXISTS" — lá eles vão dentro de try/catch.
function indices_erp(bool $sqlite): array
{
    $se = $sqlite ? 'IF NOT EXISTS ' : '';
    return [
        "CREATE INDEX {$se}idx_tarefa_projeto ON tarefas(projeto_id, status_id)",
        "CREATE INDEX {$se}idx_tarefa_pai ON tarefas(tarefa_pai_id)",
        "CREATE INDEX {$se}idx_resp_membro ON tarefa_responsaveis(membro_id)",
        "CREATE INDEX {$se}idx_doc_pai ON documentos(pai_id)",
        "CREATE INDEX {$se}idx_versao_doc ON documento_versoes(documento_id)",
        "CREATE INDEX {$se}idx_coment_alvo ON comentarios(alvo_tipo, alvo_id)",
        "CREATE INDEX {$se}idx_anexo_alvo ON anexos(alvo_tipo, alvo_id)",
        "CREATE INDEX {$se}idx_hist_tarefa ON tarefa_historico(tarefa_id)",
        "CREATE INDEX {$se}idx_projeto_setor ON projetos(setor)",
    ];
}

// Colunas acrescentadas a tabelas que já existiam.
function colunas_extras_erp(bool $sqlite): array
{
    return [
        // Liga a hora lançada à tarefa — é o que junta os dois módulos num ERP só.
        'registros.tarefa_id' => $sqlite ? 'INTEGER' : 'INT NULL',
    ];
}
