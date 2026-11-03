import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { HttpError } from '../../lib/http-error.js'
import { prisma } from '../../lib/prisma.js'
import type { LoginInput } from './auth.schemas.js'

// Hash descartável: gasta o mesmo tempo mesmo quando o login não existe.
const HASH_FALSO = '$2a$12$C6UzMDM.H6dfI/f/IKcEeOq6xqj1p3Yw8y1m0b7mWQ0pQ0m2Zq1aW'

const usuarioPublico = { id_usuario: true, login: true, nivel_acesso: true } as const

export async function entrar({ login, senha }: LoginInput) {
  const usuario = await prisma.usuarios.findUnique({ where: { login } })
  const confere = await bcrypt.compare(senha, usuario?.senha ?? HASH_FALSO)
  if (!usuario || !confere) throw new HttpError(401, 'Credenciais inválidas')

  const token = jwt.sign(
    { id_usuario: usuario.id_usuario, nivel_acesso: usuario.nivel_acesso },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] },
  )
  return {
    token,
    usuario: {
      id_usuario: usuario.id_usuario,
      login: usuario.login,
      nivel_acesso: usuario.nivel_acesso,
    },
  }
}

export async function usuarioAtual(idUsuario: number) {
  const usuario = await prisma.usuarios.findUnique({
    where: { id_usuario: idUsuario },
    select: usuarioPublico,
  })
  if (!usuario) throw new HttpError(401, 'Usuário não existe mais')
  return usuario
}
