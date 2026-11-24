-- Peso de Erion e PC de Aetheris: renomeia as colunas SEM perder os valores.
-- Rode ESTE arquivo no banco ANTES de `prisma db push`
-- (o db push trataria a troca de nome como "apagar coluna + criar outra" e zeraria os dados).

ALTER TABLE `personagem_historico`
  CHANGE COLUMN `ponto_combate` `Peso_Aura` INT NOT NULL DEFAULT 0,
  CHANGE COLUMN `ponto_combateAetheris` `PC` INT NOT NULL DEFAULT 0;

ALTER TABLE `bestiario`
  CHANGE COLUMN `ponto_combate` `Peso_Aura` INT NOT NULL DEFAULT 0,
  CHANGE COLUMN `ponto_combateAetheris` `PC` INT NOT NULL DEFAULT 0;
