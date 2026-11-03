import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../config/env.js'
import { HttpError } from '../lib/http-error.js'

const payloadSchema = z.object({
  id_usuario: z.number().int(),
  nivel_acesso: z.number().int(),
})
const leitorPayloadSchema = z.object({ id_leitor: z.number().int() })
export type UsuarioToken = z.infer<typeof payloadSchema>
export type LeitorToken = z.infer<typeof leitorPayloadSchema>

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioToken
      leitor?: LeitorToken
    }
  }
}

/** Exige `Authorization: Bearer <token>` válido. Preenche `req.usuario`. */
export const autenticar: RequestHandler = (req, _res, next) => {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ')
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'Token não fornecido')
  try {
    const dados = payloadSchema.parse(jwt.verify(token, env.JWT_SECRET))
    req.usuario = { id_usuario: dados.id_usuario, nivel_acesso: dados.nivel_acesso }
    next()
  } catch {
    throw new HttpError(401, 'Token inválido ou expirado')
  }
}

/** Token exclusivo para operações da conta de leitor. */
export const autenticarLeitor: RequestHandler = (req, _res, next) => {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ')
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'Token não fornecido')
  try {
    req.leitor = leitorPayloadSchema.parse(jwt.verify(token, env.JWT_SECRET))
    next()
  } catch {
    throw new HttpError(401, 'Token de leitor inválido ou expirado')
  }
}

/** Exige nível de acesso mínimo (usar depois de `autenticar`). */
export const exigirNivel =
  (minimo: number): RequestHandler =>
  (req, _res, next) => {
    if (!req.usuario || req.usuario.nivel_acesso < minimo) throw new HttpError(403, 'Sem permissão')
    next()
  }
