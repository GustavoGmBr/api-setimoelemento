import { z } from 'zod'

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

/** Um item dentro de uma bolsa. */
export const inventarioSchema = z.object({
  bolsa_id: z.number().int().positive(),
  nome: z.string().trim().min(1, 'O nome é obrigatório').max(255),
  descricao: texto(5000),
  /** Arma, Armadura, Consumível… (livre). "Moeda" não ocupa espaço e aparece à parte. */
  tipo: texto(100),
  subtipo: texto(100),
  /** Raridade/grau do item */
  grau: texto(100),
  quantidade: z.number().min(0).max(999999999999).default(1),
  /** item do catálogo do universo, se houver */
  item_id: z.number().int().positive().nullish().transform((v) => v ?? null),
})

export const bolsaSchema = z.object({
  historico_id: z.number().int().positive(),
  nome: z.string().trim().min(1).max(100).default('Bolsa'),
  slots: z.number().int().min(1).max(500).default(30),
})

export const bolsaEdicaoSchema = bolsaSchema.omit({ historico_id: true })
