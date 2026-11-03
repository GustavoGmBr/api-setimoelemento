import { Router } from 'express'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { criaturaSchema } from './bestiario.schemas.js'

const resumo = { id: true, nome: true, tipo: true, mundo: true, ranque: true, imagemBestiario: true, sistema_id: true, sistema: { select: { id: true, nome: true } } } as const

/** Leitura pública: GET /api/bestiario */
export const bestiarioPublico = Router()

bestiarioPublico.get('/', async (_req, res) => {
  res.json(await prisma.bestiario.findMany({ orderBy: { nome: 'asc' }, select: resumo }))
})

bestiarioPublico.get('/:id', async (req, res) => {
  const criatura = await prisma.bestiario.findUnique({
    where: { id: idDaRota(req) },
    include: { sistema: { select: { id: true, nome: true } }, recursos: { orderBy: { id: 'asc' }, include: { item: { select: { id_item: true, nome: true, tipo: true, ranque: true, descricao: true } } } } },
  })
  if (!criatura) throw naoEncontrado('Criatura')
  res.json(criatura)
})

/** Escrita (autor): /api/private/bestiario */
export const bestiarioPrivado = Router()
bestiarioPrivado.use(autenticar)

async function validar(dados: ReturnType<typeof criaturaSchema.parse>, ignorarId?: number) {
  if (dados.sistema_id !== null && !(await prisma.sistemas.findUnique({ where: { id: dados.sistema_id }, select: { id: true } }))) throw new HttpError(400, 'Sistema não encontrado')
  const ids = [...new Set(dados.recursos.map((r) => r.item_id).filter((i): i is number => i !== null))]
  if (ids.length) {
    // só itens do tipo "item" (consumível, material, item chave) servem de recurso
    const validos = await prisma.itens.count({ where: { id_item: { in: ids }, categoria: 'item' } })
    if (validos !== ids.length) throw new HttpError(400, 'Os recursos cadastrados precisam ser itens (não equipamentos)')
  }
  const repetida = await prisma.bestiario.findFirst({ where: { nome: dados.nome, ...(ignorarId !== undefined ? { NOT: { id: ignorarId } } : {}) }, select: { id: true } })
  if (repetida) throw new HttpError(409, `Já existe a criatura "${dados.nome}"`)
}

const incluir = { recursos: { orderBy: { id: 'asc' }, include: { item: { select: { id_item: true, nome: true, tipo: true, ranque: true, descricao: true } } } } } as const

function dadosDaCriatura(d: ReturnType<typeof criaturaSchema.parse>) {
  const { recursos, ...resto } = d
  return { resto, recursos: recursos.map((r) => ({ item_id: r.item_id, nome: r.nome, descricao: r.descricao })) }
}

bestiarioPrivado.post('/', async (req, res) => {
  const dados = criaturaSchema.parse(req.body)
  await validar(dados)
  const { resto, recursos } = dadosDaCriatura(dados)
  res.status(201).json(await prisma.bestiario.create({ data: { ...resto, recursos: { create: recursos } }, include: incluir }))
})

bestiarioPrivado.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = criaturaSchema.parse(req.body)
  if (!(await prisma.bestiario.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado('Criatura')
  await validar(dados, id)
  const { resto, recursos } = dadosDaCriatura(dados)
  res.json(await prisma.bestiario.update({ where: { id }, data: { ...resto, recursos: { deleteMany: {}, create: recursos } }, include: incluir }))
})

bestiarioPrivado.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  if (!(await prisma.bestiario.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado('Criatura')
  await prisma.bestiario.delete({ where: { id } })
  res.status(204).end()
})
