import { Router } from 'express'
import { autenticar } from '../../middlewares/auth.js'
import { montarBiblioteca } from './biblioteca.service.js'

/** Leitura pública: GET /api/biblioteca — sagas com os livros publicados, mais os livros avulsos. */
export const bibliotecaPublica = Router()
bibliotecaPublica.get('/', async (_req, res) => {
  res.json(await montarBiblioteca(true))
})

/** Autor: GET /api/private/biblioteca — tudo, inclusive rascunhos e sagas vazias. */
export const bibliotecaPrivada = Router()
bibliotecaPrivada.use(autenticar)
bibliotecaPrivada.get('/', async (_req, res) => {
  res.json(await montarBiblioteca(false))
})
