import type { RequestHandler } from 'express'
import { HttpError } from '../lib/http-error.js'

/** Limite simples em memória por IP (suficiente para uma única instância da API). */
export function limitarTentativas(maximo: number, janelaMs: number): RequestHandler {
  const registros = new Map<string, { n: number; ate: number }>()
  return (req, _res, next) => {
    const agora = Date.now()
    const chave = req.ip ?? 'desconhecido'
    const r = registros.get(chave)
    if (!r || r.ate < agora) {
      registros.set(chave, { n: 1, ate: agora + janelaMs })
      return next()
    }
    r.n += 1
    if (r.n > maximo) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.')
    next()
  }
}
