import { Prisma } from '@prisma/client'
import { HttpError, naoEncontrado } from '../../lib/http-error.js'
import { prisma } from '../../lib/prisma.js'
import type { CapituloInput } from './capitulos.schemas.js'

type Posicao = { id: number; numero: number; parent_id: number | null }

/** Campos leves para listagens (sem o texto). */
const resumo = { id: true, livro_id: true, parent_id: true, numero: true, titulo: true, publicado: true } satisfies Prisma.capitulosSelect
const ordenar = { numero: 'asc' } as const

/** Json do banco: lista vazia ou null viram NULL de verdade. */
function json(valor: unknown[] | null | undefined) {
  if (valor === undefined) return undefined
  if (valor === null || valor.length === 0) return Prisma.JsonNull
  return valor as Prisma.InputJsonValue
}

function lerIds(campo: unknown): number[] {
  return Array.isArray(campo) ? campo.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
}

/** Capítulos de um livro, com subcapítulos (2 níveis), sem o texto. */
export function listarPorLivro(livroId: number, publico = true) {
  const visivel = publico ? { publicado: true } : {}
  return prisma.capitulos.findMany({
    where: { livro_id: livroId, parent_id: null, ...visivel },
    orderBy: ordenar,
    select: {
      ...resumo,
      personagens_participantes: true,
      formas_participantes: true,
      children: {
        where: visivel,
        orderBy: ordenar,
        select: resumo,
      },
    },
  })
}

/** Últimos subcapítulos publicados (só eles têm texto para ler). */
export function listarRecentes() {
  return prisma.capitulos.findMany({
    take: 10,
    where: { publicado: true, parent_id: { not: null }, parent: { publicado: true }, livros: { publicado: true } },
    orderBy: { id: 'desc' },
    select: { ...resumo, livros: { select: { titulo: true } } },
  })
}

/** Capítulo completo + nome dos personagens, formas, locais, itens e criaturas citados. */
export async function obter(id: number, publico = true) {
  const capitulo = await prisma.capitulos.findUnique({
    where: { id },
    include: {
      children: { where: publico ? { publicado: true } : {}, orderBy: ordenar, select: resumo },
      livros: { select: { titulo: true, publicado: true } },
      parent: { select: { titulo: true, numero: true, publicado: true } },
    },
  })
  if (!capitulo) throw naoEncontrado('Capítulo')
  // rascunho (do capítulo, do pai ou do livro) só o autor enxerga
  if (publico && (!capitulo.publicado || !capitulo.livros.publicado || (capitulo.parent && !capitulo.parent.publicado))) {
    throw naoEncontrado('Capítulo')
  }

  // Subcapítulo sem elenco próprio usa o do capítulo pai.
  const pai = capitulo.parent_id
    ? await prisma.capitulos.findUnique({ where: { id: capitulo.parent_id }, select: { personagens_participantes: true, formas_participantes: true } })
    : null
  const idsFormasAtuais = lerIds(capitulo.formas_participantes)
  const idsFormas = idsFormasAtuais.length ? idsFormasAtuais : lerIds(pai?.formas_participantes)
  const idsElencoAtual = lerIds(capitulo.personagens_participantes)
  const idsElenco = idsElencoAtual.length ? idsElencoAtual : lerIds(pai?.personagens_participantes)

  const [personagens, formas, locais, itens, criaturas] = await Promise.all([
    buscar(idsElenco, (in_) =>
      prisma.personagens.findMany({ where: { id: { in: in_ } }, select: { id: true, nome: true, apelido: true, sexo: true, imagemRosto: true } }),
    ),
    idsFormas.length || idsElenco.length
      ? prisma.personagem_forma.findMany({
          where: { OR: [{ id: { in: idsFormas } }, { personagem_id: { in: idsElenco }, padrao: true }] },
          select: { id: true, nome: true, personagem_id: true, tipo: true, descricao: true, multiplicador: true, padrao: true, antiga: true, imagemRosto: true, imagemCorpo: true },
        })
      : Promise.resolve([]),
    buscar(capitulo.locais_participantes, (in_) =>
      prisma.locais.findMany({ where: { id: { in: in_ } }, select: { id: true, nome: true } }),
    ),
    buscar(capitulo.itens_participantes, (in_) =>
      prisma.itens.findMany({ where: { id_item: { in: in_ } }, select: { id_item: true, nome: true } }),
    ),
    buscar(capitulo.criaturas_participantes, (in_) =>
      prisma.bestiario.findMany({
        where: { id: { in: in_ } },
        select: { id: true, nome: true, tipo: true, ranque: true, imagemBestiario: true, classificacao: true, nivelMedio: true },
      }),
    ),
  ])

  return {
    ...capitulo,
    personagens_detalhes: personagens,
    formas_detalhes: formas,
    locais_detalhes: locais,
    itens_detalhes: itens,
    criaturas_detalhes: criaturas,
  }
}

