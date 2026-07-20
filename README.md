# Compasso — versão com API em Node.js

Sistema de agendamento para clínicas e salões (cadastro, agenda,
horários, cancelamento e histórico), com uma API própria em Node.js
guardando os dados em um arquivo no servidor. Não depende de nenhum
serviço externo (Supabase, etc.) e não usa nenhuma biblioteca de
terceiros — só os módulos nativos do Node.

## Estrutura

```
compasso-node-api/
├── server.js        <- servidor (API + serve o site)
├── package.json
├── public/
│   └── index.html   <- o site (front-end)
└── data.json         <- criado automaticamente na 1ª execução (não vem no pacote)
```

## Rodando localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou
mais recente). Não é necessário `npm install` — o projeto não usa
nenhuma dependência externa.

```bash
node server.js
```

Depois acesse **http://localhost:3000** no navegador. Pronto — a API
já está no ar e o site já está conversando com ela.

Os dados ficam salvos em `data.json`, na mesma pasta do `server.js`.
Esse arquivo é criado automaticamente com alguns dados de exemplo na
primeira vez que o servidor roda.

## Como funciona

- `GET /api/state` — retorna todos os dados (clientes, serviços,
  agendamentos, horários) em um único JSON.
- `PUT /api/state` — recebe um JSON e substitui todos os dados.
- O front-end (`public/index.html`) chama esses dois endpoints:
  carrega os dados ao abrir, salva a cada alteração, e também busca
  atualizações a cada 12 segundos — assim, se duas pessoas usarem o
  sistema ao mesmo tempo (recepção + celular do dono, por exemplo),
  as telas ficam sincronizadas automaticamente.
- Se a API não responder por algum motivo, o site avisa com uma faixa
  amarela e passa a salvar temporariamente só no navegador, para não
  perder o que está sendo digitado.

## Publicando (deploy) em um servidor de verdade

Como este é um servidor Node.js "de verdade" (não é só um arquivo
estático), ele precisa rodar em algum lugar com suporte a Node.js.
Algumas opções simples, com planos gratuitos ou baratos:

- **Render** (render.com) — cria um "Web Service", aponta para o
  repositório com este projeto, comando de start `node server.js`.
- **Railway** (railway.app) — importa o projeto, detecta Node.js
  automaticamente.
- **Fly.io** — bom para quem já tem alguma familiaridade com deploy.
- **VPS próprio** (ex: uma DigitalOcean, Hetzner, Oracle Cloud) —
  rodando com [pm2](https://pm2.keymetrics.io/) para manter o
  processo no ar (`pm2 start server.js --name compasso`).

Em qualquer uma dessas opções, **é importante garantir que a pasta
onde fica o `data.json` tenha disco persistente** — alguns serviços
gratuitos apagam o sistema de arquivos a cada reinício/deploy. Se o
seu provedor funcionar assim, vale a pena adaptar o `server.js` para
gravar em um banco de dados gerenciado (Postgres, por exemplo) em vez
de arquivo local — posso te ajudar a fazer essa troca se for o caso.

## Variável de porta

Por padrão o servidor sobe na porta 3000. Para mudar, defina a
variável de ambiente `PORT`:

```bash
PORT=8080 node server.js
```

A maioria dos serviços de hospedagem (Render, Railway, etc.) já
define `PORT` automaticamente — o `server.js` já está preparado para
isso.

## Funcionalidades do sistema

- **Cadastro** — clientes e serviços (nome, duração, preço)
- **Agenda** — visão diária com horários disponíveis e ocupados
- **Horários** — configuração de funcionamento por dia da semana
- **Cancelamento** — cancelar agendamentos com motivo opcional
- **Histórico** — todos os agendamentos, com busca e filtro por status
