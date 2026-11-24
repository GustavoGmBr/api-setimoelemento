/**
 * Converte as faixas de ranque do modelo de estrelas para a faixa contínua do Peso.
 *
 *   Novo mínimo do ranque = mínimo da antiga 1ª estrela  (× 1,00, não muda)
 *   Novo máximo do ranque = máximo da antiga 5ª estrela  (× 1,60)
 *
 * Só mexe em sistemas que valem para Erion (calculadora "erion" ou "ambos"); os de
 * "aetheris" ficam como estão. Por padrão só MOSTRA o que mudaria.
 *
 *   npm run fundir:estrelas              → simulação (nada é gravado)
 *   npm run fundir:estrelas -- --aplicar → grava no banco
 *
 * Rode uma única vez: aplicar de novo multiplicaria o máximo outra vez.
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'

const FATOR_MAXIMO = 1.6 // bônus da antiga 5ª estrela
const aplicar = process.argv.includes('--aplicar')

type Faixa = { ordem: number; raridade: string; valores: [number, number] }

async function main() {
  const sistemas = await prisma.sistemas.findMany({ orderBy: { id: 'asc' } })
  for (const s of sistemas) {
    if (s.calculadora === 'aetheris') {
      console.log(`\n${s.nome}: só Aetheris, ignorado.`)
      continue
    }
    const faixas = s.progressao as unknown as Faixa[]
    const novas = faixas.map((f) => ({ ...f, valores: [f.valores[0], Math.round(f.valores[1] * FATOR_MAXIMO)] as [number, number] }))
    console.log(`\n${s.nome}${s.estrela_fixa ? ` (tinha estrela travada em ${s.estrela_fixa}★)` : ''}`)
    faixas.forEach((f, i) => console.log(`  ${f.raridade.padEnd(16)} ${f.valores[0]} a ${f.valores[1]}  →  ${novas[i]!.valores[0]} a ${novas[i]!.valores[1]}`))
    if (aplicar) await prisma.sistemas.update({ where: { id: s.id }, data: { progressao: novas } })
  }
  console.log(aplicar ? '\nGravado.' : '\nSimulação: nada foi gravado. Use --aplicar para gravar.')
}

main().finally(() => prisma.$disconnect())
