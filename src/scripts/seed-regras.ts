/**
 * Cadastra os sistemas e as raças padrão do universo (os mesmos do site antigo).
 * Seguro de repetir: atualiza o que já existe, não duplica. Uso: npm run seed:regras
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'

const faixas = (lista: [string, number, number][]) => lista.map(([raridade, min, max], i) => ({ ordem: i + 1, raridade, valores: [min, max] }))

const SISTEMAS = [
  {
    nome: 'Padrão',
    progressao: faixas([
      ['Inferior', 1, 10],
      ['Comum', 10, 25],
      ['Incomum', 25, 50],
      ['Avançado', 50, 100],
      ['Superior', 100, 200],
      ['Lendário', 200, 400],
      ['Divino', 400, 700],
      ['Místico', 700, 1650],
      ['Celestial', 700, 1300],
      ['Transcendente', 1300, 1700],
      ['Guardião', 1700, 1900],
      ['Criador', 1900, 3000],
    ]),
    limite_bonus: { Inferior: 50, Comum: 50, Incomum: 80, Avançado: 100, Superior: 150, Lendário: 200, Divino: 300, Celestial: 500, Transcendente: 1000, Guardião: 9999, Criador: 9999 },
  },
  {
    nome: 'Demônios',
    progressao: faixas([
      ['Inferior', 40, 90],
      ['Bestial', 90, 180],
      ['Combatente', 180, 350],
      ['Oculta', 350, 600],
      ['Superior', 600, 1100],
      ['Desastre', 1100, 1600],
      ['Primordial', 1800, 2800],
    ]),
    limite_bonus: { Inferior: 80, Bestial: 120, Combatente: 180, Oculta: 250, Superior: 400, Desastre: 750, Primordial: 2000 },
    estrela_fixa: 3,
    rotulo_linhagem: 'Hierarquia',
  },
]

const SISTEMAS_EXTRA = [
  {
    nome: 'Aetheris',
    progressao: faixas([
      ['G', 1, 300],
      ['F', 300, 800],
      ['E', 800, 1800],
      ['D', 1800, 3500],
      ['C', 3500, 6000],
      ['B', 6000, 10000],
      ['A', 10000, 18000],
      ['S', 18000, 30000],
      ['SS', 30000, 50000],
      ['SSS', 50000, 90000],
      ['L', 90000, 150000],
      ['X', 150000, 180000],
    ]),
    limite_bonus: {},
    calculadora: 'aetheris',
    // depois do X, cada estrela vale 30 mil PC: X (1⭐) começa em 180 mil
    ranque_aberto: true,
    degrau_estrela: 30000,
  },
]

const RACAS: [string, number, number, string][] = [
  ['Demônios', 15, 5, 'Demônios'],
  ['Dragões', 20, 5, 'Padrão'],
  ['Fadas', 16, 4, 'Padrão'],
  ['Vampiros', 12, 8, 'Padrão'],
  ['Lobisomens', 12, 8, 'Padrão'],
  ['Elfos', 9, 11, 'Padrão'],
  ['Anões', 9, 11, 'Padrão'],
  ['Gigantes', 8, 12, 'Padrão'],
  ['Marines', 5, 15, 'Padrão'],
  ['Ferais', 5, 15, 'Padrão'],
  ['Humanos', 1, 19, 'Padrão'],
]

async function main() {
  const ids = new Map<string, number>()
  for (const s of [...SISTEMAS, ...SISTEMAS_EXTRA]) {
    const r = await prisma.sistemas.upsert({ where: { nome: s.nome }, update: s, create: s })
    ids.set(s.nome, r.id)
  }
  for (const [nome, base, limite, sistema] of RACAS) {
    const sistema_id = ids.get(sistema) as number
    const existente = await prisma.racas.findFirst({ where: { nome, mundo: 'Geral' } })
    if (existente) await prisma.racas.update({ where: { id: existente.id }, data: { base, limite, sistema_id } })
    else await prisma.racas.create({ data: { nome, base, limite, sistema_id, mundo: 'Geral' } })
  }
  console.log(`Pronto: ${SISTEMAS.length + SISTEMAS_EXTRA.length} sistemas e ${RACAS.length} raças.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
