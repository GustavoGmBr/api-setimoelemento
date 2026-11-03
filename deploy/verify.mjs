// Consultas sem registros e teste de login/listagem FTP, sem alterar dados.
// Executar a partir de /opt/setimoelemento-api: node deploy/verify.mjs
import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import { Client } from 'basic-ftp'

const prisma = new PrismaClient({ log: [] })
let failed = false
try {
  for (const model of Prisma.dmmf.datamodel.models) {
    const quote = (name) => '`' + name.replaceAll('`', '``') + '`'
    const columns = model.fields.filter((f) => f.kind !== 'object').map((f) => quote(f.dbName || f.name)).join(', ')
    try {
      await prisma.$queryRawUnsafe(`SELECT ${columns} FROM ${quote(model.dbName || model.name)} LIMIT 0`)
      console.log(`MySQL ${model.name}: OK`)
    } catch (error) {
      failed = true
      console.error(`MySQL ${model.name}: FALHOU (${error.code || 'erro'})`)
    }
  }
} finally {
  await prisma.$disconnect()
}

const ftp = new Client(15000)
try {
  await ftp.access({
    host: process.env.FTP_HOST, user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD, secure: process.env.FTP_SECURE === 'true',
  })
  await ftp.list('/')
  console.log('FTP da hospedagem: login e listagem OK')
} catch (error) {
  failed = true
  console.error(`FTP da hospedagem: FALHOU (${error.code || 'conexao'})`)
} finally {
  ftp.close()
}
process.exitCode = failed ? 1 : 0
