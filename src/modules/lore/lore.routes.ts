import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'

/**
 * Resumo do universo para assistentes de escrita (n8n + Gemini): GET /api/lore
 * Só traz o que o leitor já pode ver: livros e capítulos publicados e os personagens que
 * aparecem neles. Itens, locais e criaturas seguem a mesma regra do catálogo público.
 * `?formato=texto` devolve Markdown (mais enxuto para colocar direto no prompt).
 */
export const loreRoutes = Router()

type Texto = string | null | undefined
const t = (v: Texto) => (v ?? '').trim()

/** Lista [{ nome, descricao }] (habilidades) ou texto simples, vinda de colunas Json. */
function habilidades(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  return valor
    .map((h) => {
      if (typeof h === 'string') return h.trim()
      if (h && typeof h === 'object') {
        const o = h as Record<string, unknown>
        const nome = typeof o.nome === 'string' ? o.nome.trim() : ''
        const desc = typeof o.descricao === 'string' ? o.descricao.trim() : ''
        return [nome, desc].filter(Boolean).join(': ')
      }
      return ''
    })
    .filter(Boolean)
}

async function montarLore() {
  const [sagas, livros, capitulos] = await Promise.all([
    prisma.sagas.findMany({ orderBy: [{ ordem: 'asc' }, { id: 'asc' }] }),
    prisma.livros.findMany({ where: { publicado: true }, orderBy: [{ ordem_serie: 'asc' }, { id: 'asc' }] }),
    prisma.capitulos.findMany({ where: { publicado: true }, orderBy: [{ numero: 'asc' }, { id: 'asc' }], select: { id: true, livro_id: true, parent_id: true, numero: true, titulo: true, personagens_participantes: true } }),
  ])

  const idsPersonagens = new Set<number>()
  for (const c of capitulos) {
    if (!Array.isArray(c.personagens_participantes)) continue
    for (const valor of c.personagens_participantes) {
      const id = Number(valor)
      if (Number.isInteger(id) && id > 0) idsPersonagens.add(id)
    }
  }
  const comHistorico = await prisma.personagem_historico.findMany({ where: { capitulo: { publicado: true } }, select: { personagem_id: true }, distinct: ['personagem_id'] })
  for (const h of comHistorico) idsPersonagens.add(h.personagem_id)

  const [personagens, itens, locais, criaturas] = await Promise.all([
    idsPersonagens.size
      ? prisma.personagens.findMany({
          where: { id: { in: [...idsPersonagens] } },
          orderBy: { nome: 'asc' },
          include: {
            formas: { orderBy: { nome: 'asc' } },
            historicos: {
              where: { OR: [{ capitulo: { publicado: true } }, { capitulo_id: null, livro: { publicado: true } }] },
              orderBy: { id: 'asc' },
              include: { raca: { select: { nome: true } }, livro: { select: { titulo: true } }, capitulo: { select: { numero: true, titulo: true, parent: { select: { numero: true } } } } },
            },
          },
        })
      : Promise.resolve([]),
    prisma.itens.findMany({ orderBy: [{ categoria: 'asc' }, { nome: 'asc' }] }),
    prisma.locais.findMany({ orderBy: { nome: 'asc' } }),
    prisma.bestiario.findMany({ orderBy: { nome: 'asc' } }),
  ])

  const livrosPorSaga = (sagaId: number | null) => livros.filter((l) => l.saga_id === sagaId)
  const formatarLivro = (l: (typeof livros)[number]) => ({
    titulo: l.titulo,
    sinopse: t(l.sinopse) || null,
    capitulos: capitulos.filter((c) => c.livro_id === l.id && c.parent_id === null).map((c) => ({ numero: c.numero, titulo: c.titulo })),
  })

  return {
    gerado_em: new Date().toISOString(),
    resumo: {
      sagas: sagas.map((s) => ({ nome: s.nome, descricao: t(s.descricao) || null, livros: livrosPorSaga(s.id).map(formatarLivro) })).filter((s) => s.livros.length || s.descricao),
      livros_sem_saga: livrosPorSaga(null).map(formatarLivro),
    },
    personagens: personagens.map((p) => ({
      nome: p.nome,
      apelido: p.apelido,
      titulo: p.titulo,
      sexo: p.sexo,
      mundo_origem: p.mundo_origem,
      classe: p.classe,
      afiliacao: p.afiliacao,
      karma: p.karma,
      sistema: p.sistema,
      aparencia: {
        altura: p.altura,
        tipo_corporal: p.tipo_corporal,
        cabelo: [p.tipo_cabelo, p.cor_cabelo].filter(Boolean).join(', ') || null,
        olhos: p.olhos,
        olhos_especiais: p.olhos_especiais,
        tom_voz: p.tom_voz,
      },
      personalidade: { temperamento: p.temperamento, virtude: p.virtude, defeito: p.defeito },
      armamento_principal: p.armamento_principal,
      formas: p.formas.map((f) => ({ nome: f.nome, tipo: f.tipo, padrao: f.padrao, antiga: f.antiga, descricao: t(f.descricao) || null })),
      momentos: p.historicos.map((h) => ({
        livro: h.livro?.titulo ?? null,
        capitulo: h.capitulo ? `${h.capitulo.parent ? `${h.capitulo.parent.numero}.` : ''}${h.capitulo.numero} · ${h.capitulo.titulo}` : null,
        idade: h.idade,
        titulo: h.titulo,
        raca: h.raca.nome,
        ranque: h.ranque,
        classificacao: h.classificacao,
        arquetipo: h.arquetipo,
        resumo: t(h.resumo) || null,
      })),
    })),
    itens: itens.map((i) => ({ nome: i.nome, tipo: i.tipo, categoria: i.categoria, mundo: i.mundo, ranque: i.ranque, descricao: t(i.descricao) || null, aparencia: t(i.aparencia) || null, efeitos: t(i.efeitos) || null, habilidades: habilidades(i.listaHabilidades) })),
    locais: locais.map((l) => ({ nome: l.nome, mundo: l.mundo, dimensao: l.dimensao, descricao: t(l.descricao) || null })),
    criaturas: criaturas.map((c) => ({ nome: c.nome, tipo: c.tipo, mundo: c.mundo, ranque: c.ranque, descricao: t(c.descricao) || null, aparencia: t(c.aparencia) || null, informacoes: t(c.informacoes_complementares) || null, habilidades: habilidades(c.habilidades) })),
  }
}

