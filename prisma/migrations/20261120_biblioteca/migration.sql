-- Biblioteca: capa e ordem da saga; rascunho/publicado em livros e capítulos
ALTER TABLE `sagas` ADD COLUMN `capa` VARCHAR(500) NULL,
  ADD COLUMN `ordem` INTEGER NULL;

ALTER TABLE `livros` ADD COLUMN `publicado` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `capitulos` ADD COLUMN `publicado` BOOLEAN NOT NULL DEFAULT true;
