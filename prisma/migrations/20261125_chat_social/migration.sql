-- Chat social: amizades, salas privadas (só entre amigos) e mensagens de sala.
CREATE TABLE `chat_amizades` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `de_id` INT NOT NULL,
  `para_id` INT NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'pendente',
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `chat_amizades_de_id_para_id_key`(`de_id`, `para_id`),
  INDEX `chat_amizades_para_id_idx`(`para_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `chat_salas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(60) NOT NULL,
  `dono_id` INT NOT NULL,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `chat_salas_dono_id_idx`(`dono_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `chat_sala_membros` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sala_id` INT NOT NULL,
  `leitor_id` INT NOT NULL,
  `visto_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `chat_sala_membros_sala_id_leitor_id_key`(`sala_id`, `leitor_id`),
  INDEX `chat_sala_membros_leitor_id_idx`(`leitor_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `chat_mensagens` ADD COLUMN `sala_id` INT NULL;
CREATE INDEX `chat_mensagens_sala_id_id_idx` ON `chat_mensagens`(`sala_id`, `id`);

ALTER TABLE `chat_amizades` ADD CONSTRAINT `chat_amizades_de_id_fkey` FOREIGN KEY (`de_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_amizades` ADD CONSTRAINT `chat_amizades_para_id_fkey` FOREIGN KEY (`para_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_salas` ADD CONSTRAINT `chat_salas_dono_id_fkey` FOREIGN KEY (`dono_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_sala_membros` ADD CONSTRAINT `chat_sala_membros_sala_id_fkey` FOREIGN KEY (`sala_id`) REFERENCES `chat_salas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_sala_membros` ADD CONSTRAINT `chat_sala_membros_leitor_id_fkey` FOREIGN KEY (`leitor_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_mensagens` ADD CONSTRAINT `chat_mensagens_sala_id_fkey` FOREIGN KEY (`sala_id`) REFERENCES `chat_salas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
