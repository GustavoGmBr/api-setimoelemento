-- Chat dos leitores (sala pública + conversas privadas); as mensagens expiram em 24h.
CREATE TABLE `chat_mensagens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `autor_id` INT NOT NULL,
  `destinatario_id` INT NULL,
  `texto` VARCHAR(1000) NOT NULL,
  `tipo` VARCHAR(10) NOT NULL DEFAULT 'texto',
  `midia_url` VARCHAR(500) NULL,
  `marcacoes` JSON NULL,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expira_em` DATETIME(3) NOT NULL,
  INDEX `chat_mensagens_destinatario_id_id_idx`(`destinatario_id`, `id`),
  INDEX `chat_mensagens_autor_id_destinatario_id_id_idx`(`autor_id`, `destinatario_id`, `id`),
  INDEX `chat_mensagens_expira_em_idx`(`expira_em`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `chat_vistos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `leitor_id` INT NOT NULL,
  `outro_id` INT NOT NULL,
  `visto_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `chat_vistos_leitor_id_outro_id_key`(`leitor_id`, `outro_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `chat_mensagens` ADD CONSTRAINT `chat_mensagens_autor_id_fkey` FOREIGN KEY (`autor_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_mensagens` ADD CONSTRAINT `chat_mensagens_destinatario_id_fkey` FOREIGN KEY (`destinatario_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_vistos` ADD CONSTRAINT `chat_vistos_leitor_id_fkey` FOREIGN KEY (`leitor_id`) REFERENCES `leitores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
