import { z } from 'zod'

const faixaSchema = z.object({
  ordem: z.number().int().min(1),
  raridade: z.string().trim().min(1, 'Dê um nome a cada faixa').max(80),
  valores: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
})

export const sistemaSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome é obrigatório').max(191),
    /** Faixas de poder em ordem: [{ ordem, raridade, valores: [mínimo, máximo] }] */
    progressao: z.array(faixaSchema).min(1, 'Cadastre ao menos uma faixa'),
    /** Teto de bônus por raridade: { "Comum": 50 } */
    limite_bonus: z.record(z.string(), z.number().int().min(0)),
    /** Trava de estrela: 1 a 5 fixa as estrelas nesse valor; vazio = o usuário escolhe. */
    estrela_fixa: z.number().int().min(1).max(5).nullish(),
    /** Último ranque aberto: continua em degraus de `degrau_estrela` PC, com estrelas. */
    ranque_aberto: z.boolean().default(false),
    degrau_estrela: z.number().int().min(1).nullish(),
    max_estrelas: z.number().int().min(1).nullish(),
    /** Calculadora em que o sistema aparece. */
    calculadora: z.enum(['erion', 'aetheris', 'ambos']).default('ambos'),
    /** Nome usado no lugar de "Raça" (ex.: "Hierarquia"). */
    rotulo_linhagem: z.string().trim().max(40).default('Raça').transform((r) => r || 'Raça'),
  })
  .superRefine((s, ctx) => {
    if (s.ranque_aberto && !s.degrau_estrela) ctx.addIssue({ code: 'custom', path: ['degrau_estrela'], message: 'Informe quantos PC vale cada estrela' })
    const vistos = new Set<string>()
    s.progressao.forEach((f, i) => {
      if (f.valores[0] > f.valores[1])
        ctx.addIssue({ code: 'custom', path: ['progressao', i], message: `"${f.raridade}": o mínimo não pode ser maior que o máximo` })
      const chave = f.raridade.toLowerCase()
      if (vistos.has(chave)) ctx.addIssue({ code: 'custom', path: ['progressao', i], message: `Raridade repetida: "${f.raridade}"` })
      vistos.add(chave)
    })
  })
