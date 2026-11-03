import { z } from 'zod'

export const TIPOS_CRIATURA = ['Monstro', 'Criatura'] as const
export const MUNDOS = ['Erion', 'Aetheris', 'Geral'] as const

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

export const criaturaSchema = z.object({
  mundo: z.enum(MUNDOS),
  sistema_id: z.number().int().positive().nullish().transform((v) => v ?? null),
  ranque: texto(40),
  nome: z.string().trim().min(1, 'O nome é obrigatório').max(255),
  tipo: z.enum(TIPOS_CRIATURA),
  habilidades: z.array(z.object({ nome: z.string().trim().min(1).max(120), descricao: z.string().trim().max(2000).default('') })).max(50).default([]),
  /** descrição estética */
  aparencia: texto(5000),
  /** projeção visual (foto) */
  imagemBestiario: texto(255),
  /** recursos obtidos: item cadastrado (item_id) ou próprio da criatura (sem item_id) */
  recursos: z
    .array(
      z.object({
        item_id: z.number().int().positive().nullish().transform((v) => v ?? null),
        nome: z.string().trim().min(1, 'Dê um nome ao recurso').max(255),
        descricao: texto(2000),
      }),
    )
    .max(100)
    .default([]),
})
