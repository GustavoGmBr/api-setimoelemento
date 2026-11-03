/** Erro esperado da aplicação: vira resposta HTTP com a mensagem e o status dados. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: string[],
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const naoEncontrado = (o: string) => new HttpError(404, `${o} não encontrado(a)`)
