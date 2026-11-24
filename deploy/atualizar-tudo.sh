#!/usr/bin/env bash
# Atualiza a API na VPS: codigo novo + migracoes do banco que ainda faltam + reinicio.
# Uso (como root): cd /opt/setimoelemento-api && git pull --ff-only && bash deploy/atualizar-tudo.sh
set -euo pipefail
test "$(id -u)" = 0
cd /opt/setimoelemento-api
export NODE_OPTIONS=--max-old-space-size=256

echo "== 1/4 Dependencias"
npm ci

# Consulta o banco: sai com 0 se a tabela (ou tabela+coluna) existe.
existe() {
  node --input-type=module -e '
    import "dotenv/config"
    import { PrismaClient } from "@prisma/client"
    const [t, c] = process.argv.slice(1)
    const p = new PrismaClient()
    const sql = c
      ? "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?"
      : "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?"
    const r = await p.$queryRawUnsafe(sql, ...(c ? [t, c] : [t]))
    await p.$disconnect()
    process.exit(Number(r[0].n) > 0 ? 0 : 1)
  ' -- "$@"
}
aplicar() {
  echo "   aplicando $1"
  npx prisma db execute --schema prisma/schema.prisma --file "prisma/migrations/$1/migration.sql"
}

echo "== 2/4 Banco (so o que falta)"
existe sagas capa            || aplicar 20261120_biblioteca
existe racas_sistemas        || aplicar 20261107_add_raca_sistemas
existe bestiario Peso_Aura   || aplicar 20261121_peso_pc
if existe bestiario subnivel; then
  echo "   fundindo estrelas no Peso"
  npm run fundir:estrelas -- --aplicar
  aplicar 20261121_remover_estrelas
fi
existe bestiario informacoes_complementares || aplicar 20261122_bestiario_informacoes
existe leitores avatar_url   || aplicar 20261123_leitores_perfil
existe chat_mensagens        || aplicar 20261124_chat
existe chat_amizades         || aplicar 20261125_chat_social

echo "== 3/4 Build e reinicio"
bash deploy/update.sh
echo "== 4/4 Concluido"
