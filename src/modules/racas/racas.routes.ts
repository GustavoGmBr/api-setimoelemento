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
      include: { sistema: { select: { id: true, nome: true } }, sistemas_vinculados: { include: { sistema: { select: { id: true, nome: true } } } }, _count: { select: { historicos: true } } },
    }),
  )
})

racasPublicas.get('/:id', async (req, res) => {
  const raca = await prisma.racas.findUnique({ where: { id: idDaRota(req) }, include: { sistema: true, sistemas_vinculados: { include: { sistema: true } } } })
  if (!raca) throw naoEncontrado('Raça')
  res.json(raca)
})

/** Escrita (autor): /api/private/racas */
export const racasPrivadas = Router()
racasPrivadas.use(autenticar)

function idsDeSistema(dados: ReturnType<typeof racaSchema.parse>) {
  return [...new Set(dados.sistema_ids?.length ? dados.sistema_ids : [dados.sistema_id!])]
}

async function validar(dados: ReturnType<typeof racaSchema.parse>, ignorarId?: number) {
  const ids = idsDeSistema(dados)
  const sistemas = await prisma.sistemas.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (sistemas.length !== ids.length) throw new HttpError(400, 'Um ou mais sistemas não foram encontrados')
  const repetida = await prisma.racas.findFirst({ where: { nome: dados.nome, mundo: dados.mundo, ...(ignorarId !== undefined ? { NOT: { id: ignorarId } } : {}) }, select: { id: true } })
  if (repetida) throw new HttpError(409, `Já existe a raça "${dados.nome}" em ${dados.mundo}`)
}

racasPrivadas.post('/', async (req, res) => {
  const dados = racaSchema.parse(req.body)
  await validar(dados)
  const ids = idsDeSistema(dados)
  const raca = await prisma.$transaction(async (tx) => {
    const criada = await tx.racas.create({ data: { nome: dados.nome, base: dados.base, limite: dados.limite, mundo: dados.mundo, sistema_id: ids[0]! } })
    await tx.racas_sistemas.createMany({ data: ids.map((sistema_id) => ({ raca_id: criada.id, sistema_id })) })
    return criada
  })
  res.status(201).json(raca)
})

racasPrivadas.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = racaSchema.parse(req.body)
  await validar(dados, id)
  const ids = idsDeSistema(dados)
  const raca = await prisma.$transaction(async (tx) => {
    const atualizada = await tx.racas.update({ where: { id }, data: { nome: dados.nome, base: dados.base, limite: dados.limite, mundo: dados.mundo, sistema_id: ids[0]! } })
    await tx.racas_sistemas.deleteMany({ where: { raca_id: id } })
    await tx.racas_sistemas.createMany({ data: ids.map((sistema_id) => ({ raca_id: id, sistema_id })) })
    return atualizada
  })
  res.json(raca)
})

racasPrivadas.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const usos = await prisma.personagem_historico.count({ where: { raca_id: id } })
  if (usos > 0) throw new HttpError(409, `Esta raça está em ${usos} ${usos === 1 ? 'histórico' : 'históricos'} de personagens e não pode ser excluída.`)
  await prisma.racas.delete({ where: { id } })
  res.status(204).end()
})
