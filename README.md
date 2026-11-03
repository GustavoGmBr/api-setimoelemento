# API — Sétimo Elemento

Express 5 + TypeScript + Prisma (MySQL). Mesma estrutura de URLs da API anterior:
`/api/<recurso>` (leitura pública) e `/api/private/<recurso>` (escrita, exige login).

```
npm install
cp .env.example .env      # preencha DATABASE_URL e JWT_SECRET
npm run prisma:generate
npm run dev               # http://localhost:3335/api
ADMIN_SENHA='...' npm run criar-admin -- seu_login
```

Estrutura: `src/modules/<recurso>` (rotas + schemas), `src/middlewares`, `src/config/env.ts`
(valida o `.env` ao iniciar), `src/lib`.

Módulos prontos: auth (`POST /auth/login`, `GET /auth/me`), sagas, livros.

## Produção na VPS

- Runtime validado: Node.js 24 LTS. Instalação reproduzível: `npm ci && npm run build`.
- A API escuta em `127.0.0.1:3335` por padrão (`HOST` e `PORT` configuráveis).
- `deploy/setimoelemento-api.service`: serviço systemd com usuário dedicado, reinício automático e logs no journal.
- `deploy/nginx.conf`: proxy para `api-livros.setimoelemento.com.br`; ativar HTTPS com Certbot após conferir o DNS.
- `.env` deve ficar apenas no servidor, com acesso restrito. Nunca publicar credenciais ou backups neste repositório.
- O MySQL já existente é definido por `DATABASE_URL`. A VPS precisa estar autorizada no MySQL remoto da hospedagem.
- O deploy não executa `prisma db push`, seeds ou criação de administrador automaticamente: preservar os dados existentes.

Verificação após instalar: `curl --fail https://api-livros.setimoelemento.com.br/api/health`.
Esse endpoint verifica também a conexão com o MySQL. `/api` verifica somente o processo HTTP.

No frontend hospedado na HostGator, definir antes de `npm run build`:

```dotenv
VITE_API_URL=https://api-livros.setimoelemento.com.br/api
```

Publicar o conteúdo de `dist` do frontend na pasta do domínio. A pasta `server` fica na VPS.
O CORS da API deve incluir as origens reais do site em `CORS_ORIGINS`, sem barra final.
As imagens continuam na HostGator através das credenciais FTP privadas do `.env`.

Operação na VPS:

```sh
systemctl status setimoelemento-api --no-pager
journalctl -u setimoelemento-api -n 100 --no-pager
systemctl restart setimoelemento-api
nginx -t
certbot renew --dry-run
```

Implantação configurada em 03/11/2026: Debian 12, Node.js 24.19.0,
diretório `/opt/setimoelemento-api`, serviço `setimoelemento-api` e HTTPS
com renovação automática pelo timer `certbot.timer`.

Para publicar uma nova versão depois de enviar os commits ao GitHub:

```sh
bash /opt/setimoelemento-api/deploy/update.sh
```

O script recompila e reinicia a API sem executar mudanças no banco ou sobrescrever
o `.env` e o HTTPS. Se houver mudanças no schema, planejar migração e backup antes
da atualização. Para conferir as colunas do banco e o login FTP sem alterar dados:

```sh
cd /opt/setimoelemento-api
node deploy/verify.mjs
```

## Arquivos enviados (imagens)

O painel envia a imagem para a API (`POST /api/private/uploads/:destino`) e a API a coloca na **hospedagem do site por FTP**
(`<FTP_REMOTE_ROOT>/uploads/<pasta>/<arquivo>`, igual ao sistema antigo). O banco guarda a URL pública completa
(ex.: `https://setimoelemento.com.br/uploads/capas/<id>.webp`).

- Configure `FTP_HOST`, `FTP_USER` e `FTP_PASSWORD` no `.env` (veja `.env.example`). Sem isso o envio responde 503.
- O navegador reduz e converte a imagem para WEBP antes de enviar (capa/corpo até 1600 px, rosto até 900 px).
- Ao trocar/remover uma imagem, ou excluir o livro/personagem, o arquivo antigo é apagado da hospedagem (melhor esforço).
- **Novos tipos de arquivo:** adicione o destino em `DESTINOS` (`src/modules/uploads/uploads.routes.ts`) e, se não for imagem, o tipo em `FORMATOS`.
