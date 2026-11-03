import { Router } from 'express'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { itemSchema } from './itens.schemas.js'

const resumo = {
  id_item: true,
  nome: true,
  tipo: true,
  categoria: true,
  mundo: true,
  ranque: true,
  descricao: true,
  urlImagem: true,
  sistema_id: true,
  sistema: { select: { id: true, nome: true } },
} as const

/** Leitura pública: GET /api/itens */
export const itensPublicos = Router()

itensPublicos.get('/', async (_req, res) => {
  res.json(await prisma.itens.findMany({ orderBy: [{ categoria: 'asc' }, { nome: 'asc' }], select: resumo }))
})

itensPublicos.get('/:id', async (req, res) => {
  const item = await prisma.itens.findUnique({ where: { id_item: idDaRota(req) }, include: { sistema: { select: { id: true, nome: true } } } })
  if (!item) throw naoEncontrado('Item')
  res.json(item)
})

/** Escrita (autor): /api/private/itens */
export const itensPrivados = Router()
itensPrivados.use(autenticar)

async function validar(dados: ReturnType<typeof itemSchema.parse>, ignorarId?: number) {
  if (dados.sistema_id !== null && !(await prisma.sistemas.findUnique({ where: { id: dados.sistema_id }, select: { id: true } }))) throw new HttpError(400, 'Sistema não encontrado')
  const repetido = await prisma.itens.findFirst({ where: { nome: dados.nome, categoria: dados.categoria, ...(ignorarId !== undefined ? { NOT: { id_item: ignorarId } } : {}) }, select: { id_item: true } })
  if (repetido) throw new HttpError(409, `Já existe ${dados.categoria === 'equipamento' ? 'o equipamento' : 'o item'} "${dados.nome}"`)
}

itensPrivados.post('/', async (req, res) => {
  const dados = itemSchema.parse(req.body)
  await validar(dados)
  res.status(201).json(await prisma.itens.create({ data: dados }))
})

itensPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = itemSchema.parse(req.body)
  if (!(await prisma.itens.findUnique({ where: { id_item: id }, select: { id_item: true } }))) throw naoEncontrado('Item')
  await validar(dados, id)
  res.json(await prisma.itens.update({ where: { id_item: id }, data: dados }))
})

itensPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const usos = await prisma.inventarios.count({ where: { itensId_item: id } })
  const recursos = await prisma.bestiario_recursos.count({ where: { item_id: id } })
  if (recursos > 0) throw new HttpError(409, `Este item é recurso de ${recursos} ${recursos === 1 ? 'criatura' : 'criaturas'} e não pode ser excluído.`)
  if (usos > 0) throw new HttpError(409, `Este item está em ${usos} ${usos === 1 ? 'bolsa' : 'bolsas'} e não pode ser excluído.`)
  await prisma.itens.delete({ where: { id_item: id } })
  res.status(204).end()
})
