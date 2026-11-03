import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/http-error.js'
import { autenticarLeitor } from '../../middlewares/auth.js'
import { limitarTentativas } from '../../middlewares/limitar-tentativas.js'

export const leitoresRoutes = Router()
const credenciais = z.object({ login: z.string().trim().min(3).max(100), senha: z.string().min(8).max(100) })
const id = z.coerce.number().int().positive()

async function sessao(leitor: { id: number; login: string }) {
  return {
    token: jwt.sign({ id_leitor: leitor.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] }),
    usuario: { id_leitor: leitor.id, login: leitor.login, tipo: 'leitor' as const },
  }
}

leitoresRoutes.post('/cadastro', limitarTentativas(5, 15 * 60 * 1000), async (req, res) => {
  const dados = credenciais.parse(req.body)
  const login = dados.login.toLowerCase()
  if (await prisma.leitores.findUnique({ where: { login } })) throw new HttpError(409, 'Este login já está em uso')
  const leitor = await prisma.leitores.create({ data: { login, senha: await bcrypt.hash(dados.senha, 12) }, select: { id: true, login: true } })
  res.status(201).json(await sessao(leitor))
})

leitoresRoutes.post('/login', limitarTentativas(10, 15 * 60 * 1000), async (req, res) => {
  const dados = credenciais.parse(req.body)
  const leitor = await prisma.leitores.findUnique({ where: { login: dados.login.toLowerCase() } })
  if (!leitor || !(await bcrypt.compare(dados.senha, leitor.senha))) throw new HttpError(401, 'Credenciais inválidas')
  res.json(await sessao(leitor))
})

leitoresRoutes.use(autenticarLeitor)
leitoresRoutes.get('/me', async (req, res) => {
  const leitor = await prisma.leitores.findUnique({ where: { id: req.leitor!.id_leitor }, select: { id: true, login: true } })
  if (!leitor) throw new HttpError(401, 'Conta de leitor não encontrada')
  res.json({ id_leitor: leitor.id, login: leitor.login, tipo: 'leitor' })
})
leitoresRoutes.get('/leituras', async (req, res) => {
  res.json(await prisma.leitura_salva.findMany({ where: { leitor_id: req.leitor!.id_leitor }, orderBy: { atualizado_em: 'desc' } }))
})
leitoresRoutes.put('/leituras/:livroId', async (req, res) => {
  const livroId = id.parse(req.params.livroId)
  const capituloId = id.parse(req.body.capitulo_id)
  const cap = await prisma.capitulos.findFirst({ where: { id: capituloId, livro_id: livroId, parent_id: { not: null } } })
  if (!cap) throw new HttpError(400, 'Subcapítulo não pertence a este livro')
  res.json(await prisma.leitura_salva.upsert({ where: { leitor_id_livro_id: { leitor_id: req.leitor!.id_leitor, livro_id: livroId } }, create: { leitor_id: req.leitor!.id_leitor, livro_id: livroId, capitulo_id: capituloId }, update: { capitulo_id: capituloId } }))
})
leitoresRoutes.get('/capitulos/:capituloId/comentarios', async (req, res) => {
  const capituloId = id.parse(req.params.capituloId)
  const rows = await prisma.comentario_subcapitulo.findMany({ where: { capitulo_id: capituloId }, orderBy: { criado_em: 'desc' }, take: 100, include: { leitor: { select: { login: true } } } })
  res.json(rows.map(({ leitor, ...row }) => ({ ...row, login: leitor.login })))
})
leitoresRoutes.post('/capitulos/:capituloId/comentarios', async (req, res) => {
  const capituloId = id.parse(req.params.capituloId)
  const texto = z.string().trim().min(1).max(5000).parse(req.body.texto)
  if (!(await prisma.capitulos.findFirst({ where: { id: capituloId, parent_id: { not: null } } }))) throw new HttpError(404, 'Subcapítulo não encontrado')
  res.status(201).json(await prisma.comentario_subcapitulo.create({ data: { leitor_id: req.leitor!.id_leitor, capitulo_id: capituloId, texto }, include: { leitor: { select: { login: true } } } }))
})
leitoresRoutes.put('/capitulos/:capituloId/avaliacao', async (req, res) => {
  const capituloId = id.parse(req.params.capituloId)
  const nota = z.number().int().min(1).max(5).parse(req.body.nota)
  if (!(await prisma.capitulos.findFirst({ where: { id: capituloId, parent_id: { not: null } } }))) throw new HttpError(404, 'Subcapítulo não encontrado')
  res.json(await prisma.avaliacao_subcapitulo.upsert({ where: { leitor_id_capitulo_id: { leitor_id: req.leitor!.id_leitor, capitulo_id: capituloId } }, create: { leitor_id: req.leitor!.id_leitor, capitulo_id: capituloId, nota }, update: { nota } }))
})
