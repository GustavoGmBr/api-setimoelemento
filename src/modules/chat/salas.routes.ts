import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/http-error.js'
import { limitarTentativas } from '../../middlewares/limitar-tentativas.js'
import { removerArquivo } from '../../services/ftp.js'
import { AUTOR, dadosDaMensagem, historico, id, idsDeAmigos, mensagem, perfil } from './comum.js'
import { enviarPara } from './hub.js'

/** Salas privadas: só quem é amigo do dono entra. Montado em /api/chat/salas (já autenticado). */
export const salasRoutes = Router()

const MEMBROS = { include: { leitor: AUTOR }, orderBy: { id: 'asc' } } as const

async function minhaSala(salaId: number, eu: number) {
  const sala = await prisma.chat_sala.findUnique({ where: { id: salaId }, include: { membros: MEMBROS } })
  if (!sala || !sala.membros.some((m) => m.leitor_id === eu)) throw new HttpError(404, 'Sala não encontrada')
  return sala
}
type SalaComMembros = Awaited<ReturnType<typeof minhaSala>>
const dto = (s: SalaComMembros) => ({ id: s.id, nome: s.nome, dono_id: s.dono_id, criado_em: s.criado_em, membros: s.membros.map((m) => perfil(m.leitor)) })
const idsDe = (s: SalaComMembros) => s.membros.map((m) => m.leitor_id)

async function exigirAmigos(eu: number, alvos: number[]) {
  const amigos = new Set(await idsDeAmigos(eu))
  if (alvos.some((a) => a === eu || !amigos.has(a))) throw new HttpError(403, 'Só é possível convidar pessoas que são suas amigas')
}

salasRoutes.get('/', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const salas = await prisma.chat_sala.findMany({ where: { membros: { some: { leitor_id: eu } } }, include: { membros: MEMBROS }, orderBy: { id: 'desc' }, take: 100 })
  const ids = salas.map((s) => s.id)
  const rows = ids.length
    ? await prisma.chat_mensagem.findMany({ where: { sala_id: { in: ids }, expira_em: { gt: new Date() } }, orderBy: { id: 'desc' }, take: 2000, include: { autor: AUTOR } })
    : []
  const resumo = new Map<number, { ultima: ReturnType<typeof mensagem> | null; nao_lidas: number }>()
  for (const s of salas) resumo.set(s.id, { ultima: null, nao_lidas: 0 })
  for (const m of rows) {
    const r = resumo.get(m.sala_id!)!
    r.ultima ??= mensagem(m)
    const visto = salas.find((s) => s.id === m.sala_id)!.membros.find((x) => x.leitor_id === eu)!.visto_em
    if (m.autor_id !== eu && m.criado_em > visto) r.nao_lidas += 1
  }
  res.json(salas.map((s) => ({ ...dto(s), ...resumo.get(s.id)! })))
})

const nova = z.object({ nome: z.string().trim().min(2, 'Dê um nome à sala').max(60), membros: z.array(id).min(1, 'Escolha ao menos um amigo').max(30) })

salasRoutes.post('/', limitarTentativas(10, 60_000), async (req, res) => {
  const eu = req.leitor!.id_leitor
  const { nome, membros } = nova.parse(req.body)
  const alvos = [...new Set(membros)]
  await exigirAmigos(eu, alvos)
  const total = await prisma.chat_sala.count({ where: { dono_id: eu } })
  if (total >= 10) throw new HttpError(400, 'Você já tem 10 salas. Apague uma para criar outra.')
  const criada = await prisma.chat_sala.create({ data: { nome, dono_id: eu, membros: { create: [eu, ...alvos].map((leitor_id) => ({ leitor_id })) } }, include: { membros: MEMBROS } })
  const eleDono = criada.membros.find((m) => m.leitor_id === eu)!.leitor
  enviarPara(alvos, 'sala', { tipo: 'convite', sala_id: criada.id, nome, por: perfil(eleDono) })
  enviarPara([eu], 'sala', { tipo: 'atualizar', sala_id: criada.id })
  res.status(201).json(dto(criada))
})

