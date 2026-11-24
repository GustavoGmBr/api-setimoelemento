import { Router } from 'express'
import { naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { removerArquivo } from '../../services/ftp.js'
import { comContagem, livroLeve } from '../biblioteca/biblioteca.service.js'
import { filtroLivrosSchema, livroSchema, reordenarLivrosSchema } from './livros.schemas.js'

const ordenacao = [{ saga_id: 'asc' }, { ordem_serie: 'asc' }, { id: 'asc' }] as const

/** Leitura pública: GET /api/livros (só livros publicados) */
export const livrosPublicos = Router()

livrosPublicos.get('/', async (req, res) => {
  const { saga_id } = filtroLivrosSchema.parse(req.query)
  const livros = await prisma.livros.findMany({
    where: { publicado: true, ...(saga_id ? { saga_id } : {}) },
    orderBy: [...ordenacao],
    select: { ...livroLeve, saga: { select: { nome: true } } },
  })
  res.json(livros.map((l) => comContagem(l, true)))
})

livrosPublicos.get('/:id', async (req, res) => {
  const livro = await prisma.livros.findFirst({
    where: { id: idDaRota(req), publicado: true },
    include: {
      saga: true,
      // só capítulos publicados; subcapítulos têm parent_id e são buscados pelo capítulo
      capitulos: {
        where: { parent_id: null, publicado: true },
        orderBy: { numero: 'asc' },
        select: { id: true, numero: true, titulo: true },
      },
    },
  })
  if (!livro) throw naoEncontrado('Livro')
  res.json(livro)
})

/** Escrita (autor): /api/private/livros */
export const livrosPrivados = Router()
livrosPrivados.use(autenticar)

/** Todos os livros, inclusive rascunhos. */
livrosPrivados.get('/', async (_req, res) => {
  const livros = await prisma.livros.findMany({
    orderBy: [...ordenacao],
    select: { ...livroLeve, saga: { select: { nome: true } } },
  })
  res.json(livros.map((l) => comContagem(l, false)))
})

livrosPrivados.get('/:id', async (req, res) => {
  const livro = await prisma.livros.findUnique({ where: { id: idDaRota(req) }, include: { saga: true } })
  if (!livro) throw naoEncontrado('Livro')
  res.json(livro)
})

livrosPrivados.post('/', async (req, res) => {
  const dados = livroSchema.parse(req.body)
  if (dados.ordem_serie == null) {
    // entra no fim da saga (ou dos livros avulsos)
    const ultimo = await prisma.livros.aggregate({ where: { saga_id: dados.saga_id ?? null }, _max: { ordem_serie: true } })
    dados.ordem_serie = (ultimo._max.ordem_serie ?? 0) + 1
  }
  res.status(201).json(await prisma.livros.create({ data: dados }))
})

/** Move livros entre sagas e define a ordem de uma vez. Vem antes de /:id para não ser lida como id. */
livrosPrivados.put('/reordenar', async (req, res) => {
  const { itens } = reordenarLivrosSchema.parse(req.body)
  await prisma.$transaction(
    itens.map((i) => prisma.livros.update({ where: { id: i.id }, data: { saga_id: i.saga_id, ordem_serie: i.ordem_serie } })),
  )
  res.status(204).end()
})

livrosPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const antes = await prisma.livros.findUnique({ where: { id }, select: { capa: true } })
  const livro = await prisma.livros.update({ where: { id }, data: livroSchema.parse(req.body) })
  if (antes?.capa && antes.capa !== livro.capa) await removerArquivo(antes.capa) // capa trocada ou removida
  res.json(livro)
})

livrosPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const antes = await prisma.livros.findUnique({ where: { id }, select: { capa: true } })
  await prisma.livros.delete({ where: { id } })
  await removerArquivo(antes?.capa)
  res.status(204).end()
})
