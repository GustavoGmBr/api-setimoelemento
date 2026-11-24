-- Perfil do leitor e controle de acesso (limpeza de contas inativas)
ALTER TABLE `leitores`
  ADD COLUMN `nome_exibicao` VARCHAR(60) NULL,
  ADD COLUMN `bio` VARCHAR(300) NULL,
  ADD COLUMN `avatar_url` VARCHAR(255) NULL,
  ADD COLUMN `ultimo_acesso` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX `leitores_ultimo_acesso_idx` ON `leitores`(`ultimo_acesso`);
