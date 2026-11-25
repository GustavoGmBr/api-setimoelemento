import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { HttpError } from '../../lib/http-error.js'
import { autenticar } from '../../middlewares/auth.js'
import { obterLoreEmTexto } from '../lore/lore.routes.js'

/** Assistente de escrita (Gemini): POST /api/private/assistente. Só para o autor. */
export const assistentePrivado = Router()
assistentePrivado.use(autenticar)

const instrucao = `Você é o assistente de continuidade da história "7° Elemento", escrita pelo autor que conversa com você.
Use SOMENTE o universo abaixo (o que já foi publicado) como fonte do que é canônico: personagens, poderes, ranques, itens, locais, criaturas e eventos.
Ao ajudar a escrever, respeite o que já está estabelecido e aponte qualquer incoerência com o canon.
Se algo não constar no universo, diga que não consta, em vez de inventar; ideias novas devem ser apresentadas como sugestões.
Responda em português do Brasil, de forma direta.`

const bodySchema = z.object({
  mensagens: z
    .array(z.object({ papel: z.enum(['usuario', 'assistente']), texto: z.string().trim().min(1).max(20000) }))
    .min(1)
    .max(40),
})

assistentePrivado.post('/', async (req, res) => {
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'Assistente não configurado: defina GEMINI_API_KEY no .env do servidor')
  const { mensagens } = bodySchema.parse(req.body)
  if (mensagens[mensagens.length - 1]!.papel !== 'usuario') throw new HttpError(400, 'A última mensagem precisa ser do usuário')

  const universo = await obterLoreEmTexto()
  const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${instrucao}\n\n${universo}` }] },
      contents: mensagens.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'model', parts: [{ text: m.texto }] })),
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null)

  if (!resposta) throw new HttpError(502, 'Não foi possível falar com o Gemini')
  const dados = (await resposta.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null
  if (!resposta.ok) throw new HttpError(502, `Gemini: ${dados?.error?.message ?? resposta.status}`)
  const texto = dados?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
  if (!texto) throw new HttpError(502, 'O Gemini não devolveu resposta (conteúdo bloqueado ou vazio)')
  res.json({ texto })
})
