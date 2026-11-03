import { Router } from 'express'
import { prisma } from './lib/prisma.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { capitulosPrivados, capitulosPublicos } from './modules/capitulos/capitulos.routes.js'
import { livrosPrivados, livrosPublicos } from './modules/livros/livros.routes.js'
import { formasPublicas, personagensPrivados, personagensPublicos } from './modules/personagens/personagens.routes.js'
import { itensPrivados, itensPublicos } from './modules/itens/itens.routes.js'
import { bestiarioPrivado, bestiarioPublico } from './modules/bestiario/bestiario.routes.js'
import { locaisPrivados, locaisPublicos } from './modules/universo/universo.routes.js'
import { historicosPrivados } from './modules/personagens/historicos.routes.js'
import { bolsasPrivadas, inventariosPrivados } from './modules/personagens/inventarios.routes.js'
import { uploadsPrivados } from './modules/uploads/uploads.routes.js'
import { sagasPrivadas, sagasPublicas } from './modules/sagas/sagas.routes.js'
import { sistemasPrivados, sistemasPublicos } from './modules/sistemas/sistemas.routes.js'
import { racasPrivadas, racasPublicas } from './modules/racas/racas.routes.js'

export const routes = Router()

routes.get('/', (_req, res) => {
  res.json({ status: 'online', message: 'Setimo Elemento API', version: '0.1.0' })
})

routes.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'healthy', uptime: process.uptime() })
})

routes.use('/auth', authRoutes)

routes.use('/sagas', sagasPublicas)
routes.use('/private/sagas', sagasPrivadas)
routes.use('/sistemas', sistemasPublicos)
routes.use('/private/sistemas', sistemasPrivados)
routes.use('/racas', racasPublicas)
routes.use('/private/racas', racasPrivadas)

routes.use('/livros', livrosPublicos)
routes.use('/private/livros', livrosPrivados)

routes.use('/capitulos', capitulosPublicos)
routes.use('/private/capitulos', capitulosPrivados)

routes.use('/personagens', personagensPublicos)
routes.use('/formas', formasPublicas)
routes.use('/private/historicos', historicosPrivados)
routes.use('/private/inventarios', inventariosPrivados)
routes.use('/private/bolsas', bolsasPrivadas)
routes.use('/private/uploads', uploadsPrivados)
routes.use('/private/personagens', personagensPrivados)
routes.use('/itens', itensPublicos)
routes.use('/private/itens', itensPrivados)
routes.use('/locais', locaisPublicos)
routes.use('/private/locais', locaisPrivados)
routes.use('/bestiario', bestiarioPublico)
routes.use('/private/bestiario', bestiarioPrivado)
