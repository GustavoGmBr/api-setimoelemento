import { Router } from 'express'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { sistemaSchema } from './sistemas.schemas.js'

/** Leitura pública: GET /api/sistemas */
export const sistemasPublicos = Router()

sistemasPublicos.get('/', async (_req, res) => {
  res.json(await prisma.sistemas.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { racas: true } } } }))
})

sistemasPublicos.get('/:id', async (req, res) => {
  const sistema = await prisma.sistemas.findUnique({ where: { id: idDaRota(req) }, include: { racas: { orderBy: { nome: 'asc' } } } })
  if (!sistema) throw naoEncontrado('Sistema')
  res.json(sistema)
})

/** Escrita (autor): /api/private/sistemas */
export const sistemasPrivados = Router()
sistemasPrivados.use(autenticar)

async function nomeLivre(nome: string, ignorarId?: number) {
  const outro = await prisma.sistemas.findUnique({ where: { nome }, select: { id: true } })
  if (outro && outro.id !== ignorarId) throw new HttpError(409, `Já existe um sistema chamado "${nome}"`)
}

sistemasPrivados.post('/', async (req, res) => {
  const dados = sistemaSchema.parse(req.body)
  await nomeLivre(dados.nome)
  res.status(201).json(await prisma.sistemas.create({ data: dados }))
})

sistemasPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = sistemaSchema.parse(req.body)
  await nomeLivre(dados.nome, id)
  res.json(await prisma.sistemas.update({ where: { id }, data: dados }))
})

sistemasPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const racas = await prisma.racas.count({ where: { sistema_id: id } })
  if (racas > 0) throw new HttpError(409, `Este sistema é usado por ${racas} ${racas === 1 ? 'raça' : 'raças'}. Mude ou exclua essas raças primeiro.`)
  await prisma.sistemas.delete({ where: { id } })
  res.status(204).end()
})
