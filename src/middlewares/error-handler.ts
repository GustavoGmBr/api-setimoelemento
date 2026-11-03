import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { emProducao } from '../config/env.js'
import { HttpError } from '../lib/http-error.js'

export const rotaNaoEncontrada: RequestHandler = (req, res) => {
  res.status(404).json({ message: `Rota ${req.method} ${req.path} não encontrada` })
}

export const tratarErros: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, ...(err.errors && { errors: err.errors }) })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Dados inválidos',
      errors: err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
    })
    return
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Registro não encontrado' })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Já existe um registro com esses dados' })
      return
    }
    if (err.code === 'P2003') {
      res.status(409).json({ message: 'Referência inválida ou registro em uso por outros dados' })
      return
    }
  }
  if (err instanceof Error && err.message === 'Origem não permitida pelo CORS') {
    res.status(403).json({ message: 'Origem não permitida' })
    return
  }
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ message: 'Arquivo grande demais (máximo de 5 MB)' })
    return
  }
  console.error(`Erro em ${req.method} ${req.path}:`, err)
  res.status(500).json({
    message: 'Erro interno do servidor',
    ...(!emProducao && err instanceof Error && { detalhe: err.message }),
  })
}
