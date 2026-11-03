import { Readable } from 'node:stream'
import * as ftp from 'basic-ftp'
import { env } from '../config/env.js'
import { HttpError } from '../lib/http-error.js'

/** Endereço público das imagens (hospedagem do site) sem a barra final. */
const URL_PUBLICA = env.UPLOAD_PUBLIC_URL.replace(/\/+$/, '')
const RAIZ_CONFIGURADA = env.FTP_REMOTE_ROOT?.replace(/\/+$/, '')
const DOMINIO = new URL(URL_PUBLICA).hostname

/**
 * Pasta do site dentro do FTP. Se FTP_REMOTE_ROOT não foi definido, descobre olhando a raiz:
 * se ela já tem os arquivos do site (index.html, assets, uploads), a raiz é o próprio site;
 * senão, se existe uma pasta com o nome do domínio, é ela.
 */
async function raizRemota(client: ftp.Client): Promise<string> {
  if (RAIZ_CONFIGURADA !== undefined) return RAIZ_CONFIGURADA
  const nomes = (await client.list('/')).map((e) => e.name)
  if (['index.html', 'assets', 'uploads'].some((n) => nomes.includes(n))) return ''
  if (nomes.includes(DOMINIO)) return `/${DOMINIO}`
  if (nomes.includes('public_html')) return '/public_html'
  return ''
}

function configurado() {
  return !!(env.FTP_HOST && env.FTP_USER && env.FTP_PASSWORD)
}

async function conectar() {
  if (!configurado()) throw new HttpError(503, 'Envio de arquivos não configurado (defina FTP_HOST, FTP_USER e FTP_PASSWORD no .env)')
  const client = new ftp.Client(30000)
  try {
    await client.access({ host: env.FTP_HOST, user: env.FTP_USER, password: env.FTP_PASSWORD, secure: env.FTP_SECURE })
  } catch (e) {
    client.close()
    console.error('Falha ao conectar no FTP:', e)
    throw new HttpError(502, 'Não foi possível conectar à hospedagem para enviar o arquivo')
  }
  return client
}

/** Envia um arquivo para <raiz>/uploads/<pasta>/<nome> e devolve a URL pública. */
export async function enviarArquivo(conteudo: Buffer, pasta: string, nome: string): Promise<string> {
  const client = await conectar()
  try {
    const raiz = await raizRemota(client)
    console.log(`FTP: enviando para ${raiz || '/'}uploads/${pasta}/${nome}`)
    const diretorio = `${raiz}/uploads/${pasta}`
    await client.ensureDir(diretorio)
    await client.uploadFrom(Readable.from(conteudo), `${diretorio}/${nome}`)
    return `${URL_PUBLICA}/${pasta}/${nome}`
  } catch (e) {
    if (e instanceof HttpError) throw e
    console.error('Erro no upload FTP:', e)
    throw new HttpError(502, 'Falha ao enviar o arquivo para a hospedagem')
  } finally {
    client.close()
  }
}

/**
 * Remove da hospedagem um arquivo enviado por este sistema (pela URL pública).
 * Melhor esforço: URLs de fora ou arquivos já apagados são ignorados, e nunca lança erro.
 */
export async function removerArquivo(url: string | null | undefined): Promise<void> {
  if (!url || !configurado() || !url.startsWith(`${URL_PUBLICA}/`)) return
  const relativo = url.slice(URL_PUBLICA.length + 1)
  if (relativo.includes('..')) return
  const client = new ftp.Client(30000)
  try {
    await client.access({ host: env.FTP_HOST, user: env.FTP_USER, password: env.FTP_PASSWORD, secure: env.FTP_SECURE })
    await client.remove(`${await raizRemota(client)}/uploads/${relativo}`)
  } catch (e) {
    console.warn('Não foi possível remover o arquivo da hospedagem:', e instanceof Error ? e.message : e)
  } finally {
    client.close()
  }
}
