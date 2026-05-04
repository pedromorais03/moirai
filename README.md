# ⚡ Moirai
<center>
       <img src="/assets/moirai.png" alt="Moirasi Image" width="200">
</center>

**Scanner de misconfigurations em Dockerfiles e IaC.**  
Faça upload de um arquivo ou aponte para um repositório Git e receba um relatório de segurança detalhado em segundos.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + Fastify |
| Fila | BullMQ + Redis |
| Scanner | Trivy |
| Container | Docker + Docker Compose |

---

## Arquitetura

```
┌─────────────┐     POST /scan/file      ┌─────────────┐
│             │ ─────────────────────── ▶ │             │
│  Frontend   │     POST /scan/repo      │     API     │
│  :5173      │ ─────────────────────── ▶ │    :3000    │
│             │     GET  /scan/:jobId    │             │
│             │ ◀ ─────────────────────── │             │
└─────────────┘                          └──────┬──────┘
                                                │ enfileira
                                         ┌──────▼──────┐
                                         │    Redis    │
                                         │    :6379    │
                                         └──────┬──────┘
                                                │ processa
                                         ┌──────▼──────┐
                                         │   Worker    │
                                         │   (Trivy)   │
                                         └─────────────┘
```

**Fluxo de scan:**
1. Frontend envia o arquivo ou URL do repositório
2. API enfileira o job e retorna um `jobId`
3. Worker processa o job rodando `trivy config`
4. Frontend faz polling a cada 2s até o scan completar
5. Resultado exibido com findings agrupados por severidade

---

## Endpoints

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/scan/file` | Upload de arquivo (multipart) |
| `POST` | `/scan/repo` | Scan de repositório Git |
| `GET` | `/scan/:jobId` | Status e resultado do job |
| `GET` | `/health` | Health check |

---

## Como rodar

### Com Docker (recomendado)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000

### Manualmente

**Pré-requisitos:** Node.js 20+, Redis, Trivy, Git

```bash
# Instalar dependências
cd backend
npm install
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
docker run -d -p 6379:6379 redis:7-alpine

# Iniciar a API (terminal 1)
node src/server.js

# Iniciar o Worker (terminal 2)
node src/workers/scanWorker.js

# Iniciar o Frontend (terminal 3)
cd ../frontend
npm install
npm run dev
```

---

## Estrutura do projeto

```
moirai/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   ├── package.json
│   └── src/
│       ├── server.js               # Entry point do Fastify
│       ├── config/
│       │   └── redis.js            # Conexão com Redis
│       ├── queues/
│       │   └── scanQueue.js        # Fila BullMQ
│       ├── workers/
│       │   └── scanWorker.js       # Processador de jobs
│       ├── services/
│       │   └── trivyService.js     # Wrapper do Trivy
│       └── routes/
│           └── scan.js             # Rotas da API
└── frontend/
    ├── Dockerfile
    └── src/
        └── App.tsx                 # Aplicação React
```

---

## Tipos de arquivo suportados

| Tipo | Exemplos |
|---|---|
| Dockerfile | `Dockerfile`, `Dockerfile.prod` |
| Terraform | `.tf` |
| Kubernetes | `.yaml`, `.yml` |
| CloudFormation | `.json`, `.yaml` |
| Helm | `Chart.yaml` |
| Bicep | `.bicep` |

---

## Níveis de severidade

| Nível | Descrição |
|---|---|
| 🔴 Critical | Ação imediata necessária |
| 🟠 High | Deve ser corrigido em breve |
| 🟡 Medium | Planejar correção |
| 🟢 Low | Problemas menores |
| ⚪ Unknown | Não classificado |

---

## Variáveis de ambiente

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=*
UPLOADS_DIR=./uploads

# Worker
WORKER_CONCURRENCY=2
```