salasRoutes.get('/:id', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const sala = await minhaSala(id.parse(req.params['id']), eu)
  const { antes, limite } = historico.parse(req.query)
  const rows = await prisma.chat_mensagem.findMany({
    where: { sala_id: sala.id, expira_em: { gt: new Date() }, ...(antes ? { id: { lt: antes } } : {}) },
    orderBy: { id: 'desc' }, take: limite, include: { autor: AUTOR },
  })
  res.json({ sala: dto(sala), mensagens: rows.reverse().map(mensagem) })
})

salasRoutes.post('/:id', limitarTentativas(120, 60_000), async (req, res) => {
  const eu = req.leitor!.id_leitor
  const sala = await minhaSala(id.parse(req.params['id']), eu)
  const dados = await dadosDaMensagem(eu, req.body)
  const m = await prisma.chat_mensagem.create({ data: { autor_id: eu, sala_id: sala.id, ...dados }, include: { autor: AUTOR } })
  const out = mensagem(m)
  enviarPara(idsDe(sala), 'mensagem', out)
  res.status(201).json(out)
})

salasRoutes.post('/:id/visto', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const sala = await minhaSala(id.parse(req.params['id']), eu)
  await prisma.chat_sala_membro.updateMany({ where: { sala_id: sala.id, leitor_id: eu }, data: { visto_em: new Date() } })
  res.json({ ok: true })
})

/** O dono convida mais amigos dele. */
salasRoutes.post('/:id/membros', limitarTentativas(20, 60_000), async (req, res) => {
  const eu = req.leitor!.id_leitor
  const sala = await minhaSala(id.parse(req.params['id']), eu)
  if (sala.dono_id !== eu) throw new HttpError(403, 'Só quem criou a sala pode convidar')
  const { membros } = z.object({ membros: z.array(id).min(1).max(30) }).parse(req.body)
  const novos = [...new Set(membros)].filter((m) => !idsDe(sala).includes(m))
  await exigirAmigos(eu, novos)
  if (sala.membros.length + novos.length > 31) throw new HttpError(400, 'A sala está cheia (máximo de 31 pessoas)')
  if (novos.length) await prisma.chat_sala_membro.createMany({ data: novos.map((leitor_id) => ({ sala_id: sala.id, leitor_id })) })
  const atual = await minhaSala(sala.id, eu)
  const dono = atual.membros.find((m) => m.leitor_id === eu)!.leitor
  enviarPara(novos, 'sala', { tipo: 'convite', sala_id: sala.id, nome: sala.nome, por: perfil(dono) })
  enviarPara(idsDe(atual).filter((m) => !novos.includes(m)), 'sala', { tipo: 'atualizar', sala_id: sala.id })
  res.json(dto(atual))
})

/** O dono remove alguém, ou a pessoa sai por conta própria (o dono não sai: apaga a sala). */
salasRoutes.delete('/:id/membros/:leitorId', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const sala = await minhaSala(id.parse(req.params['id']), eu)
  const alvo = id.parse(req.params['leitorId'])
  if (alvo === sala.dono_id) throw new HttpError(400, 'O dono não pode sair. Apague a sala se quiser encerrá-la.')
  if (alvo !== eu && sala.dono_id !== eu) throw new HttpError(403, 'Só o dono pode remover outras pessoas')
  if (!idsDe(sala).includes(alvo)) throw new HttpError(404, 'Essa pessoa não está na sala')
  await prisma.chat_sala_membro.deleteMany({ where: { sala_id: sala.id, leitor_id: alvo } })
  enviarPara(idsDe(sala), 'sala', { tipo: 'atualizar', sala_id: sala.id })
  res.json({ ok: true })
})

salasRoutes.delete('/:id', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const sala = await minhaSala(id.parse(req.params['id']), eu)
  if (sala.dono_id !== eu) throw new HttpError(403, 'Só quem criou a sala pode apagá-la')
  const fotos = await prisma.chat_mensagem.findMany({ where: { sala_id: sala.id, midia_url: { not: null } }, select: { midia_url: true } })
  await prisma.chat_sala.delete({ where: { id: sala.id } })
  for (const f of fotos) await removerArquivo(f.midia_url)
  enviarPara(idsDe(sala), 'sala', { tipo: 'apagada', sala_id: sala.id, nome: sala.nome })
  res.json({ ok: true })
})
