import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { emProducao, env } from './config/env.js'
import { rotaNaoEncontrada, tratarErros } from './middlewares/error-handler.js'
import { routes } from './routes.js'

export function criarApp() {
  const app = express()
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(
    cors({
      origin(origem, callback) {
        if (!origem) return callback(null, true) // curl, Postman, server-to-server
        const limpa = origem.replace(/\/$/, '')
        const permitida =
          env.CORS_ORIGINS.includes(limpa) || (!emProducao && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(limpa))
        callback(permitida ? null : new Error('Origem não permitida pelo CORS'), permitida)
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      maxAge: 86400,
    }),
  )
  app.use(express.json({ limit: '10mb' }))

  if (!emProducao) {
    app.use((req, _res, next) => {
      console.log(`${req.method} ${req.url}`)
      next()
    })
  }

  app.use('/api', routes)
  app.use(rotaNaoEncontrada)
  app.use(tratarErros)
  return app
}
