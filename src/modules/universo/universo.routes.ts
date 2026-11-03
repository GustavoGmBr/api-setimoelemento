import { Router } from 'express'
import { naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { removerArquivo } from '../../services/ftp.js'
import { localSchema } from './locais.schemas.js'

/** Listas básicas usadas pelo cadastro de capítulos, além da ficha completa de cada local. */
export const locaisPublicos = Router()

function listaDeImagens(valor: unknown, capa: string | null): string[] {
  if (Array.isArray(valor)) {
    const lista = valor.filter((item): item is string => typeof item === 'string' && item.length > 0)
    if (lista.length) return lista
  }
  return capa ? [capa] : []
}

locaisPublicos.get('/', async (_req, res) => {
  res.json(await prisma.locais.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true, mundo: true } }))
})

locaisPublicos.get('/:id', async (req, res) => {
  const local = await prisma.locais.findUnique({ where: { id: idDaRota(req) } })
  if (!local) throw naoEncontrado('Local')
  res.json({ ...local, imagens: listaDeImagens(local.imagens, local.imagem) })
})

/** Escrita do catálogo: /api/private/locais */
export const locaisPrivados = Router()
locaisPrivados.use(autenticar)

locaisPrivados.get('/', async (_req, res) => {
  const locais = await prisma.locais.findMany({ orderBy: { nome: 'asc' } })
  res.json(locais.map((local) => ({ ...local, imagens: listaDeImagens(local.imagens, local.imagem) })))
})

locaisPrivados.post('/', async (req, res) => {
  const dados = localSchema.parse(req.body)
  const local = await prisma.locais.create({
    data: { nome: dados.nome, mundo: dados.mundo, dimensao: dados.dimensao, descricao: dados.descricao, imagens: dados.imagens, imagem: dados.imagens[0] ?? null },
  })
  res.status(201).json({ ...local, imagens: dados.imagens })
})

locaisPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const dados = localSchema.parse(req.body)
  const anterior = await prisma.locais.findUnique({ where: { id } })
  if (!anterior) throw naoEncontrado('Local')
  const local = await prisma.locais.update({
    where: { id },
    data: { nome: dados.nome, mundo: dados.mundo, dimensao: dados.dimensao, descricao: dados.descricao, imagens: dados.imagens, imagem: dados.imagens[0] ?? null },
  })
  const atuais = new Set(dados.imagens)
  const antigas = new Set([...listaDeImagens(anterior.imagens, anterior.imagem), ...(anterior.imagem ? [anterior.imagem] : [])])
  for (const url of antigas) if (!atuais.has(url)) await removerArquivo(url)
  res.json({ ...local, imagens: dados.imagens })
})

locaisPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const local = await prisma.locais.findUnique({ where: { id } })
  if (!local) throw naoEncontrado('Local')
  await prisma.locais.delete({ where: { id } })
  const imagens = new Set([...listaDeImagens(local.imagens, local.imagem), ...(local.imagem ? [local.imagem] : [])])
  for (const url of imagens) await removerArquivo(url)
  res.status(204).end()
})
