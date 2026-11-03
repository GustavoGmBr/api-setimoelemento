import { Router } from 'express'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { racaSchema } from './racas.schemas.js'

/** Leitura pública: GET /api/racas */
export const racasPublicas = Router()

racasPublicas.get('/', async (_req, res) => {
  res.json(
    await prisma.racas.findMany({
      orderBy: [{ mundo: 'asc' }, { nome: 'asc' }],
      include: { sistema: { select: { id: true, nome: true } }, _count: { select: { historicos: true } } },
    }),
  )
})

racasPublicas.get('/:id', async (req, res) => {
  const raca = await prisma.racas.findUnique({ where: { id: idDaRota(req) }, include: { sistema: true } })
  if (!raca) throw naoEncontrado('Raça')
  res.json(raca)
})

/** Escrita (autor): /api/private/racas */
export const racasPrivadas = Router()
racasPrivadas.use(autenticar)

async function validar(dados: ReturnType<typeof racaSchema.parse>, ignorarId?: number) {
  const sistema = await prisma.sistemas.findUnique({ where: { id: dados.sistema_id }, select: { id: true } })
  if (!sistema) throw new HttpError(400, 'Sistema não encontrado')
  const repetida = await prisma.racas.findFirst({ where: { nome: dados.nome, mundo: dados.mundo, ...(ignorarId !== undefined ? { NOT: { id: ignorarId } } : {}) }, select: { id: true } })
  if (repetida) throw new HttpError(409, `Já existe a raça "${dados.nome}" em ${dados.mundo}`)
}

racasPrivadas.post('/', async (req, res) => {
  const dados = racaSchema.parse(req.body)
  await validar(dados)
  res.status(201).json(await prisma.racas.create({ data: dados }))
})

racasPrivadas.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = racaSchema.parse(req.body)
  await validar(dados, id)
  res.json(await prisma.racas.update({ where: { id }, data: dados }))
})

racasPrivadas.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const usos = await prisma.personagem_historico.count({ where: { raca_id: id } })
  if (usos > 0) throw new HttpError(409, `Esta raça está em ${usos} ${usos === 1 ? 'histórico' : 'históricos'} de personagens e não pode ser excluída.`)
  await prisma.racas.delete({ where: { id } })
  res.status(204).end()
})
