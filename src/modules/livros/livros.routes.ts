import { Router } from 'express'
import { naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { removerArquivo } from '../../services/ftp.js'
import { filtroLivrosSchema, livroSchema } from './livros.schemas.js'

/** Leitura pública: GET /api/livros */
export const livrosPublicos = Router()

livrosPublicos.get('/', async (req, res) => {
  const { saga_id } = filtroLivrosSchema.parse(req.query)
  res.json(
    await prisma.livros.findMany({
      where: saga_id ? { saga_id } : {},
      orderBy: [{ saga_id: 'asc' }, { ordem_serie: 'asc' }, { id: 'asc' }],
      include: { saga: { select: { nome: true } }, _count: { select: { capitulos: true } } },
    }),
  )
})

livrosPublicos.get('/:id', async (req, res) => {
  const livro = await prisma.livros.findUnique({
    where: { id: idDaRota(req) },
    include: {
      saga: true,
      // só capítulos; subcapítulos têm parent_id e são buscados pelo capítulo
      capitulos: {
        where: { parent_id: null },
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

livrosPrivados.post('/', async (req, res) => {
  res.status(201).json(await prisma.livros.create({ data: livroSchema.parse(req.body) }))
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
