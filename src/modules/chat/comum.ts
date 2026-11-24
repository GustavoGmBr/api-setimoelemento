import { z } from 'zod'
import { HttpError } from '../../lib/http-error.js'
import { prisma } from '../../lib/prisma.js'
import { estaOnline } from './hub.js'
import { consumirFoto } from './fotos.js'
import { resolverMarcacoes, TIPOS_MARCACAO } from './marcacoes.js'

export const VIDA_MS = 24 * 60 * 60 * 1000
export const LIMITE_PADRAO = 50
export const id = z.coerce.number().int().positive()

export const AUTOR = { select: { id: true, login: true, nome_exibicao: true, avatar_url: true } } as const
export type Autor = { id: number; login: string; nome_exibicao: string | null; avatar_url: string | null }
export const perfil = (l: Autor) => ({ id: l.id, login: l.login, nome_exibicao: l.nome_exibicao, avatar_url: l.avatar_url, online: estaOnline(l.id) })

type Linha = { id: number; autor_id: number; destinatario_id: number | null; sala_id: number | null; texto: string; tipo: string; midia_url: string | null; marcacoes: unknown; criado_em: Date; expira_em: Date; autor: Autor }
export const mensagem = (m: Linha) => ({
  id: m.id, destinatario_id: m.destinatario_id, sala_id: m.sala_id, texto: m.texto, tipo: m.tipo, midia_url: m.midia_url, marcacoes: m.marcacoes,
  criado_em: m.criado_em, expira_em: m.expira_em, autor: perfil(m.autor),
})

export const historico = z.object({ antes: id.optional(), limite: z.coerce.number().int().min(1).max(100).default(LIMITE_PADRAO) })

/** Corpo de uma mensagem: texto, uma foto já enviada (URL devolvida por /chat/foto) e até 5 marcações. */
const corpo = z
  .object({
    texto: z.string().trim().max(1000).default(''),
    foto: z.string().max(500).optional(),
    marcacoes: z.array(z.object({ tipo: z.enum(TIPOS_MARCACAO), id })).max(5).default([]),
  })
  .refine((c) => c.texto.length > 0 || !!c.foto || c.marcacoes.length > 0, { message: 'Escreva algo, anexe uma foto ou marque um conteúdo' })

export async function dadosDaMensagem(autorId: number, body: unknown) {
  const c = corpo.parse(body)
  if (c.foto && !consumirFoto(c.foto, autorId)) throw new HttpError(400, 'Foto inválida ou expirada. Envie a foto de novo.')
  const marcacoes = c.marcacoes.length ? await resolverMarcacoes(c.marcacoes) : []
  return {
    texto: c.texto,
    tipo: c.foto ? 'imagem' : 'texto',
    midia_url: c.foto ?? null,
    marcacoes: marcacoes.length ? marcacoes : undefined,
    expira_em: new Date(Date.now() + VIDA_MS),
  }
}

export async function saoAmigos(a: number, b: number): Promise<boolean> {
  const x = await prisma.chat_amizade.findFirst({ where: { status: 'aceita', OR: [{ de_id: a, para_id: b }, { de_id: b, para_id: a }] }, select: { id: true } })
  return !!x
}

export async function idsDeAmigos(eu: number): Promise<number[]> {
  const l = await prisma.chat_amizade.findMany({ where: { status: 'aceita', OR: [{ de_id: eu }, { para_id: eu }] }, select: { de_id: true, para_id: true } })
  return l.map((a) => (a.de_id === eu ? a.para_id : a.de_id))
}
