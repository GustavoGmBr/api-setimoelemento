CREATE TABLE IF NOT EXISTS `racas_sistemas` (
  `raca_id` INTEGER NOT NULL,
  `sistema_id` INTEGER NOT NULL,
  INDEX `racas_sistemas_sistema_id_idx` (`sistema_id`),
  PRIMARY KEY (`raca_id`, `sistema_id`),
  CONSTRAINT `racas_sistemas_raca_id_fkey` FOREIGN KEY (`raca_id`) REFERENCES `racas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `racas_sistemas_sistema_id_fkey` FOREIGN KEY (`sistema_id`) REFERENCES `sistemas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `racas_sistemas` (`raca_id`, `sistema_id`)
SELECT `id`, `sistema_id` FROM `racas`;
