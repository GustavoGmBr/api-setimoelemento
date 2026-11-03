import { z } from 'zod'

/** Texto opcional: espaços nas pontas saem e vazio vira null. */
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

/** Imagem: endereço http(s) ou caminho da API (/uploads/...). */
const imagem = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^(https?:\/\/|\/)/.test(v), 'Imagem deve ser um endereço http(s) ou um caminho começando com /')
  .nullish()
  .transform((v) => v || null)

export const SEXOS = ['Masculino', 'Feminino', 'Desconhecido'] as const
export const SISTEMAS_PERSONAGEM = ['Nenhum', 'Universal', 'Sauri', 'Ambos (Universal / sauri)'] as const
export const KARMAS = ['Neutro', 'Infâmia Nível 1 (☠️)', 'Infâmia Nível 2 (☠️☠️)', 'Infâmia Nível 3 (☠️☠️☠️)', 'Justo'] as const

export const personagemSchema = z.object({
  nome: z.string().trim().min(1, 'O nome é obrigatório').max(255),
  apelido: texto(255),
  sexo: z.enum(SEXOS).nullish().transform((v) => v ?? null),
  sistema: z.enum(SISTEMAS_PERSONAGEM).nullish().transform((v) => v ?? 'Nenhum'),
  karma: z.enum(KARMAS).nullish().transform((v) => v ?? 'Neutro'),
  mundo_origem: texto(255),
  afiliacao: texto(255),

  altura: texto(255),
  peso: texto(255),
  tipo_corporal: texto(255),
  tipo_cabelo: texto(255),
  cor_cabelo: texto(255),
  olhos: texto(255),
  tom_voz: texto(255),

  traje_combate: texto(5000),
  traje_casual: texto(5000),
  armamento_principal: texto(255),

  virtude: texto(255),
  defeito: texto(255),
  temperamento: texto(255),

  imagemRosto: imagem,
  imagemCorpo: imagem,
})
export type PersonagemInput = z.infer<typeof personagemSchema>
