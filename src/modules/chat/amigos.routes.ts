import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/http-error.js'
import { limitarTentativas } from '../../middlewares/limitar-tentativas.js'
import { AUTOR, id, perfil } from './comum.js'
import { enviarPara } from './hub.js'

/** Amizades: lista, pedido, aceitar e desfazer. Montado em /api/chat/amigos (já autenticado). */
export const amigosRoutes = Router()

async function pessoa(req: { params: Record<string, unknown>; leitor?: { id_leitor: number } }) {
  const outro = id.parse(req.params['id'])
  if (outro === req.leitor!.id_leitor) throw new HttpError(400, 'Você não pode ser amigo de si mesmo')
  const l = await prisma.leitores.findUnique({ where: { id: outro }, select: AUTOR.select })
  if (!l) throw new HttpError(404, 'Leitor não encontrado')
  return l
}
const entre = (a: number, b: number) => ({ OR: [{ de_id: a, para_id: b }, { de_id: b, para_id: a }] })

amigosRoutes.get('/', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const linhas = await prisma.chat_amizade.findMany({
    where: { OR: [{ de_id: eu }, { para_id: eu }] },
    include: { de: AUTOR, para: AUTOR }, orderBy: { id: 'desc' }, take: 500,
  })
  const amigos = linhas.filter((l) => l.status === 'aceita').map((l) => perfil(l.de_id === eu ? l.para : l.de))
  amigos.sort((a, b) => Number(b.online) - Number(a.online) || (a.nome_exibicao || a.login).localeCompare(b.nome_exibicao || b.login))
  res.json({
    amigos,
    recebidos: linhas.filter((l) => l.status === 'pendente' && l.para_id === eu).map((l) => ({ de: perfil(l.de), criado_em: l.criado_em })),
    enviados: linhas.filter((l) => l.status === 'pendente' && l.de_id === eu).map((l) => ({ para: perfil(l.para), criado_em: l.criado_em })),
  })
})

/** Pede amizade. Se a outra pessoa já tinha pedido a você, vira amizade na hora. */
amigosRoutes.post('/:id', limitarTentativas(30, 60_000), async (req, res) => {
  const eu = req.leitor!.id_leitor
  const outro = await pessoa(req)
  const existente = await prisma.chat_amizade.findFirst({ where: entre(eu, outro.id) })
  const meuPerfil = await prisma.leitores.findUniqueOrThrow({ where: { id: eu }, select: AUTOR.select })
  if (existente) {
    if (existente.status === 'aceita') throw new HttpError(409, 'Vocês já são amigos')
    if (existente.de_id === eu) throw new HttpError(409, 'O pedido já foi enviado')
    await prisma.chat_amizade.update({ where: { id: existente.id }, data: { status: 'aceita' } })
    enviarPara([outro.id], 'amizade', { tipo: 'aceita', de: perfil(meuPerfil) })
    enviarPara([eu], 'amizade', { tipo: 'atualizar' })
    return res.json({ status: 'aceita' })
  }
  await prisma.chat_amizade.create({ data: { de_id: eu, para_id: outro.id } })
  enviarPara([outro.id], 'amizade', { tipo: 'pedido', de: perfil(meuPerfil) })
  enviarPara([eu], 'amizade', { tipo: 'atualizar' })
  res.status(201).json({ status: 'pendente' })
})

amigosRoutes.post('/:id/aceitar', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const outro = await pessoa(req)
  const pedido = await prisma.chat_amizade.findFirst({ where: { de_id: outro.id, para_id: eu, status: 'pendente' } })
  if (!pedido) throw new HttpError(404, 'Pedido de amizade não encontrado')
  await prisma.chat_amizade.update({ where: { id: pedido.id }, data: { status: 'aceita' } })
  const meuPerfil = await prisma.leitores.findUniqueOrThrow({ where: { id: eu }, select: AUTOR.select })
  enviarPara([outro.id], 'amizade', { tipo: 'aceita', de: perfil(meuPerfil) })
  enviarPara([eu], 'amizade', { tipo: 'atualizar' })
  res.json({ status: 'aceita' })
})

/** Desfaz a amizade, recusa um pedido recebido ou cancela um pedido enviado. */
amigosRoutes.delete('/:id', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const outro = await pessoa(req)
  const r = await prisma.chat_amizade.deleteMany({ where: entre(eu, outro.id) })
  if (r.count) {
    enviarPara([outro.id], 'amizade', { tipo: 'atualizar' })
    enviarPara([eu], 'amizade', { tipo: 'atualizar' })
  }
  res.json({ ok: true })
})
