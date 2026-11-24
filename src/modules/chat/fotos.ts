import { removerArquivo } from '../../services/ftp.js'

/** Fotos enviadas mas ainda não usadas em nenhuma mensagem. Se ninguém as usar em 30 min, saem da hospedagem. */
const pendentes = new Map<string, { autor: number; em: number }>()
const VALIDADE_MS = 30 * 60 * 1000

export function registrarFoto(url: string, autor: number) {
  pendentes.set(url, { autor, em: Date.now() })
}

/** Confere que a foto é do autor e ainda não foi usada; se sim, a reserva e devolve true. */
export function consumirFoto(url: string, autor: number): boolean {
  const p = pendentes.get(url)
  if (!p || p.autor !== autor || Date.now() - p.em > VALIDADE_MS) return false
  pendentes.delete(url)
  return true
}

async function varrer() {
  const agora = Date.now()
  for (const [url, p] of pendentes) {
    if (agora - p.em <= VALIDADE_MS) continue
    pendentes.delete(url)
    await removerArquivo(url).catch(() => undefined)
  }
}
setInterval(() => void varrer(), 5 * 60 * 1000).unref()
