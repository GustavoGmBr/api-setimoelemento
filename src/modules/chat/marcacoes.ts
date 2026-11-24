import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/http-error.js'

export const TIPOS_MARCACAO = ['capitulo', 'personagem', 'criatura', 'item', 'local'] as const
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number]
export type Marcacao = { tipo: TipoMarcacao; id: number; rotulo: string; sub?: string; url: string }

const ver = (rota: string, id: number, nome: string) => `${rota}?ver=${id}&nome=${encodeURIComponent(nome)}`

/** Personagens visíveis ao público: os que aparecem em algum capítulo (os outros seriam spoiler). Guardado 60 s. */
let cachePersonagens: { ate: number; ids: Set<number> } | null = null
async function personagensVisiveis(): Promise<Set<number>> {
  if (cachePersonagens && cachePersonagens.ate > Date.now()) return cachePersonagens.ids
  const [capitulos, historicos] = await Promise.all([
    prisma.capitulos.findMany({ select: { personagens_participantes: true } }),
    prisma.personagem_historico.findMany({ where: { capitulo_id: { not: null } }, select: { personagem_id: true }, distinct: ['personagem_id'] }),
  ])
  const ids = new Set(historicos.map((h) => h.personagem_id))
  for (const c of capitulos) {
    if (!Array.isArray(c.personagens_participantes)) continue
    for (const v of c.personagens_participantes) {
      const n = Number(v)
      if (Number.isInteger(n) && n > 0) ids.add(n)
    }
  }
  cachePersonagens = { ate: Date.now() + 60_000, ids }
  return ids
}

const capituloVisivel = { publicado: true, livros: { publicado: true } } as const

/** Procura conteúdos do site para marcar numa mensagem (só o que o público já pode ver). */
export async function buscarMarcacoes(q: string, tipo?: TipoMarcacao): Promise<Marcacao[]> {
  const quer = (t: TipoMarcacao) => !tipo || tipo === t
  const take = tipo ? 20 : 6
  const [caps, pers, cria, itens, locais] = await Promise.all([
    quer('capitulo')
      ? prisma.capitulos.findMany({ where: { ...capituloVisivel, titulo: { contains: q } }, select: { id: true, titulo: true, parent_id: true, livro_id: true, livros: { select: { titulo: true } } }, orderBy: [{ livro_id: 'asc' }, { numero: 'asc' }], take })
      : [],
    quer('personagem')
      ? personagensVisiveis().then((ids) => prisma.personagens.findMany({ where: { id: { in: [...ids] }, OR: [{ nome: { contains: q } }, { apelido: { contains: q } }] }, select: { id: true, nome: true, apelido: true }, orderBy: { nome: 'asc' }, take }))
      : [],
    quer('criatura') ? prisma.bestiario.findMany({ where: { nome: { contains: q } }, select: { id: true, nome: true, tipo: true }, orderBy: { nome: 'asc' }, take }) : [],
    quer('item') ? prisma.itens.findMany({ where: { nome: { contains: q } }, select: { id_item: true, nome: true, tipo: true }, orderBy: { nome: 'asc' }, take }) : [],
    quer('local') ? prisma.locais.findMany({ where: { nome: { contains: q } }, select: { id: true, nome: true, mundo: true }, orderBy: { nome: 'asc' }, take }) : [],
  ])
  return [
    ...caps.map((c): Marcacao => ({ tipo: 'capitulo', id: c.id, rotulo: c.titulo, sub: c.livros.titulo, url: c.parent_id === null ? `/livros/${c.livro_id}` : `/leitura/${c.id}` })),
    ...pers.map((p): Marcacao => ({ tipo: 'personagem', id: p.id, rotulo: p.nome, ...(p.apelido ? { sub: p.apelido } : {}), url: ver('/personagens', p.id, p.nome) })),
    ...cria.map((c): Marcacao => ({ tipo: 'criatura', id: c.id, rotulo: c.nome, sub: c.tipo, url: ver('/bestiario', c.id, c.nome) })),
    ...itens.map((i): Marcacao => ({ tipo: 'item', id: i.id_item, rotulo: i.nome, sub: i.tipo, url: ver('/itens', i.id_item, i.nome) })),
    ...locais.map((l): Marcacao => ({ tipo: 'local', id: l.id, rotulo: l.nome, sub: l.mundo, url: ver('/locais', l.id, l.nome) })),
  ]
}

/** Confere cada marcação no banco e monta o rótulo e o endereço — o cliente nunca define o que é exibido. */
export async function resolverMarcacoes(pedidas: { tipo: TipoMarcacao; id: number }[]): Promise<Marcacao[]> {
  const unicas = pedidas.filter((p, i) => pedidas.findIndex((x) => x.tipo === p.tipo && x.id === p.id) === i)
  const saida: Marcacao[] = []
  for (const p of unicas) {
    let m: Marcacao | undefined
    if (p.tipo === 'capitulo') {
      const c = await prisma.capitulos.findFirst({ where: { id: p.id, ...capituloVisivel }, select: { id: true, titulo: true, parent_id: true, livro_id: true, livros: { select: { titulo: true } } } })
      if (c) m = { tipo: 'capitulo', id: c.id, rotulo: c.titulo, sub: c.livros.titulo, url: c.parent_id === null ? `/livros/${c.livro_id}` : `/leitura/${c.id}` }
    } else if (p.tipo === 'personagem') {
      const ok = (await personagensVisiveis()).has(p.id)
      const x = ok ? await prisma.personagens.findUnique({ where: { id: p.id }, select: { id: true, nome: true, apelido: true } }) : null
      if (x) m = { tipo: 'personagem', id: x.id, rotulo: x.nome, ...(x.apelido ? { sub: x.apelido } : {}), url: ver('/personagens', x.id, x.nome) }
    } else if (p.tipo === 'criatura') {
      const x = await prisma.bestiario.findUnique({ where: { id: p.id }, select: { id: true, nome: true, tipo: true } })
      if (x) m = { tipo: 'criatura', id: x.id, rotulo: x.nome, sub: x.tipo, url: ver('/bestiario', x.id, x.nome) }
    } else if (p.tipo === 'item') {
      const x = await prisma.itens.findUnique({ where: { id_item: p.id }, select: { id_item: true, nome: true, tipo: true } })
      if (x) m = { tipo: 'item', id: x.id_item, rotulo: x.nome, sub: x.tipo, url: ver('/itens', x.id_item, x.nome) }
    } else {
      const x = await prisma.locais.findUnique({ where: { id: p.id }, select: { id: true, nome: true, mundo: true } })
      if (x) m = { tipo: 'local', id: x.id, rotulo: x.nome, sub: x.mundo, url: ver('/locais', x.id, x.nome) }
    }
    if (!m) throw new HttpError(400, 'Uma das marcações não existe ou ainda não está disponível')
    saida.push(m)
  }
  return saida
}
