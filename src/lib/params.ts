import type { Request } from 'express'
import { z } from 'zod'
import { HttpError } from './http-error.js'

const idSchema = z.coerce.number().int().positive()

/** Lê um parâmetro de rota numérico (ex.: /:id) ou responde 400. */
export function idDaRota(req: Request, nome = 'id'): number {
  const r = idSchema.safeParse(req.params[nome])
  if (!r.success) throw new HttpError(400, `Parâmetro "${nome}" inválido`)
  return r.data
}
