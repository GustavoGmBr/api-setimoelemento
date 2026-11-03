import { z } from 'zod'

export const CATEGORIAS = ['equipamento', 'item'] as const
export const MUNDOS_ITEM = ['Erion', 'Aetheris', 'Geral'] as const
export const TIPOS_POR_CATEGORIA = {
  equipamento: ['Arma', 'Armadura / Defesa', 'Acessório'],
  item: ['Consumível', 'Material', 'Item chave'],
} as const

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

const valor = z.number().min(0).max(999999999999).nullish().transform((v) => v ?? null)

const habilidade = z.object({ nome: z.string().trim().min(1).max(120), descricao: z.string().trim().max(2000).default('') })

/**
 * Item do universo. Equipamento tem habilidades e efeitos passivos; item comum só tem efeitos (consumível).
 * Os campos que não pertencem à categoria escolhida são descartados.
 */
export const itemSchema = z
  .object({
    categoria: z.enum(CATEGORIAS),
    mundo: z.enum(MUNDOS_ITEM),
    sistema_id: z.number().int().positive().nullish().transform((v) => v ?? null),
    ranque: texto(40),
    nome: z.string().trim().min(1, 'O nome é obrigatório').max(100),
    tipo: z.string().trim().min(1, 'Escolha o tipo'),
    /** lore do item */
    descricao: texto(10000),
    habilidades: z.array(habilidade).max(50).default([]),
    efeitos: texto(5000),
    valor_venda: valor,
    valor_compra: valor,
    /** descrição estética */
    aparencia: texto(5000),
    /** projeção visual (foto) */
    urlImagem: texto(255),
  })
  .superRefine((d, ctx) => {
    if (!(TIPOS_POR_CATEGORIA[d.categoria] as readonly string[]).includes(d.tipo)) ctx.addIssue({ code: 'custom', path: ['tipo'], message: `Tipo inválido para ${d.categoria}` })
  })
  .transform((d) => ({
    categoria: d.categoria,
    mundo: d.mundo,
    sistema_id: d.sistema_id,
    ranque: d.sistema_id ? d.ranque : null,
    nome: d.nome,
    tipo: d.tipo,
    descricao: d.descricao,
    aparencia: d.aparencia,
    // a foto é só do equipamento
    urlImagem: d.categoria === 'equipamento' ? d.urlImagem : null,
    listaHabilidades: d.categoria === 'equipamento' ? d.habilidades : [],
    efeitos: d.categoria === 'item' && d.tipo === 'Consumível' ? d.efeitos : null,
    // venda só para material; compra para consumível e item chave
    valor_venda: d.categoria === 'item' && d.tipo === 'Material' ? d.valor_venda : null,
    valor_compra: d.categoria === 'item' && (d.tipo === 'Consumível' || d.tipo === 'Item chave') ? d.valor_compra : null,
  }))
