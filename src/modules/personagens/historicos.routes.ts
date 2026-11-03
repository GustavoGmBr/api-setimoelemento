import { Router } from 'express'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { prisma } from '../../lib/prisma.js'
import { autenticar } from '../../middlewares/auth.js'
import { historicoSchema, type HistoricoDados } from './historicos.schemas.js'

/** Confere que raça, livro, capítulo e formas existem e combinam entre si. */
async function validarReferencias(d: HistoricoDados) {
  const [personagem, raca] = await Promise.all([
    prisma.personagens.findUnique({ where: { id: d.personagem_id }, select: { id: true, formas: { select: { id: true } } } }),
    prisma.racas.findUnique({ where: { id: d.raca_id }, select: { id: true } }),
  ])
  if (!personagem) throw naoEncontrado('Personagem')
  if (!raca) throw new HttpError(400, 'Raça inválida')

  if (d.capitulo_id !== null) {
    const cap = await prisma.capitulos.findUnique({ where: { id: d.capitulo_id }, select: { livro_id: true } })
    if (!cap) throw new HttpError(400, 'Capítulo inválido')
    if (d.livro_id !== null && cap.livro_id !== d.livro_id) throw new HttpError(400, 'O capítulo não pertence ao livro escolhido')
    d.livro_id = cap.livro_id
  } else if (d.livro_id !== null) {
    const livro = await prisma.livros.findUnique({ where: { id: d.livro_id }, select: { id: true } })
    if (!livro) throw new HttpError(400, 'Livro inválido')
  }

  // só vale forma que pertence ao próprio personagem
  const validas = new Set(personagem.formas.map((f) => f.id))
  d.formas_desbloqueadas = [...new Set(d.formas_desbloqueadas)].filter((id) => validas.has(id))
}

/** Escrita dos momentos da história: /api/private/historicos */
export const historicosPrivados = Router()
historicosPrivados.use(autenticar)

historicosPrivados.post('/', async (req, res) => {
  const dados = historicoSchema.parse(req.body)
  await validarReferencias(dados)
  res.status(201).json(await prisma.personagem_historico.create({ data: dados }))
})

historicosPrivados.put('/:id', async (req, res) => {
  const id = idDaRota(req)
  const atual = await prisma.personagem_historico.findUnique({ where: { id }, select: { personagem_id: true } })
  if (!atual) throw naoEncontrado('Momento')
  // o momento não muda de dono
  const dados = historicoSchema.parse({ ...req.body, personagem_id: atual.personagem_id })
  await validarReferencias(dados)
  const { personagem_id: _p, ...resto } = dados
  res.json(await prisma.personagem_historico.update({ where: { id }, data: resto }))
})

historicosPrivados.delete('/:id', async (req, res) => {
  const id = idDaRota(req)
  const existe = await prisma.personagem_historico.findUnique({ where: { id }, select: { id: true } })
  if (!existe) throw naoEncontrado('Momento')
  await prisma.personagem_historico.delete({ where: { id } })
  res.status(204).end()
})
