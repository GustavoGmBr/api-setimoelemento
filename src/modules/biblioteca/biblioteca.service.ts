import { prisma } from '../../lib/prisma.js'

interface CapituloLeve {
  parent_id: number | null
  publicado: boolean
}

/** Campos leves de um livro para listagens (sem texto de capítulo). */
export const livroLeve = {
  id: true,
  titulo: true,
  sinopse: true,
  data_publicacao: true,
  ordem_serie: true,
  capa: true,
  saga_id: true,
  publicado: true,
  capitulos: { select: { parent_id: true, publicado: true } },
} as const

/** Troca a lista de capítulos por contagens: `_count.capitulos` (capítulos) e `n_partes` (subcapítulos). */
export function comContagem<T extends { capitulos: CapituloLeve[] }>(livro: T, publico: boolean) {
  const { capitulos, ...resto } = livro
  const visiveis = publico ? capitulos.filter((c) => c.publicado) : capitulos
  return {
    ...resto,
    _count: { capitulos: visiveis.filter((c) => c.parent_id === null).length },
    n_partes: visiveis.filter((c) => c.parent_id !== null).length,
  }
}

const SEM_ORDEM = 1_000_000_000
export const porOrdem = (a: { ordem: number | null; id: number }, b: { ordem: number | null; id: number }) =>
  (a.ordem ?? SEM_ORDEM) - (b.ordem ?? SEM_ORDEM) || a.id - b.id

/** Sagas com seus livros (e os livros avulsos). `publico` esconde rascunhos e sagas sem livro publicado. */
export async function montarBiblioteca(publico: boolean) {
  const [sagas, livros] = await Promise.all([
    prisma.sagas.findMany(),
    prisma.livros.findMany({ where: publico ? { publicado: true } : {}, select: livroLeve }),
  ])
  const lista = livros
    .map((l) => comContagem(l, publico))
    .sort((a, b) => porOrdem({ ordem: a.ordem_serie, id: a.id }, { ordem: b.ordem_serie, id: b.id }))
  const grupos = sagas
    .sort((a, b) => porOrdem(a, b))
    .map((s) => ({ ...s, livros: lista.filter((l) => l.saga_id === s.id) }))
  return {
    sagas: publico ? grupos.filter((g) => g.livros.length > 0) : grupos,
    semSaga: lista.filter((l) => l.saga_id === null),
  }
}
