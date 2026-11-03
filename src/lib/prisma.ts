import { PrismaClient } from '@prisma/client'
import { emProducao } from '../config/env.js'

export const prisma = new PrismaClient({
  log: emProducao ? ['error'] : ['warn', 'error'],
})
