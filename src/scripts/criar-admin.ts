/**
 * Cria (ou atualiza a senha de) um usuário.
 *   ADMIN_SENHA='sua-senha' npm run criar-admin -- seu_login [nivel]
 * A senha vem de variável de ambiente para não ficar no histórico do terminal.
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'

const [login, nivelArg] = process.argv.slice(2)
const senha = process.env.ADMIN_SENHA
const nivel = nivelArg ? Number(nivelArg) : 1

if (!login || !senha || senha.length < 8 || !Number.isInteger(nivel)) {
  console.error("Uso: ADMIN_SENHA='senha-com-8+-caracteres' npm run criar-admin -- <login> [nivel]")
  process.exit(1)
}

const hash = await bcrypt.hash(senha, 12)
const usuario = await prisma.usuarios.upsert({
  where: { login },
  update: { senha: hash, nivel_acesso: nivel },
  create: { login, senha: hash, nivel_acesso: nivel },
})
console.log(`Usuário "${usuario.login}" pronto (nível ${usuario.nivel_acesso}).`)
await prisma.$disconnect()
