import { z } from 'zod'

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

const inteiro = (min = 0) => z.number().int().min(min)

/** Habilidade ou equipamento: `sistema` manda o item para a aba Erion ou Aetheris da ficha. */
const itemSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome a cada item').max(120),
  descricao: texto(2000),
  tipo: texto(80),
  sistema: z.enum(['erion', 'aetheris']).default('erion'),
})

/** Um momento da história do personagem: idade, dados de Erion e Aetheris, formas ativadas… */
export const historicoSchema = z.object({
  personagem_id: z.number().int().positive(),
  livro_id: z.number().int().positive().nullish().transform((v) => v ?? null),
  capitulo_id: z.number().int().positive().nullish().transform((v) => v ?? null),
  idade: inteiro().max(100000).nullish().transform((v) => v ?? null),
  titulo: texto(255),
  raca_id: z.number().int().positive('Escolha a raça'),

  // Erion
  ranque: texto(100),
  subnivel: inteiro(1).max(5).default(1),
  qtd_treino: inteiro().default(0),
  ponto_combate: inteiro().default(0),
  bonusPCErion: inteiro().default(0),

  // Aetheris
  classificacao: texto(100),
  nivel: inteiro(1).default(1),
  xpAtual: inteiro().default(0),
  xpProximo: inteiro(1).default(100),
  ponto_combateAetheris: inteiro().default(0),

  // detalhes
  arquetipo: z.enum(['Lutador', 'Duelista', 'Atirador', 'Mago', 'Suporte']).nullish().transform((v) => v ?? null),
  /** Classe do personagem (livre). */
  classes: texto(255),
  elementos: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  habilidades: z.array(itemSchema).max(200).default([]),
  equipamento: z.array(itemSchema).max(200).default([]),
  formas_desbloqueadas: z.array(z.number().int().positive()).max(100).default([]),
})

export type HistoricoDados = z.infer<typeof historicoSchema>
