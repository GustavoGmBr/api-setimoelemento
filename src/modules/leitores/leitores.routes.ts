import { randomUUID } from 'node:crypto'
import express, { Router, type RequestHandler } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/http-error.js'
import { autenticarLeitor } from '../../middlewares/auth.js'
import { limitarTentativas } from '../../middlewares/limitar-tentativas.js'
import { enviarArquivo, removerArquivo } from '../../services/ftp.js'
import { midiasDoChatDe } from '../../jobs/limpar-chat.js'

export const leitoresRoutes = Router()
const credenciais = z.object({ login: z.string().trim().min(3).max(100), senha: z.string().min(8).max(100) })
const id = z.coerce.number().int().positive()

type DadosSessao = { id: number; login: string; nome_exibicao?: string | null; avatar_url?: string | null }
async function sessao(leitor: DadosSessao) {
  return {
    token: jwt.sign({ id_leitor: leitor.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] }),
    usuario: { id_leitor: leitor.id, login: leitor.login, tipo: 'leitor' as const, nome_exibicao: leitor.nome_exibicao ?? null, avatar_url: leitor.avatar_url ?? null },
  }
}

const FORMATOS_AVATAR: Record<string, { ext: string; confere: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', confere: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', confere: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', confere: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
}
const PERFIL = { id: true, login: true, nome_exibicao: true, bio: true, avatar_url: true, criado_em: true, ultimo_acesso: true } as const

leitoresRoutes.post('/cadastro', limitarTentativas(5, 15 * 60 * 1000), async (req, res) => {
  const dados = credenciais.parse(req.body)
  const login = dados.login.toLowerCase()
  if (await prisma.leitores.findUnique({ where: { login } })) throw new HttpError(409, 'Este login já está em uso')
  const leitor = await prisma.leitores.create({ data: { login, senha: await bcrypt.hash(dados.senha, 12) }, select: { id: true, login: true, nome_exibicao: true, avatar_url: true } })
  res.status(201).json(await sessao(leitor))
})

leitoresRoutes.post('/login', limitarTentativas(10, 15 * 60 * 1000), async (req, res) => {
  const dados = credenciais.parse(req.body)
  const leitor = await prisma.leitores.findUnique({ where: { login: dados.login.toLowerCase() } })
  if (!leitor || !(await bcrypt.compare(dados.senha, leitor.senha))) throw new HttpError(401, 'Credenciais inválidas')
  await prisma.leitores.update({ where: { id: leitor.id }, data: { ultimo_acesso: new Date() } })
  res.json(await sessao(leitor))
})

