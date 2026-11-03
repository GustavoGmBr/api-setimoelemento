import { Router } from 'express'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { bolsaEdicaoSchema, bolsaSchema, inventarioSchema } from './inventarios.schemas.js'

const incluirItem = { itens: { select: { id_item: true, nome: true } } } as const
const incluirBolsa = { inventarios: { orderBy: { id: 'asc' }, include: incluirItem } } as const

/** Quantos itens ocupam espaço (moedas ficam de fora). */
const ocupados = (bolsaId: number, ignorarId?: number) =>
  prisma.inventarios.count({ where: { bolsa_id: bolsaId, OR: [{ tipo: null }, { tipo: { not: 'Moeda' } }], ...(ignorarId ? { id: { not: ignorarId } } : {}) } })

/** Bolsas por momento da história: /api/private/bolsas */
export const bolsasPrivadas = Router()
bolsasPrivadas.use(autenticar)

/** Cria a bolsa de um momento. Se o personagem já tinha uma bolsa antes, os itens dela vêm como ponto de partida. */
bolsasPrivadas.post('/', async (req, res) => {
  const dados = bolsaSchema.parse(req.body)
  const h = await prisma.personagem_historico.findUnique({ where: { id: dados.historico_id }, select: { id: true, personagem_id: true } })
  if (!h) throw new HttpError(400, 'Momento da história inválido')
  if (await prisma.bolsas.findUnique({ where: { historico_id: h.id }, select: { id: true } })) throw new HttpError(409, 'Este momento já tem uma bolsa')

  const anterior = await prisma.bolsas.findFirst({
    where: { historico: { personagem_id: h.personagem_id, id: { lt: h.id } } },
    orderBy: { historico_id: 'desc' },
    include: { inventarios: true },
  })
  const bolsa = await prisma.bolsas.create({
    data: {
      ...dados,
      // sem escolha do usuário, herda o tamanho da bolsa anterior
      slots: req.body?.slots === undefined && anterior ? anterior.slots : dados.slots,
      inventarios: {
        create: (anterior?.inventarios ?? []).map((i) => ({
          nome: i.nome,
          descricao: i.descricao,
          tipo: i.tipo,
          subtipo: i.subtipo,
          grau: i.grau,
          quantidade: i.quantidade,
          itensId_item: i.itensId_item,
        })),
      },
    },
    include: incluirBolsa,
  })
  res.status(201).json({ ...bolsa, herdada_de: anterior?.historico_id ?? null })
})

bolsasPrivadas.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = bolsaEdicaoSchema.parse(req.body)
  if (!(await prisma.bolsas.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado('Bolsa')
  if (dados.slots < (await ocupados(id))) throw new HttpError(400, 'A bolsa tem mais itens do que esse número de espaços')
  res.json(await prisma.bolsas.update({ where: { id }, data: dados, include: incluirBolsa }))
})

bolsasPrivadas.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  if (!(await prisma.bolsas.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado('Bolsa')
  await prisma.bolsas.delete({ where: { id } })
  res.status(204).end()
})

/** Itens das bolsas: /api/private/inventarios */
export const inventariosPrivados = Router()
inventariosPrivados.use(autenticar)

async function conferir(bolsaId: number, itemId: number | null, tipo: string | null, ignorarId?: number) {
  const bolsa = await prisma.bolsas.findUnique({ where: { id: bolsaId }, select: { id: true, slots: true, historico: { select: { capitulo_id: true } } } })
  if (!bolsa) throw new HttpError(400, 'Bolsa inválida')
  if (itemId !== null && !(await prisma.itens.findUnique({ where: { id_item: itemId }, select: { id_item: true } }))) throw new HttpError(400, 'Item do catálogo inválido')
  if (tipo !== 'Moeda' && (await ocupados(bolsaId, ignorarId)) >= bolsa.slots) throw new HttpError(400, 'A bolsa está cheia')
  return bolsa
}

inventariosPrivados.post('/', async (req, res) => {
  const { item_id, ...dados } = inventarioSchema.parse(req.body)
  const b = await conferir(dados.bolsa_id, item_id, dados.tipo)
  res.status(201).json(await prisma.inventarios.create({ data: { ...dados, capitulo_id: b.historico.capitulo_id, itensId_item: item_id }, include: incluirItem }))
})

inventariosPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const atual = await prisma.inventarios.findUnique({ where: { id }, select: { bolsa_id: true } })
  if (!atual?.bolsa_id) throw naoEncontrado('Item da bolsa')
  // o item não muda de bolsa
  const { item_id, bolsa_id: _b, ...dados } = inventarioSchema.parse({ ...req.body, bolsa_id: atual.bolsa_id })
  await conferir(atual.bolsa_id, item_id, dados.tipo, id)
  res.json(await prisma.inventarios.update({ where: { id }, data: { ...dados, itensId_item: item_id }, include: incluirItem }))
})

/** Consome unidades de um consumível: baixa a quantidade e retira o item da bolsa quando acabar. */
inventariosPrivados.post('/:id/consumir', async (req, res) => {
  const id = idDaRota(req)
  const qtd = Math.max(1, Number(req.body?.quantidade) || 1)
  const item = await prisma.inventarios.findUnique({ where: { id } })
  if (!item?.bolsa_id) throw naoEncontrado('Item da bolsa')
  const semAcento = (item.tipo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (semAcento !== 'consumivel') throw new HttpError(400, 'Só itens do tipo Consumível podem ser consumidos')
  const restante = Number(item.quantidade) - qtd
  if (restante < 0) throw new HttpError(400, 'Quantidade insuficiente')
  if (restante === 0) await prisma.inventarios.delete({ where: { id } })
  else await prisma.inventarios.update({ where: { id }, data: { quantidade: restante } })
  res.json({ nome: item.nome, consumido: qtd, restante })
})

inventariosPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  if (!(await prisma.inventarios.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado('Item da bolsa')
  await prisma.inventarios.delete({ where: { id } })
  res.status(204).end()
})
