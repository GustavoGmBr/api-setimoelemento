import { prisma } from '../lib/prisma.js'
import { removerArquivo } from '../services/ftp.js'

/** Apaga as mensagens do chat com mais de 24h (e as fotos enviadas por elas). */
export async function limparChat(): Promise<number> {
  const agora = new Date()
  const vencidas = await prisma.chat_mensagem.findMany({ where: { expira_em: { lte: agora } }, select: { id: true, midia_url: true }, take: 2000 })
  if (!vencidas.length) return 0
  await prisma.chat_mensagem.deleteMany({ where: { id: { in: vencidas.map((m) => m.id) } } })
  for (const m of vencidas) if (m.midia_url) await removerArquivo(m.midia_url)
  return vencidas.length
}

/** Fotos do chat ligadas a estes leitores (as que enviaram e as das salas que eles criaram). Chame antes de apagar a conta. */
export async function midiasDoChatDe(leitorIds: number[]): Promise<string[]> {
  if (!leitorIds.length) return []
  const rows = await prisma.chat_mensagem.findMany({
    where: { midia_url: { not: null }, OR: [{ autor_id: { in: leitorIds } }, { sala: { dono_id: { in: leitorIds } } }] },
    select: { midia_url: true },
  })
  return rows.map((r) => r.midia_url!).filter(Boolean)
}

/** Roda a cada 10 minutos (e logo depois de ligar). As consultas do chat já ignoram o que venceu. */
export function agendarLimpezaDoChat() {
  const rodar = () => limparChat().catch((e) => console.error('Falha na limpeza do chat:', e))
  setTimeout(rodar, 30_000).unref()
  setInterval(rodar, 10 * 60 * 1000).unref()
}
