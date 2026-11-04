import { Router } from 'express'
import { z } from 'zod'
import { naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { removerArquivo } from '../../services/ftp.js'
import { personagemSchema } from './personagens.schemas.js'
import { formaSchema } from './formas.schemas.js'

/** Campos da lista (cartões e seletores). */
const resumo = {
  id: true,
  nome: true,
  apelido: true,
  sexo: true,
  mundo_origem: true,
  afiliacao: true,
  imagemRosto: true,
} as const

/** Leitura pública: /api/personagens */
export const personagensPublicos = Router()

personagensPublicos.get('/', async (_req, res) => {
  res.json(await prisma.personagens.findMany({ orderBy: { nome: 'asc' }, select: resumo }))
})

personagensPublicos.get('/:id', async (req, res) => {
  const personagem = await prisma.personagens.findUnique({
    where: { id: idDaRota(req) },
    include: { formas: { orderBy: { nome: 'asc' } } },
  })
  if (!personagem) throw naoEncontrado('Personagem')
  res.json(personagem)
})

/** Ficha completa: personagem + formas + históricos (momentos da história) + bolsa de cada momento. */
personagensPublicos.get('/:id/ficha', async (req, res) => {
  const id = idDaRota(req)
  const personagem = await prisma.personagens.findUnique({
    where: { id },
    include: {
      formas: { orderBy: { nome: 'asc' } },
      historicos: {
        orderBy: { id: 'asc' },
        include: {
          raca: { select: { id: true, nome: true } },
          livro: { select: { id: true, titulo: true, saga: { select: { nome: true } } } },
          capitulo: { select: { id: true, numero: true, titulo: true } },
        },
      },
    },
  })
  if (!personagem) throw naoEncontrado('Personagem')

  const historicoIds = personagem.historicos.map((h) => h.id)
  const bolsas = historicoIds.length
    ? await prisma.bolsas.findMany({
        where: { historico_id: { in: historicoIds } },
        include: { inventarios: { orderBy: { id: 'asc' }, include: { itens: { select: { id_item: true, nome: true } } } } },
      })
    : []

  res.json({ ...personagem, bolsas })
})

/** Escrita (autor): /api/private/personagens */
export const personagensPrivados = Router()
personagensPrivados.use(autenticar)

personagensPrivados.get('/exportacao', async (_req, res) => {
  const personagens = await prisma.personagens.findMany({
    orderBy: { nome: 'asc' },
    include: { historicos: { orderBy: { id: 'desc' }, take: 1, select: { resumo: true } } },
  })
  res.json(personagens.map(({ historicos, ...personagem }) => ({ ...personagem, resumo_mais_recente: historicos[0]?.resumo ?? null })))
})

personagensPrivados.post('/', async (req, res) => {
  res.status(201).json(await prisma.personagens.create({ data: personagemSchema.parse(req.body) }))
})

personagensPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const antes = await prisma.personagens.findUnique({ where: { id }, select: { imagemRosto: true, imagemCorpo: true } })
  const personagem = await prisma.personagens.update({ where: { id }, data: personagemSchema.parse(req.body) })
  // fotos trocadas ou removidas saem da hospedagem
  if (antes?.imagemRosto && antes.imagemRosto !== personagem.imagemRosto) await removerArquivo(antes.imagemRosto)
  if (antes?.imagemCorpo && antes.imagemCorpo !== personagem.imagemCorpo) await removerArquivo(antes.imagemCorpo)
  res.json(personagem)
})

personagensPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const antes = await prisma.personagens.findUnique({
    where: { id },
    select: { imagemRosto: true, imagemCorpo: true, formas: { select: { imagemRosto: true, imagemCorpo: true } } },
  })
  await prisma.personagens.delete({ where: { id } })
  const arquivos = [antes?.imagemRosto, antes?.imagemCorpo, ...(antes?.formas ?? []).flatMap((f) => [f.imagemRosto, f.imagemCorpo])]
  for (const url of arquivos) await removerArquivo(url)
  res.status(204).end()
})

const filtroFormas = z.object({ personagem_id: z.coerce.number().int().positive().optional() })

/** Formas públicas disponíveis para capítulos e fichas de leitura. */
export const formasPublicas = Router()

formasPublicas.get('/', async (req, res) => {
  const { personagem_id } = filtroFormas.parse(req.query)
  res.json(
    await prisma.personagem_forma.findMany({
      where: personagem_id ? { personagem_id } : {},
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, personagem_id: true, tipo: true, descricao: true, multiplicador: true, base_pc: true, padrao: true, antiga: true, imagemRosto: true, imagemCorpo: true },
    }),
  )
})

/** Gestão de formas pelo autor: /api/private/formas */
export const formasPrivadas = Router()
formasPrivadas.use(autenticar)

formasPrivadas.post('/', async (req, res) => {
  const dados = formaSchema.parse(req.body)
  const personagem = await prisma.personagens.findUnique({ where: { id: dados.personagem_id }, select: { id: true } })
  if (!personagem) throw naoEncontrado('Personagem')
  const { padrao, ...campos } = dados
  if (padrao) await prisma.personagem_forma.updateMany({ where: { personagem_id: dados.personagem_id, padrao: true }, data: { padrao: false, antiga: true } })
  res.status(201).json(await prisma.personagem_forma.create({ data: { ...campos, padrao, antiga: false } }))
})

formasPrivadas.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const atual = await prisma.personagem_forma.findUnique({ where: { id } })
  if (!atual) throw naoEncontrado('Forma')
  const dados = formaSchema.parse({ ...req.body, personagem_id: atual.personagem_id })
  const { padrao, ...campos } = dados
  if (padrao) await prisma.personagem_forma.updateMany({ where: { personagem_id: atual.personagem_id, id: { not: id }, padrao: true }, data: { padrao: false, antiga: true } })
  const forma = await prisma.personagem_forma.update({ where: { id }, data: { ...campos, padrao, ...(padrao ? { antiga: false } : {}) } })
  if (atual.imagemRosto && atual.imagemRosto !== forma.imagemRosto) await removerArquivo(atual.imagemRosto)
  if (atual.imagemCorpo && atual.imagemCorpo !== forma.imagemCorpo) await removerArquivo(atual.imagemCorpo)
  res.json(forma)
})

formasPrivadas.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const forma = await prisma.personagem_forma.findUnique({ where: { id }, select: { imagemRosto: true, imagemCorpo: true } })
  if (!forma) throw naoEncontrado('Forma')
  await prisma.personagem_forma.delete({ where: { id } })
  await removerArquivo(forma.imagemRosto)
  await removerArquivo(forma.imagemCorpo)
  res.status(204).end()
})
