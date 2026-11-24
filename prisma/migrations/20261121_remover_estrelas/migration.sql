-- Remove os campos do antigo sistema de estrelas de Erion.
-- Rode DEPOIS de 20261121_peso_pc e depois de `npm run fundir:estrelas -- --aplicar`.
ALTER TABLE `personagem_historico` DROP COLUMN `subnivel`;
ALTER TABLE `bestiario` DROP COLUMN `subnivel`;
ALTER TABLE `sistemas` DROP COLUMN `estrela_fixa`;
