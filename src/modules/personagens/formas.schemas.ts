import { z } from 'zod'

const texto = (max: number) => z.string().trim().max(max).nullish().transform((valor) => valor || null)
const imagem = z.string().trim().max(500).refine((valor) => valor === '' || /^(https?:\/\/|\/)/.test(valor), 'Imagem deve ser um endereço http(s) ou um caminho começando com /').nullish().transform((valor) => valor || null)

export const formaSchema = z.object({
  personagem_id: z.number().int().positive(),
  nome: z.string().trim().min(1, 'O título da forma é obrigatório').max(255),
  tipo: z.enum(['Crescimento', 'Transformação']),
  descricao: texto(10000),
  multiplicador: z.number().min(0).max(10000),
  base_pc: z.enum(['erion', 'aetheris', 'soma']),
  padrao: z.boolean().default(false),
  imagemRosto: imagem,
  imagemCorpo: imagem,
})

export type FormaDados = z.infer<typeof formaSchema>