leitoresRoutes.use(autenticarLeitor)
/** Marca o acesso (no máximo 1 gravação por hora) para a limpeza de contas inativas. */
const registrarAcesso: RequestHandler = (req, _res, next) => {
  const limite = new Date(Date.now() - 60 * 60 * 1000)
  prisma.leitores.updateMany({ where: { id: req.leitor!.id_leitor, ultimo_acesso: { lt: limite } }, data: { ultimo_acesso: new Date() } }).catch(() => undefined)
  next()
}
leitoresRoutes.use(registrarAcesso)
leitoresRoutes.get('/me', async (req, res) => {
  const leitor = await prisma.leitores.findUnique({ where: { id: req.leitor!.id_leitor }, select: PERFIL })
  if (!leitor) throw new HttpError(401, 'Conta de leitor não encontrada')
  res.json({ id_leitor: leitor.id, tipo: 'leitor', ...leitor, id: undefined, dias_inatividade: env.INATIVIDADE_DIAS })
})
leitoresRoutes.put('/me', async (req, res) => {
  const dados = z.object({ nome_exibicao: z.string().trim().max(60).nullish(), bio: z.string().trim().max(300).nullish() }).parse(req.body)
  const leitor = await prisma.leitores.update({
    where: { id: req.leitor!.id_leitor },
    data: { nome_exibicao: dados.nome_exibicao || null, bio: dados.bio || null },
    select: PERFIL,
  })
  res.json({ id_leitor: leitor.id, tipo: 'leitor', ...leitor, id: undefined })
})
leitoresRoutes.put('/me/senha', limitarTentativas(5, 15 * 60 * 1000), async (req, res) => {
  const dados = z.object({ senha_atual: z.string().min(1).max(100), nova_senha: z.string().min(8).max(100) }).parse(req.body)
  const leitor = await prisma.leitores.findUnique({ where: { id: req.leitor!.id_leitor } })
  if (!leitor || !(await bcrypt.compare(dados.senha_atual, leitor.senha))) throw new HttpError(403, 'A senha atual não confere')
  await prisma.leitores.update({ where: { id: leitor.id }, data: { senha: await bcrypt.hash(dados.nova_senha, 12) } })
  res.json({ ok: true })
})
/** Foto de perfil: corpo = a imagem (jpeg/png/webp até 1 MB; o site já envia reduzida). */
leitoresRoutes.post('/me/avatar', express.raw({ type: Object.keys(FORMATOS_AVATAR), limit: '1mb' }), async (req, res) => {
  const tipo = req.headers['content-type']?.split(';')[0]?.trim() ?? ''
  const formato = FORMATOS_AVATAR[tipo]
  if (!formato) throw new HttpError(415, 'Envie uma imagem JPG, PNG ou WEBP')
  const corpo: unknown = req.body
  if (!Buffer.isBuffer(corpo) || corpo.length === 0) throw new HttpError(400, 'Arquivo vazio')
  if (!formato.confere(corpo)) throw new HttpError(400, 'O arquivo não é uma imagem válida')
  const atual = await prisma.leitores.findUnique({ where: { id: req.leitor!.id_leitor }, select: { avatar_url: true } })
  const url = await enviarArquivo(corpo, 'avatares', `${randomUUID()}.${formato.ext}`)
  const leitor = await prisma.leitores.update({ where: { id: req.leitor!.id_leitor }, data: { avatar_url: url }, select: PERFIL })
  await removerArquivo(atual?.avatar_url)
  res.json({ id_leitor: leitor.id, tipo: 'leitor', ...leitor, id: undefined })
})
leitoresRoutes.delete('/me/avatar', async (req, res) => {
  const atual = await prisma.leitores.findUnique({ where: { id: req.leitor!.id_leitor }, select: { avatar_url: true } })
  const leitor = await prisma.leitores.update({ where: { id: req.leitor!.id_leitor }, data: { avatar_url: null }, select: PERFIL })
  await removerArquivo(atual?.avatar_url)
  res.json({ id_leitor: leitor.id, tipo: 'leitor', ...leitor, id: undefined })
})
/** Exclui a conta e tudo o que ela tem (leituras, comentários, avaliações e foto). */
leitoresRoutes.delete('/me', limitarTentativas(5, 15 * 60 * 1000), async (req, res) => {
  const { senha } = z.object({ senha: z.string().min(1).max(100) }).parse(req.body)
  const leitor = await prisma.leitores.findUnique({ where: { id: req.leitor!.id_leitor } })
  if (!leitor || !(await bcrypt.compare(senha, leitor.senha))) throw new HttpError(403, 'A senha não confere')
  const fotos = await midiasDoChatDe([leitor.id])
  await prisma.leitores.delete({ where: { id: leitor.id } })
  await removerArquivo(leitor.avatar_url)
  for (const f of fotos) await removerArquivo(f)
  res.json({ ok: true })
})
leitoresRoutes.get('/leituras', async (req, res) => {
  res.json(await prisma.leitura_salva.findMany({ where: { leitor_id: req.leitor!.id_leitor }, orderBy: { atualizado_em: 'desc' }, include: { capitulo: { select: { titulo: true, numero: true, livros: { select: { titulo: true } } } } } }))
})
leitoresRoutes.put('/leituras/:livroId', async (req, res) => {
  const livroId = id.parse(req.params.livroId)
  const capituloId = id.parse(req.body.capitulo_id)
  const cap = await prisma.capitulos.findFirst({ where: { id: capituloId, livro_id: livroId, parent_id: { not: null }, publicado: true } })
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
  if (!(await prisma.capitulos.findFirst({ where: { id: capituloId, parent_id: { not: null }, publicado: true } }))) throw new HttpError(404, 'Subcapítulo não encontrado')
  res.status(201).json(await prisma.comentario_subcapitulo.create({ data: { leitor_id: req.leitor!.id_leitor, capitulo_id: capituloId, texto }, include: { leitor: { select: { login: true } } } }))
})
leitoresRoutes.put('/capitulos/:capituloId/avaliacao', async (req, res) => {
  const capituloId = id.parse(req.params.capituloId)
  const nota = z.number().int().min(1).max(5).parse(req.body.nota)
  if (!(await prisma.capitulos.findFirst({ where: { id: capituloId, parent_id: { not: null }, publicado: true } }))) throw new HttpError(404, 'Subcapítulo não encontrado')
  res.json(await prisma.avaliacao_subcapitulo.upsert({ where: { leitor_id_capitulo_id: { leitor_id: req.leitor!.id_leitor, capitulo_id: capituloId } }, create: { leitor_id: req.leitor!.id_leitor, capitulo_id: capituloId, nota }, update: { nota } }))
})