type Lore = Awaited<ReturnType<typeof montarLore>>

const linha = (rotulo: string, valor: unknown) => (valor === null || valor === undefined || valor === '' ? '' : `- ${rotulo}: ${String(valor)}\n`)

function emTexto(l: Lore): string {
  let s = '# UNIVERSO DA HISTÓRIA (apenas o que já foi publicado)\n\n## RESUMO DA HISTÓRIA\n'
  for (const saga of l.resumo.sagas) {
    s += `\n### Saga: ${saga.nome}\n${saga.descricao ? saga.descricao + '\n' : ''}`
    for (const livro of saga.livros) s += `\n**${livro.titulo}**\n${livro.sinopse ?? ''}\n${livro.capitulos.length ? 'Capítulos: ' + livro.capitulos.map((c) => `${c.numero}. ${c.titulo}`).join('; ') + '\n' : ''}`
  }
  for (const livro of l.resumo.livros_sem_saga) s += `\n**${livro.titulo}**\n${livro.sinopse ?? ''}\n${livro.capitulos.length ? 'Capítulos: ' + livro.capitulos.map((c) => `${c.numero}. ${c.titulo}`).join('; ') + '\n' : ''}`

  s += '\n## PERSONAGENS\n'
  for (const p of l.personagens) {
    s += `\n### ${p.nome}${p.apelido ? ` ("${p.apelido}")` : ''}\n`
    s += linha('Título', p.titulo) + linha('Sexo', p.sexo) + linha('Origem', p.mundo_origem) + linha('Classe', p.classe) + linha('Afiliação', p.afiliacao) + linha('Karma', p.karma) + linha('Sistema', p.sistema)
    s += linha('Altura', p.aparencia.altura) + linha('Corpo', p.aparencia.tipo_corporal) + linha('Cabelo', p.aparencia.cabelo) + linha('Olhos', p.aparencia.olhos) + linha('Olhos especiais', p.aparencia.olhos_especiais) + linha('Voz', p.aparencia.tom_voz)
    s += linha('Temperamento', p.personalidade.temperamento) + linha('Virtude', p.personalidade.virtude) + linha('Defeito', p.personalidade.defeito) + linha('Armamento principal', p.armamento_principal)
    for (const f of p.formas) s += `- Forma "${f.nome}" (${f.tipo}${f.padrao ? ', padrão' : ''}${f.antiga ? ', antiga' : ''}): ${f.descricao ?? ''}\n`
    for (const m of p.momentos) s += `- Momento${m.livro ? ` em ${m.livro}` : ''}${m.capitulo ? ` (cap. ${m.capitulo})` : ''}: ${[m.titulo, m.idade != null ? `${m.idade} anos` : null, m.raca, m.ranque, m.classificacao, m.arquetipo].filter(Boolean).join(' · ')}${m.resumo ? ' — ' + m.resumo : ''}\n`
  }

  s += '\n## ITENS\n'
  for (const i of l.itens) s += `\n### ${i.nome} (${i.tipo}, ${i.categoria}, ${i.mundo}${i.ranque ? ', ' + i.ranque : ''})\n${i.descricao ?? ''}\n${linha('Aparência', i.aparencia)}${linha('Efeitos', i.efeitos)}${i.habilidades.map((h) => `- Habilidade: ${h}\n`).join('')}`

  s += '\n## LOCAIS\n'
  for (const x of l.locais) s += `\n### ${x.nome} (${x.mundo}${x.dimensao ? ', ' + x.dimensao : ''})\n${x.descricao ?? ''}\n`

  s += '\n## CRIATURAS\n'
  for (const c of l.criaturas) s += `\n### ${c.nome} (${c.tipo}${c.mundo ? ', ' + c.mundo : ''}${c.ranque ? ', ' + c.ranque : ''})\n${c.descricao ?? ''}\n${linha('Aparência', c.aparencia)}${linha('Informações', c.informacoes)}${c.habilidades.map((h) => `- Habilidade: ${h}\n`).join('')}`
  return s
}

/** Cache curto: o n8n consulta a cada mensagem do chat. */
let cache: { em: number; dados: Lore } | null = null

/** Lore público (com cache de 1 min), também usado pelo assistente. */
export async function obterLore(): Promise<Lore> {
  if (!cache || Date.now() - cache.em > 60_000) cache = { em: Date.now(), dados: await montarLore() }
  return cache.dados
}

export async function obterLoreEmTexto(): Promise<string> {
  return emTexto(await obterLore())
}

loreRoutes.get('/', async (req, res) => {
  await obterLore()
  if (req.query.formato === 'texto') {
    if (req.query.baixar === '1') res.setHeader('Content-Disposition', 'attachment; filename="lore.md"')
    return res.type('text/markdown; charset=utf-8').send(emTexto(cache!.dados))
  }
  res.json(cache!.dados)
})
