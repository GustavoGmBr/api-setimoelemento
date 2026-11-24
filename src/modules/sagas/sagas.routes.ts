import { Router } from 'express'
import { naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { removerArquivo } from '../../services/ftp.js'
import { comContagem, livroLeve, porOrdem } from '../biblioteca/biblioteca.service.js'
import { reordenarSagasSchema, sagaSchema } from './sagas.schemas.js'

/** Leitura pública: GET /api/sagas */
export const sagasPublicas = Router()

sagasPublicas.get('/', async (_req, res) => {
  const sagas = await prisma.sagas.findMany({ include: { _count: { select: { livros: { where: { publicado: true } } } } } })
  res.json(sagas.filter((s) => s._count.livros > 0).sort(porOrdem))
})

sagasPublicas.get('/:id', async (req, res) => {
  const saga = await prisma.sagas.findUnique({
    where: { id: idDaRota(req) },
    include: { livros: { where: { publicado: true }, select: livroLeve } },
  })
  if (!saga) throw naoEncontrado('Saga')
  const livros = saga.livros
    .map((l) => comContagem(l, true))
    .sort((a, b) => porOrdem({ ordem: a.ordem_serie, id: a.id }, { ordem: b.ordem_serie, id: b.id }))
  res.json({ ...saga, livros })
})

/** Escrita (autor): /api/private/sagas */
export const sagasPrivadas = Router()
sagasPrivadas.use(autenticar)

sagasPrivadas.get('/', async (_req, res) => {
  const sagas = await prisma.sagas.findMany({ include: { _count: { select: { livros: true } } } })
  res.json(sagas.sort(porOrdem))
})

sagasPrivadas.post('/', async (req, res) => {
  const dados = sagaSchema.parse(req.body)
  if (dados.ordem == null) {
    const ultima = await prisma.sagas.aggregate({ _max: { ordem: true } })
    dados.ordem = (ultima._max.ordem ?? 0) + 1
  }
  res.status(201).json(await prisma.sagas.create({ data: dados }))
})

/** Define a ordem das sagas de uma vez. Vem antes de /:id para não ser lida como id. */
sagasPrivadas.put('/reordenar', async (req, res) => {
  const { itens } = reordenarSagasSchema.parse(req.body)
  await prisma.$transaction(itens.map((i) => prisma.sagas.update({ where: { id: i.id }, data: { ordem: i.ordem } })))
  res.status(204).end()
})

sagasPrivadas.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const antes = await prisma.sagas.findUnique({ where: { id }, select: { capa: true } })
  if (!antes) throw naoEncontrado('Saga')
  const saga = await prisma.sagas.update({ where: { id }, data: sagaSchema.parse(req.body) })
  if (antes.capa && antes.capa !== saga.capa) await removerArquivo(antes.capa) // capa trocada ou removida
  res.json(saga)
})

sagasPrivadas.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const antes = await prisma.sagas.findUnique({ where: { id }, select: { capa: true } })
  if (!antes) throw naoEncontrado('Saga')
  await prisma.sagas.delete({ where: { id } })
  await removerArquivo(antes.capa)
  res.status(204).end()
})
