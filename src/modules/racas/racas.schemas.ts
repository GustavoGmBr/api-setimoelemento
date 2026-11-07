import { z } from 'zod'

export const racaSchema = z.object({
  nome: z.string().trim().min(1, 'O nome é obrigatório').max(80),
  base: z.number().int().min(0),
  limite: z.number().int().min(0),
  mundo: z.string().trim().max(80).default('Geral').transform((m) => m || 'Geral'),
  sistema_id: z.number().int().positive().optional(),
  sistema_ids: z.array(z.number().int().positive()).min(1, 'Escolha ao menos um sistema').optional(),
}).refine((d) => (d.sistema_ids?.length ?? 0) > 0 || d.sistema_id !== undefined, 'Escolha ao menos um sistema')
