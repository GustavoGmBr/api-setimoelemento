import { Router } from 'express'
import { HttpError } from '../../lib/http-error.js'
import { idDaRota } from '../../lib/params.js'
import { autenticar } from '../../middlewares/auth.js'
import { capituloParcialSchema, capituloSchema, conteudoSchema } from './capitulos.schemas.js'
import * as capitulos from './capitulos.service.js'

/** Leitura pública: /api/capitulos */
export const capitulosPublicos = Router()

capitulosPublicos.get('/recentes', async (_req, res) => {
  res.json(await capitulos.listarRecentes())
})

capitulosPublicos.get('/livro/:livro_id', async (req, res) => {
  res.json(await capitulos.listarPorLivro(idDaRota(req, 'livro_id')))
})

capitulosPublicos.get('/:id', async (req, res) => {
  res.json(await capitulos.obter(idDaRota(req)))
})

/** Escrita (autor): /api/private/capitulos */
export const capitulosPrivados = Router()
capitulosPrivados.use(autenticar)

capitulosPrivados.post('/', async (req, res) => {
  res.status(201).json(await capitulos.criar(capituloSchema.parse(req.body)))
})

capitulosPrivados.put('/:id', async (req, res) => {
  res.json(await capitulos.atualizar(idDaRota(req), capituloParcialSchema.parse(req.body)))
})

/** Só o texto (o editor chama esta rota ao salvar). Corpo: { conteudo_json: [...] } */
capitulosPrivados.patch('/:id/conteudo', async (req, res) => {
  const { conteudo_json } = conteudoDoCorpo(req.body)
  res.json(await capitulos.salvarConteudo(idDaRota(req), conteudo_json))
})

capitulosPrivados.patch('/:id/limpar-conteudo', async (req, res) => {
  res.json(await capitulos.limparConteudo(idDaRota(req)))
})

capitulosPrivados.delete('/:id', async (req, res) => {
  await capitulos.remover(idDaRota(req))
  res.status(204).end()
})

function conteudoDoCorpo(corpo: unknown) {
  const bruto = (corpo as { conteudo_json?: unknown } | null)?.conteudo_json
  let lista = bruto
  if (typeof bruto === 'string') {
    try {
      lista = JSON.parse(bruto)
    } catch {
      throw new HttpError(400, 'conteudo_json não é um JSON válido')
    }
  }
  return { conteudo_json: conteudoSchema.parse(lista) }
}
