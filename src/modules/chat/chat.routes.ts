import { randomBytes, randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/http-error.js'
import { autenticarLeitor } from '../../middlewares/auth.js'
import { limitarTentativas } from '../../middlewares/limitar-tentativas.js'
import { enviarArquivo } from '../../services/ftp.js'
import { AUTOR, dadosDaMensagem, historico, id, mensagem, perfil } from './comum.js'
import { registrarFoto } from './fotos.js'
import { buscarMarcacoes, TIPOS_MARCACAO } from './marcacoes.js'
import { enviarPara, idsOnline, registrar, transmitir } from './hub.js'
import { amigosRoutes } from './amigos.routes.js'
import { salasRoutes } from './salas.routes.js'

export const chatRoutes = Router()

/* ---------- tempo real (SSE) ----------
 * O EventSource do navegador não envia cabeçalhos, então o token vai num "ticket" de uso único (60 s). */
const tickets = new Map<string, { leitor: number; ate: number }>()

chatRoutes.get('/stream', async (req, res) => {
  const ticket = String(req.query['ticket'] ?? '')
  const t = tickets.get(ticket)
  tickets.delete(ticket)
  if (!t || t.ate < Date.now()) throw new HttpError(401, 'Ticket do chat inválido ou expirado')
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  const sair = registrar(t.leitor, res)
  req.on('close', sair)
  prisma.leitores.updateMany({ where: { id: t.leitor, ultimo_acesso: { lt: new Date(Date.now() - 60 * 60 * 1000) } }, data: { ultimo_acesso: new Date() } }).catch(() => undefined)
})

chatRoutes.use(autenticarLeitor)

chatRoutes.post('/ticket', (req, res) => {
  const agora = Date.now()
  tickets.forEach((v, k) => v.ate < agora && tickets.delete(k))
  const ticket = randomBytes(24).toString('hex')
  tickets.set(ticket, { leitor: req.leitor!.id_leitor, ate: agora + 60_000 })
  res.json({ ticket })
})

/* ---------- fotos ---------- */
const FORMATOS_FOTO: Record<string, { ext: string; confere: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', confere: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', confere: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', confere: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
}

/** Corpo = a imagem (jpeg/png/webp até 2 MB; o site já envia reduzida). Devolve a URL para usar na mensagem. */
chatRoutes.post('/foto', limitarTentativas(20, 60_000), express.raw({ type: Object.keys(FORMATOS_FOTO), limit: '2mb' }), async (req, res) => {
  const tipo = req.headers['content-type']?.split(';')[0]?.trim() ?? ''
  const formato = FORMATOS_FOTO[tipo]
  if (!formato) throw new HttpError(415, 'Envie uma imagem JPG, PNG ou WEBP')
  const corpo: unknown = req.body
  if (!Buffer.isBuffer(corpo) || corpo.length === 0) throw new HttpError(400, 'Arquivo vazio')
  if (!formato.confere(corpo)) throw new HttpError(400, 'O arquivo não é uma imagem válida')
  const url = await enviarArquivo(corpo, 'chat', `${randomUUID()}.${formato.ext}`)
  registrarFoto(url, req.leitor!.id_leitor)
  res.status(201).json({ url })
})

/* ---------- marcações (capítulos, personagens, criaturas, itens, locais) ---------- */
chatRoutes.get('/marcacoes', async (req, res) => {
  const { q, tipo } = z.object({ q: z.string().trim().max(60).default(''), tipo: z.enum(TIPOS_MARCACAO).optional() }).parse(req.query)
  res.json(await buscarMarcacoes(q, tipo))
})

/* ---------- pessoas ---------- */
chatRoutes.get('/online', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const lista = await prisma.leitores.findMany({ where: { id: { in: idsOnline().filter((i) => i !== eu) } }, select: AUTOR.select, orderBy: { login: 'asc' }, take: 200 })
  res.json(lista.map(perfil))
})

chatRoutes.get('/leitores', async (req, res) => {
  const q = z.string().trim().min(2).max(60).parse(req.query['q'])
  const lista = await prisma.leitores.findMany({
    where: { id: { not: req.leitor!.id_leitor }, OR: [{ login: { contains: q } }, { nome_exibicao: { contains: q } }] },
    select: AUTOR.select, orderBy: { login: 'asc' }, take: 15,
  })
  res.json(lista.map(perfil))
})

chatRoutes.use('/amigos', amigosRoutes)
chatRoutes.use('/salas', salasRoutes)

