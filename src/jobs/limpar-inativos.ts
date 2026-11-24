import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { removerArquivo } from '../services/ftp.js'
import { midiasDoChatDe } from './limpar-chat.js'

/**
 * Apaga as contas de leitor sem acesso há INATIVIDADE_DIAS (padrão 30), com tudo o que têm
 * (leituras, comentários, avaliações, mensagens do chat e a foto de perfil).
 */
export async function limparInativos(): Promise<number> {
  const limite = new Date(Date.now() - env.INATIVIDADE_DIAS * 24 * 60 * 60 * 1000)
  const inativos = await prisma.leitores.findMany({ where: { ultimo_acesso: { lt: limite } }, select: { id: true, avatar_url: true } })
  if (!inativos.length) return 0
  const fotos = await midiasDoChatDe(inativos.map((l) => l.id))
  await prisma.leitores.deleteMany({ where: { id: { in: inativos.map((l) => l.id) } } })
  for (const l of inativos) await removerArquivo(l.avatar_url)
  for (const f of fotos) await removerArquivo(f)
  console.log(`Limpeza: ${inativos.length} conta(s) de leitor inativa(s) apagada(s)`)
  return inativos.length
}

/** Roda pouco depois de ligar o servidor e depois de 6 em 6 horas. */
export function agendarLimpezaDeInativos() {
  const rodar = () => limparInativos().catch((e) => console.error('Falha na limpeza de inativos:', e))
  setTimeout(rodar, 60_000).unref()
  setInterval(rodar, 6 * 60 * 60 * 1000).unref()
}
