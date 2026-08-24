-- Estrutura do banco (MySQL/MariaDB) — importe no phpMyAdmin da UFRGS.

CREATE TABLE IF NOT EXISTS membros (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    email      VARCHAR(255) NOT NULL UNIQUE,
    nome       VARCHAR(255) NOT NULL,
    role       VARCHAR(20)  NOT NULL DEFAULT 'membro',   -- 'membro' ou 'gestor'
    setor      VARCHAR(60)  NULL,                        -- diretoria de atuação (uma por membro)
    ativo      TINYINT(1)   NOT NULL DEFAULT 1,
    senha_hash VARCHAR(255) NULL,                        -- hash da senha (todos os usuários)
    senha_provisoria TINYINT(1) NOT NULL DEFAULT 0,      -- 1 = precisa trocar no 1º acesso
    apelido    VARCHAR(60)  NULL,                        -- como a pessoa quer ser chamada
    bio        TEXT         NULL,
    telefone   VARCHAR(30)  NULL,
    cor_avatar VARCHAR(20)  NULL,                        -- usada quando não há foto
    foto       MEDIUMTEXT   NULL,                        -- data URI, já redimensionada no cliente
    criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registros (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    membro_id  INT          NOT NULL,
    data       DATE         NOT NULL,
    setor      VARCHAR(60)  NOT NULL,
    atividade  VARCHAR(80)  NOT NULL,
    minutos    INT          NOT NULL,
    descricao  TEXT         NULL,
    tipo_hora  VARCHAR(20)  NOT NULL DEFAULT 'tecnica',  -- tecnica|administrativa|evento|estudo
    projeto_id INT          NULL,                        -- só para hora técnica
    tarefa_id  INT          NULL,
    criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_membro_data (membro_id, data),
    CONSTRAINT fk_registro_membro FOREIGN KEY (membro_id)
        REFERENCES membros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
