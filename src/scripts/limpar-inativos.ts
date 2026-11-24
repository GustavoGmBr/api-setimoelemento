import { limparInativos } from '../jobs/limpar-inativos.js'
import { prisma } from '../lib/prisma.js'

const total = await limparInativos()
console.log(`${total} conta(s) apagada(s).`)
await prisma.$disconnect()