async function buscar<T>(campo: unknown, consulta: (ids: number[]) => Promise<T[]>): Promise<T[]> {
  const ids = lerIds(campo)
  return ids.length ? consulta(ids) : []
}

/**
 * Estrutura: livro → capítulo → subcapítulo. Só o subcapítulo tem texto.
 * O pai precisa existir, ser do mesmo livro e ser um capítulo (não outro subcapítulo).
 */
async function validarPai(parentId: number, livroId: number, proprioId?: number) {
  if (parentId === proprioId) throw new HttpError(400, 'Um capítulo não pode ficar dentro dele mesmo')
  const pai = await prisma.capitulos.findUnique({ where: { id: parentId }, select: { livro_id: true, parent_id: true } })
  if (!pai) throw new HttpError(400, 'Capítulo pai não encontrado')
  if (pai.livro_id !== livroId) throw new HttpError(400, 'O capítulo pai é de outro livro')
  if (pai.parent_id !== null) throw new HttpError(400, 'Subcapítulos não podem ter subcapítulos')
  if (proprioId !== undefined) {
    const filhos = await prisma.capitulos.count({ where: { parent_id: proprioId } })
    if (filhos > 0) throw new HttpError(400, 'Este capítulo tem subcapítulos e não pode virar subcapítulo')
  }
}

/** Capítulos (sem pai) não guardam texto: ele vive nos subcapítulos. */
async function exigirSubcapitulo(id: number) {
  const cap = await prisma.capitulos.findUnique({ where: { id }, select: { parent_id: true } })
  if (!cap) throw naoEncontrado('Capítulo')
  if (cap.parent_id === null) throw new HttpError(400, 'O texto fica nos subcapítulos, não no capítulo')
}

export async function criar(dados: CapituloInput) {
  const livro = await prisma.livros.findUnique({ where: { id: dados.livro_id }, select: { id: true } })
  if (!livro) throw new HttpError(400, 'Livro não encontrado')
  if (dados.parent_id) await validarPai(dados.parent_id, dados.livro_id)
  else if (dados.conteudo_json?.length) throw new HttpError(400, 'O texto fica nos subcapítulos, não no capítulo')

  return prisma.capitulos.create({
    data: {
      livro_id: dados.livro_id,
      parent_id: dados.parent_id ?? null,
      numero: dados.numero,
      titulo: dados.titulo,
      ...(dados.publicado !== undefined && { publicado: dados.publicado }),
      personagens_participantes: json(dados.personagens_participantes),
      formas_participantes: json(dados.formas_participantes),
      itens_participantes: json(dados.itens_participantes),
      locais_participantes: json(dados.locais_participantes),
      criaturas_participantes: json(dados.criaturas_participantes),
      conteudo_json: json(dados.conteudo_json),
    },
  })
}

