import { criarApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'

const servidor = criarApp().listen(env.PORT, env.HOST, () => {
  console.log(`API no ar: http://localhost:${env.PORT}/api (${env.NODE_ENV})`)
})

async function encerrar(sinal: string) {
  console.log(`${sinal} recebido, encerrando...`)
  servidor.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}
process.on('SIGTERM', () => void encerrar('SIGTERM'))
process.on('SIGINT', () => void encerrar('SIGINT'))
