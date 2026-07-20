/**
 * Compasso — servidor da API (Node.js puro, sem dependências externas)
 *
 * Como rodar:
 *   node server.js
 *
 * Endpoints:
 *   GET  /api/state   -> retorna todo o estado salvo (clientes, serviços, agenda, horários)
 *   PUT  /api/state   -> substitui todo o estado (corpo: JSON)
 *
 * Os dados ficam salvos em disco, no arquivo data.json (criado automaticamente
 * na primeira execução). Qualquer computador/celular que acessar este servidor
 * pela rede vê e edita os mesmos dados.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

/**
 * Gera o estado inicial do sistema, usado na primeira execução
 * (quando ainda não existe data.json) — já vem com alguns clientes,
 * serviços e horários de exemplo, para o site não abrir vazio.
 */
function defaultState() {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return {
    clients: [
      { id: uid(), nome: "Ana Souza", telefone: "(11) 98888-1234", email: "ana.souza@email.com", obs: "" },
      { id: uid(), nome: "Carlos Lima", telefone: "(11) 97777-5678", email: "", obs: "Prefere horários pela manhã" }
    ],
    services: [
      { id: uid(), nome: "Corte de cabelo", duracao: 30, preco: 50 },
      { id: uid(), nome: "Manicure", duracao: 45, preco: 40 },
      { id: uid(), nome: "Consulta avaliação", duracao: 30, preco: 80 }
    ],
    appointments: [],
    workHours: [
      { aberto: false, inicio: "09:00", fim: "13:00", slot: 30 },
      { aberto: true, inicio: "09:00", fim: "18:00", slot: 30 },
      { aberto: true, inicio: "09:00", fim: "18:00", slot: 30 },
      { aberto: true, inicio: "09:00", fim: "18:00", slot: 30 },
      { aberto: true, inicio: "09:00", fim: "18:00", slot: 30 },
      { aberto: true, inicio: "09:00", fim: "18:00", slot: 30 },
      { aberto: true, inicio: "09:00", fim: "13:00", slot: 30 }
    ]
  };
}

// Fila simples de escrita, para evitar corromper o arquivo com gravações
// simultâneas (ex: dois dispositivos salvando quase ao mesmo tempo).
let writeQueue = Promise.resolve();

/**
 * Lê o estado salvo em data.json. Se o arquivo ainda não existir
 * (primeira execução), cria um com os dados padrão e o devolve.
 * Se o conteúdo estiver corrompido por algum motivo, devolve os
 * dados padrão em vez de derrubar o servidor.
 */
function readState() {
  return new Promise((resolve, reject) => {
    fs.readFile(DATA_FILE, 'utf8', (err, raw) => {
      if (err) {
        if (err.code === 'ENOENT') {
          const initial = defaultState();
          writeState(initial).then(() => resolve(initial)).catch(reject);
          return;
        }
        reject(err);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve(defaultState());
      }
    });
  });
}

/**
 * Grava o estado em disco de forma segura: escreve primeiro em um
 * arquivo temporário e só depois renomeia por cima do data.json
 * (rename é atômico no sistema de arquivos), para nunca deixar o
 * arquivo pela metade caso o processo seja interrompido no meio da
 * escrita. As gravações passam por `writeQueue` para acontecer uma
 * de cada vez, mesmo que duas requisições cheguem juntas.
 */
function writeState(state) {
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8', (err) => {
      if (err) { reject(err); return; }
      fs.rename(tmpFile, DATA_FILE, (err2) => {
        if (err2) { reject(err2); return; }
        resolve();
      });
    });
  }));
  return writeQueue;
}

/** Responde uma requisição com um JSON e os cabeçalhos de CORS necessários. */
function sendJSON(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

/**
 * Lê o corpo (body) de uma requisição PUT em pedaços (streaming) e
 * devolve o JSON já parseado. Limita o tamanho em 5MB para evitar que
 * uma requisição maliciosa ou com bug trave o servidor consumindo
 * memória sem limite.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB de limite de segurança
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Serve os arquivos estáticos da pasta public/ (o site em si).
 * "/" vira "/index.html". Bloqueia tentativas de sair da pasta
 * public/ via ".." no caminho (path traversal).
 */
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Evita path traversal (ex: /../server.js)
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Roteamento principal: primeiro trata a API (/api/state), depois
// cai para servir arquivos estáticos do site em qualquer outra rota.
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendJSON(res, 204, {});
    return;
  }

  if (req.url.split('?')[0] === '/api/state') {
    if (req.method === 'GET') {
      readState()
        .then((state) => sendJSON(res, 200, state))
        .catch(() => sendJSON(res, 500, { error: 'Falha ao ler os dados.' }));
      return;
    }
    if (req.method === 'PUT') {
      readBody(req)
        .then((body) => {
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            sendJSON(res, 400, { error: 'Corpo inválido.' });
            return;
          }
          return writeState(body).then(() => sendJSON(res, 200, { ok: true }));
        })
        .catch(() => sendJSON(res, 400, { error: 'Não foi possível processar os dados enviados.' }));
      return;
    }
    sendJSON(res, 405, { error: 'Método não permitido.' });
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end('Método não permitido');
});

server.listen(PORT, () => {
  console.log(`Compasso rodando em http://localhost:${PORT}`);
  console.log(`Dados salvos em: ${DATA_FILE}`);
});