export async function atualizar(id: number, dados: Partial<CapituloInput>) {
  const atual = await prisma.capitulos.findUnique({ where: { id }, select: { livro_id: true, parent_id: true } })
  if (!atual) throw naoEncontrado('Capítulo')

  const livroId = dados.livro_id ?? atual.livro_id
  const parentId = dados.parent_id === undefined ? atual.parent_id : dados.parent_id
  if (parentId && (dados.parent_id !== undefined || dados.livro_id !== undefined)) {
    await validarPai(parentId, livroId, id)
  }
  if (!parentId && dados.conteudo_json?.length) throw new HttpError(400, 'O texto fica nos subcapítulos, não no capítulo')

  return prisma.capitulos.update({
    where: { id },
    data: {
      ...(dados.livro_id !== undefined && { livro_id: dados.livro_id }),
      ...(dados.parent_id !== undefined && { parent_id: dados.parent_id }),
      ...(dados.numero !== undefined && { numero: dados.numero }),
      ...(dados.titulo !== undefined && { titulo: dados.titulo }),
      ...(dados.publicado !== undefined && { publicado: dados.publicado }),
      personagens_participantes: json(dados.personagens_participantes),
      formas_participantes: json(dados.formas_participantes),
      itens_participantes: json(dados.itens_participantes),
      locais_participantes: json(dados.locais_participantes),
      criaturas_participantes: json(dados.criaturas_participantes),
      conteudo_json: json(dados.conteudo_json),
    },
  })
}

export async function salvarConteudo(id: number, blocos: unknown[]) {
  await exigirSubcapitulo(id)
  return prisma.capitulos.update({
    where: { id },
    data: { conteudo_json: json(blocos) },
    select: { ...resumo },
  })
}

/** Esvazia o texto e os participantes, mantendo número e título. */
export async function limparConteudo(id: number) {
  await exigirSubcapitulo(id)
  return prisma.capitulos.update({
    where: { id },
    data: {
      conteudo_json: Prisma.JsonNull,
      personagens_participantes: Prisma.JsonNull,
      formas_participantes: Prisma.JsonNull,
      itens_participantes: Prisma.JsonNull,
      locais_participantes: Prisma.JsonNull,
      criaturas_participantes: Prisma.JsonNull,
    },
    select: { ...resumo },
  })
}

/**
 * Define número e pai de vários capítulos do mesmo livro de uma vez (arrastar e soltar).
 * Mantém a regra livro → capítulo → subcapítulo: só capítulo (sem pai) pode ter filhos.
 */
export async function reordenar(itens: Posicao[]) {
  const atuais = await prisma.capitulos.findMany({ where: { id: { in: itens.map((i) => i.id) } }, select: { id: true, livro_id: true } })
  if (atuais.length !== new Set(itens.map((i) => i.id)).size) throw new HttpError(400, 'Há capítulos que não existem mais')
  const livros = new Set(atuais.map((c) => c.livro_id))
  if (livros.size !== 1) throw new HttpError(400, 'Os capítulos precisam ser do mesmo livro')
  const [livroId] = [...livros] as [number]

  // estrutura final do livro: o que veio no corpo sobrescreve o que está no banco
  const todos = await prisma.capitulos.findMany({ where: { livro_id: livroId }, select: { id: true, parent_id: true } })
  const paiFinal = new Map(todos.map((c) => [c.id, c.parent_id]))
  for (const i of itens) paiFinal.set(i.id, i.parent_id)
  for (const [id, pai] of paiFinal) {
    if (pai === null) continue
    if (pai === id) throw new HttpError(400, 'Um capítulo não pode ficar dentro dele mesmo')
    if (!paiFinal.has(pai)) throw new HttpError(400, 'Capítulo pai não encontrado neste livro')
    if (paiFinal.get(pai) !== null) throw new HttpError(400, 'Subcapítulos não podem ter subcapítulos')
  }

  await prisma.$transaction(itens.map((i) => prisma.capitulos.update({ where: { id: i.id }, data: { numero: i.numero, parent_id: i.parent_id } })))
}

export async function remover(id: number) {
  await prisma.capitulos.delete({ where: { id } })
}
