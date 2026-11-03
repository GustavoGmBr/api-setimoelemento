import { z } from 'zod'

export const racaSchema = z.object({
  nome: z.string().trim().min(1, 'O nome é obrigatório').max(80),
  base: z.number().int().min(0),
  limite: z.number().int().min(0),
  mundo: z.string().trim().max(80).default('Geral').transform((m) => m || 'Geral'),
  sistema_id: z.number().int().positive('Escolha um sistema'),
})