/* ---------- sala pública ---------- */
chatRoutes.get('/publico', async (req, res) => {
  const { antes, limite } = historico.parse(req.query)
  const rows = await prisma.chat_mensagem.findMany({
    where: { destinatario_id: null, sala_id: null, expira_em: { gt: new Date() }, ...(antes ? { id: { lt: antes } } : {}) },
    orderBy: { id: 'desc' }, take: limite, include: { autor: AUTOR },
  })
  res.json(rows.reverse().map(mensagem))
})

chatRoutes.post('/publico', limitarTentativas(120, 60_000), async (req, res) => {
  const dados = await dadosDaMensagem(req.leitor!.id_leitor, req.body)
  const m = await prisma.chat_mensagem.create({ data: { autor_id: req.leitor!.id_leitor, ...dados }, include: { autor: AUTOR } })
  const dto = mensagem(m)
  transmitir('mensagem', dto)
  res.status(201).json(dto)
})

/* ---------- conversas privadas (duas pessoas) ---------- */
async function outroLeitor(req: { params: Record<string, unknown>; leitor?: { id_leitor: number } }) {
  const outro = id.parse(req.params['id'])
  if (outro === req.leitor!.id_leitor) throw new HttpError(400, 'Escolha outra pessoa para conversar')
  const l = await prisma.leitores.findUnique({ where: { id: outro }, select: AUTOR.select })
  if (!l) throw new HttpError(404, 'Leitor não encontrado')
  return l
}

chatRoutes.get('/privado', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const rows = await prisma.chat_mensagem.findMany({
    where: { expira_em: { gt: new Date() }, sala_id: null, OR: [{ autor_id: eu, destinatario_id: { not: null } }, { destinatario_id: eu }] },
    orderBy: { id: 'desc' }, take: 1000, include: { autor: AUTOR },
  })
  const vistos = new Map((await prisma.chat_visto.findMany({ where: { leitor_id: eu } })).map((v) => [v.outro_id, v.visto_em]))
  const conversas = new Map<number, { ultima: ReturnType<typeof mensagem>; nao_lidas: number }>()
  for (const m of rows) {
    const par = m.autor_id === eu ? m.destinatario_id! : m.autor_id
    const c = conversas.get(par) ?? { ultima: mensagem(m), nao_lidas: 0 }
    if (m.autor_id !== eu && m.criado_em > (vistos.get(par) ?? new Date(0))) c.nao_lidas += 1
    conversas.set(par, c)
  }
  const pessoas = await prisma.leitores.findMany({ where: { id: { in: [...conversas.keys()] } }, select: AUTOR.select })
  const porId = new Map(pessoas.map((p) => [p.id, p]))
  res.json([...conversas.entries()].filter(([par]) => porId.has(par)).map(([par, c]) => ({ com: perfil(porId.get(par)!), ...c })))
})

chatRoutes.get('/privado/:id', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const outro = await outroLeitor(req)
  const { antes, limite } = historico.parse(req.query)
  const rows = await prisma.chat_mensagem.findMany({
    where: {
      expira_em: { gt: new Date() }, sala_id: null, ...(antes ? { id: { lt: antes } } : {}),
      OR: [{ autor_id: eu, destinatario_id: outro.id }, { autor_id: outro.id, destinatario_id: eu }],
    },
    orderBy: { id: 'desc' }, take: limite, include: { autor: AUTOR },
  })
  res.json({ com: perfil(outro), mensagens: rows.reverse().map(mensagem) })
})

chatRoutes.post('/privado/:id', limitarTentativas(120, 60_000), async (req, res) => {
  const eu = req.leitor!.id_leitor
  const outro = await outroLeitor(req)
  const dados = await dadosDaMensagem(eu, req.body)
  const m = await prisma.chat_mensagem.create({ data: { autor_id: eu, destinatario_id: outro.id, ...dados }, include: { autor: AUTOR } })
  const dto = mensagem(m)
  enviarPara([eu, outro.id], 'mensagem', dto)
  res.status(201).json(dto)
})

chatRoutes.post('/privado/:id/visto', async (req, res) => {
  const eu = req.leitor!.id_leitor
  const outro = await outroLeitor(req)
  await prisma.chat_visto.upsert({ where: { leitor_id_outro_id: { leitor_id: eu, outro_id: outro.id } }, create: { leitor_id: eu, outro_id: outro.id }, update: { visto_em: new Date() } })
  res.json({ ok: true })
})
