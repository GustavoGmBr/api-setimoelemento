import { Router } from 'express'
import { naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { sagaSchema } from './sagas.schemas.js'

/** Leitura pública: GET /api/sagas */
export const sagasPublicas = Router()

sagasPublicas.get('/', async (_req, res) => {
  res.json(
    await prisma.sagas.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { livros: true } } },
    }),
  )
})

sagasPublicas.get('/:id', async (req, res) => {
  const saga = await prisma.sagas.findUnique({
    where: { id: idDaRota(req) },
    include: { livros: { orderBy: { ordem_serie: 'asc' } } },
  })
  if (!saga) throw naoEncontrado('Saga')
  res.json(saga)
})

/** Escrita (autor): /api/private/sagas */
export const sagasPrivadas = Router()
sagasPrivadas.use(autenticar)

sagasPrivadas.post('/', async (req, res) => {
  res.status(201).json(await prisma.sagas.create({ data: sagaSchema.parse(req.body) }))
})

sagasPrivadas.put('/:id', async (req, res) => {
  res.json(await prisma.sagas.update({ where: { id: idDaRota(req) }, data: sagaSchema.parse(req.body) }))
})

sagasPrivadas.delete('/:id', async (req, res) => {
  await prisma.sagas.delete({ where: { id: idDaRota(req) } })
  res.status(204).end()
})
