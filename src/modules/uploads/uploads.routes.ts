import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { HttpError } from '../../lib/http-error.js'
import { autenticar } from '../../middlewares/auth.js'
import { enviarArquivo } from '../../services/ftp.js'

type Formato = { ext: string; confere: (b: Buffer) => boolean }
const FORMATOS: Record<string, Formato> = {
  'image/jpeg': { ext: 'jpg', confere: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', confere: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', confere: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
}

/** Escrita (autor): /api/private/uploads */
export const uploadsPrivados = Router()
uploadsPrivados.use(autenticar)

/** destino na URL → pasta dentro de /uploads */
const DESTINOS: Record<string, string> = { capa: 'capas', rosto: 'personagens', corpo: 'personagens', item: 'itens', criatura: 'bestiario', local: 'locais' }

/**
 * POST /api/private/uploads/:destino (capa | rosto | corpo | item | criatura | local) — corpo = o arquivo da imagem
 * (Content-Type image/jpeg|png|webp). Envia o arquivo por FTP para a hospedagem do site e responde { url } com o endereço público.
 */
uploadsPrivados.post(
  '/:destino',
  express.raw({ type: Object.keys(FORMATOS), limit: '5mb' }),
  async (req, res) => {
    const pasta = DESTINOS[String(req.params['destino'])]
    if (!pasta) throw new HttpError(404, 'Destino de upload desconhecido')
    const tipo = req.headers['content-type']?.split(';')[0]?.trim() ?? ''
    const formato = FORMATOS[tipo]
    if (!formato) throw new HttpError(415, 'Envie uma imagem JPG, PNG ou WEBP')
    const corpo: unknown = req.body
    if (!Buffer.isBuffer(corpo) || corpo.length === 0) throw new HttpError(400, 'Arquivo vazio')
    if (!formato.confere(corpo)) throw new HttpError(400, 'O arquivo não é uma imagem válida')

    const nome = `${randomUUID()}.${formato.ext}`
    res.status(201).json({ url: await enviarArquivo(corpo, pasta, nome) })
  },
)
