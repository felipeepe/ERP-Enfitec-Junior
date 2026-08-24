<?php
// Cadastra/atualiza membros na lista de autorizados. Roda a migração antes.
//
// Uso:
//   php seed.php felipe.baseggio@enfitecjunior.com "Felipe Baseggio" membro
//   php seed.php ana.souza@enfitecjunior.com "Ana Souza" gestor senha123 "Comercial"
// Sem argumentos, cria um conjunto de exemplo.
declare(strict_types=1);

// Só por linha de comando. Publicado junto com a API, um GET em /api/seed.php
// reescreveria a senha do gestor para a senha de exemplo e reativaria a conta —
// repetível, mesmo depois de trocada.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/lib/bootstrap.php'; // $CONFIG, $PDO, helpers
require __DIR__ . '/migrar.php';             // garante que as tabelas existem

function upsert(PDO $pdo, string $email, string $nome, string $role, ?string $senha = null, bool $provisoria = false, ?string $setor = null): void
{
    $email = strtolower(trim($email));
    $role = $role === 'gestor' ? 'gestor' : 'membro';
    $hash = $senha ? password_hash($senha, PASSWORD_DEFAULT) : null;
    $prov = $provisoria ? 1 : 0;
    $marca = ($hash ? ($prov ? " [senha provisória]" : " [com senha]") : "") . ($setor ? " [$setor]" : "");

    $st = $pdo->prepare('SELECT id FROM membros WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetch()) {
        // Só sobrescreve senha e setor quando eles foram informados.
        $campos = ['nome = ?', 'role = ?', 'ativo = 1'];
        $params = [$nome, $role];
        if ($hash) {
            $campos[] = 'senha_hash = ?';
            $campos[] = 'senha_provisoria = ?';
            $params[] = $hash;
            $params[] = $prov;
        }
        if ($setor !== null) {
            $campos[] = 'setor = ?';
            $params[] = $setor;
        }
        $params[] = $email;
        $pdo->prepare('UPDATE membros SET ' . implode(', ', $campos) . ' WHERE email = ?')->execute($params);
        echo "  atualizado: $email ($role)$marca\n";
    } else {
        $pdo->prepare('INSERT INTO membros (email, nome, role, setor, ativo, senha_hash, senha_provisoria) VALUES (?, ?, ?, ?, 1, ?, ?)')
            ->execute([$email, $nome, $role, $setor, $hash, $prov]);
        echo "  criado: $email ($role)$marca\n";
    }
}

// Uso: php seed.php email "Nome" [membro|gestor] [senha] [setor]
$args = $argv ?? [];
if (count($args) >= 3) {
    // Senha definida por linha de comando entra como provisória (o usuário troca no 1º acesso).
    upsert($PDO, $args[1], $args[2], $args[3] ?? 'membro', $args[4] ?? null, isset($args[4]), $args[5] ?? null);
} else {
    echo "Cadastrando membros de exemplo:\n";
    // Conta de gestão: senha definitiva (TROQUE em produção). Não é provisória.
    upsert($PDO, 'enfitecjunior@gmail.com', 'Gestão ENFITEC', 'gestor', 'enfitec123', false, 'Gestão de Pessoas');
    // Membro de exemplo com senha PROVISÓRIA (troca no 1º acesso).
    upsert($PDO, 'felipe.baseggio@enfitecjunior.com', 'Felipe Baseggio', 'membro', 'senha123', true, 'Projetos');
}
