import { z } from 'zod'

const ids = z.array(z.coerce.number().int().positive()).nullish()

/** Um bloco do texto do capítulo (narração, diálogo, pensamento...). */
export const blocoSchema = z
  .object({
    tipo: z.enum(['narrativa', 'paragrafo', 'dialogo', 'pensamento', 'quebra_cena', 'quebra-cena', 'citacao']),
    ordem: z.number().int(),
    personagem_id: z.coerce.number().int().nullish(),
    sexo: z.string().trim().nullish(),
    personagens_participantes: ids,
    formas_participantes: ids,
    criaturas_participantes: ids,
    conteudo: z
      .object({
        texto: z.string().nullish(),
        fala: z.string().nullish(),
        personagem_nome: z.string().trim().nullish(),
        tom: z.string().nullish(),
        sentimento: z.string().nullish(),
        acaoPosFala: z.string().nullish(),
        personagem_id: z.union([z.number(), z.string()]).nullish(),
        forma_id: z.coerce.number().nullish(),
      })
      .catchall(z.any()),
  })
  .catchall(z.any())

export const conteudoSchema = z.array(blocoSchema)

export const capituloSchema = z.object({
  livro_id: z.coerce.number().int().positive(),
  parent_id: z.coerce.number().int().positive().nullish(),
  numero: z.coerce.number().int().min(0),
  titulo: z.string().trim().min(1, 'O título é obrigatório').max(255),
  /** Rascunho (false) não aparece para o leitor. */
  publicado: z.boolean().optional(),
  personagens_participantes: ids,
  formas_participantes: ids,
  itens_participantes: ids,
  locais_participantes: ids,
  criaturas_participantes: ids,
  conteudo_json: conteudoSchema.nullish(),
})

export const capituloParcialSchema = capituloSchema.partial()

/** Nova posição dos capítulos de um livro: { itens: [{ id, numero, parent_id }] } — reordenar e mover entre capítulos. */
export const reordenarCapitulosSchema = z.object({
  itens: z
    .array(z.object({ id: z.number().int().positive(), numero: z.number().int().min(0), parent_id: z.number().int().positive().nullable() }))
    .min(1)
    .max(2000),
})
export type CapituloInput = z.infer<typeof capituloSchema>
