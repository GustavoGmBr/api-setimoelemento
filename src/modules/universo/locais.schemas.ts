import { z } from 'zod'

const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform((valor) => valor || null)

const imagem = z
  .string()
  .trim()
  .max(500)
  .refine((valor) => /^(https?:\/\/|\/)/.test(valor), 'Imagem deve ser uma URL http(s) ou um caminho começando com /')

export const localSchema = z.object({
  nome: z.string().trim().min(1, 'O nome do local é obrigatório').max(255),
  mundo: z.string().trim().min(1, 'O mundo é obrigatório').max(255),
  dimensao: textoOpcional(255),
  descricao: textoOpcional(10000),
  imagens: z.array(imagem).default([]),
})

export type LocalInput = z.infer<typeof localSchema>
