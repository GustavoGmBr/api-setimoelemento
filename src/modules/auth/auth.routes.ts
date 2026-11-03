import { Router } from 'express'
import { autenticar } from '../../middlewares/auth.js'
import { limitarTentativas } from '../../middlewares/limitar-tentativas.js'
import { loginSchema } from './auth.schemas.js'
import { entrar, usuarioAtual } from './auth.service.js'

export const authRoutes = Router()

authRoutes.post('/login', limitarTentativas(10, 15 * 60 * 1000), async (req, res) => {
  const dados = loginSchema.parse(req.body)
  res.json(await entrar(dados))
})

authRoutes.get('/me', autenticar, async (req, res) => {
  res.json(await usuarioAtual(req.usuario!.id_usuario))
})
