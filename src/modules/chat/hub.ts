import type { Response } from 'express'

/** Conexões abertas (SSE) por leitor. Quem tem ao menos uma conexão está online. */
const conexoes = new Map<number, Set<Response>>()

export const idsOnline = () => [...conexoes.keys()]
export const estaOnline = (id: number) => conexoes.has(id)

function escrever(res: Response, evento: string, dados: unknown) {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`)
}

export function enviarPara(ids: number[], evento: string, dados: unknown) {
  for (const id of new Set(ids)) conexoes.get(id)?.forEach((res) => escrever(res, evento, dados))
}

export function transmitir(evento: string, dados: unknown) {
  conexoes.forEach((set) => set.forEach((res) => escrever(res, evento, dados)))
}

/** Registra a conexão e devolve a função que a remove. Avisa todos quando alguém entra ou sai. */
export function registrar(id: number, res: Response): () => void {
  let set = conexoes.get(id)
  const primeira = !set
  if (!set) conexoes.set(id, (set = new Set()))
  set.add(res)
  if (primeira) transmitir('presenca', { id, online: true })
  return () => {
    set!.delete(res)
    if (!set!.size) {
      conexoes.delete(id)
      transmitir('presenca', { id, online: false })
    }
  }
}

export function batimento() {
  conexoes.forEach((set) => set.forEach((res) => res.write(': ping\n\n')))
}
setInterval(batimento, 25_000).unref()
