import { z } from 'zod'

export const sagaSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  descricao: z.string().nullish(),
  capa: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^(https?:\/\/|\/)/.test(v), 'A capa deve ser um endereço http(s) ou um caminho começando com /')
    .nullish(),
  ordem: z.number().int().nullish(),
})

/** Nova ordem das sagas: { itens: [{ id, ordem }] } */
export const reordenarSagasSchema = z.object({
  itens: z.array(z.object({ id: z.number().int().positive(), ordem: z.number().int() })).min(1).max(500),
})
