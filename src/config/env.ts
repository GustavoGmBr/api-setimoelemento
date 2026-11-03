import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3335),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  // Hospedagem do site (FTP), onde as imagens enviadas pelo painel ficam.
  FTP_HOST: z.string().optional(),
  FTP_USER: z.string().optional(),
  FTP_PASSWORD: z.string().optional(),
  FTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  FTP_REMOTE_ROOT: z.string().optional(), // vazio = pasta do site é a raiz do FTP; ausente = detecta sozinho
  UPLOAD_PUBLIC_URL: z.string().default('https://setimoelemento.com.br/uploads'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
})

const lido = schema.safeParse(process.env)
if (!lido.success) {
  console.error('Configuração inválida (.env):')
  for (const i of lido.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`)
  process.exit(1)
}

export const env = lido.data
export const emProducao = env.NODE_ENV === 'production'
