import { z } from 'zod'

export const livroSchema = z.object({
  titulo: z.string().trim().min(1).max(255),
  sinopse: z.string().nullish(),
  data_publicacao: z.coerce.date().nullish(),
  ordem_serie: z.number().int().nullish(),
  capa: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^(https?:\/\/|\/)/.test(v), 'A capa deve ser um endereço http(s) ou um caminho começando com /')
    .nullish(),
  saga_id: z.number().int().nullish(),
  /** Rascunho (false) não aparece para o leitor. */
  publicado: z.boolean().optional(),
})

export const filtroLivrosSchema = z.object({
  saga_id: z.coerce.number().int().positive().optional(),
})

/** Nova posição dos livros: { itens: [{ id, saga_id, ordem_serie }] } — mover entre sagas e reordenar. */
export const reordenarLivrosSchema = z.object({
  itens: z
    .array(z.object({ id: z.number().int().positive(), saga_id: z.number().int().positive().nullable(), ordem_serie: z.number().int() }))
    .min(1)
    .max(500),
})
