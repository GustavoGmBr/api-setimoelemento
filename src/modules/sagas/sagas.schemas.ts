import { z } from 'zod'

export const sagaSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  descricao: z.string().nullish(),
})
