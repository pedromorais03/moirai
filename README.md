# ⚡ Moirai

<div style="width: 100%; display: flex; justify-content: center;">
       <img src="/assets/moirai.png" alt="Moirasi Image" width="200">
</div>

---

**Scanner de segurança DevSecOps.**
Detecta misconfigurations em Dockerfiles e IaC, secrets expostos no código, vulnerabilidades em imagens Docker — com remediação gerada por IA e histórico de scans.

---

## Como funciona

```
┌─────────────┐     POST /scan/file      ┌─────────────┐
│             │ ────────────────────── ▶ │             │
│  Frontend   │     POST /scan/repo      │     API     │
│  :5173      │ ───────────────────────▶ │    :3000    │
│             │     GET  /scan/:jobId    │             │
│             │ ◀ ───────────────────────│             │
└─────────────┘                          └──────┬──────┘
                                                │ enfileira job
                                         ┌──────▼──────┐
                                         │    Redis    │
                                         │    :6379    │
                                         └──────┬──────┘
                                                │ dequeue
                                         ┌──────▼──────┐
                                         │   Worker    │──▶ Trivy
                                         └──────┬──────┘
                                                │ salva resultado
                                         ┌──────▼──────┐
                                         │ PostgreSQL  │
                                         │    :5432    │
                                         └─────────────┘
```

**Fluxo de um scan:**
1. Frontend envia o arquivo, URL do repositório ou nome da imagem
2. API recebe, salva o arquivo em disco e enfileira um job no Redis via BullMQ
3. API retorna um `jobId` imediatamente (resposta assíncrona)
4. Worker pega o job da fila, executa o Trivy e salva o resultado no PostgreSQL
5. Frontend faz polling a cada 2 segundos em `GET /scan/:jobId` até o status ser `completed`
6. Resultado exibido com findings, score e remediação por IA

---

## Componentes

### Frontend (React + TypeScript + Vite) — porta 5173

Interface do usuário. Responsável por:

- Enviar arquivos ou URLs para a API via `FormData`
- Fazer polling do status do job a cada 2s
- Exibir os findings agrupados por severidade com filtros
- Mostrar o **score de segurança** com gauge visual
- Solicitar remediação por IA ao abrir cada finding
- Exportar relatório em JSON, CSV ou PDF
- Exibir o histórico de scans anteriores

Abas disponíveis: **Arquivo**, **Repositório**, **Imagem Docker**, **Secrets**, **Comparar**, **Histórico**

---

### API — Fastify (Node.js) — porta 3000

Backend HTTP. Responsável por:

- Receber uploads de arquivos e salvá-los em `/uploads`
- Enfileirar jobs no Redis via BullMQ
- Responder ao polling de status consultando o estado do job
- Servir o endpoint de remediação por IA (`POST /remediation`)
- Servir o histórico de scans (`GET /scan/history`)
- Rodar as migrations do PostgreSQL na inicialização

**Endpoints principais:**

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/scan/file` | Upload de arquivo |
| `POST` | `/scan/repo` | Scan de repositório Git |
| `POST` | `/scan/image` | Scan de imagem Docker |
| `POST` | `/scan/secrets/file` | Scan de secrets em arquivo |
| `POST` | `/scan/secrets/repo` | Scan de secrets em repositório |
| `POST` | `/scan/compare` | Comparar dois scans |
| `GET` | `/scan/:jobId` | Status e resultado do job |
| `GET` | `/scan/history` | Histórico de scans |
| `POST` | `/remediation` | Remediação por IA |
| `GET` | `/health` | Health check |

---

### Redis — porta 6379

Broker de mensagens. Armazena a fila de jobs do BullMQ.

- Cada job contém: tipo do scan, caminho do arquivo ou URL, e caminho do `.trivyignore` (se enviado)
- O resultado do job fica armazenado no Redis até ser lido
- Usado apenas como fila — não persiste histórico de longo prazo

---

### BullMQ

Biblioteca de filas sobre o Redis. Gerencia o ciclo de vida dos jobs:

- **waiting** → job enfileirado, aguardando worker
- **active** → worker processando
- **completed** → scan finalizado, resultado disponível
- **failed** → erro durante o scan (retry automático desativado para evitar deletar o arquivo antes do processamento)

---

### Worker (Node.js)

Processo separado que consome jobs da fila. Responsável por:

- Executar o **Trivy** com os parâmetros corretos para cada tipo de scan
- Normalizar o output do Trivy para o formato interno
- Calcular o score de segurança
- Salvar o resultado no PostgreSQL via `historyService`
- Deletar o arquivo de upload após o scan

Tipos de job suportados: `file`, `repo`, `image`, `secrets-file`, `secrets-repo`, `compare`

---

### PostgreSQL — porta 5432

Banco de dados relacional. Persiste o histórico de scans.

**Tabela `scans`:**

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial | ID interno |
| `job_id` | text | ID do job no BullMQ |
| `type` | text | Tipo do scan (file, repo, image, secrets) |
| `target` | text | Nome do arquivo, URL ou imagem escaneada |
| `score` | integer | Score de segurança 0–100 |
| `summary` | jsonb | Contagem de findings por severidade |
| `findings` | jsonb | Lista completa de findings |
| `scanned_at` | timestamptz | Data e hora do scan |

---

### Trivy

Ferramenta open source da Aqua Security. Motor de scan usado pelo worker.

- `trivy config` — detecta misconfigurations em Dockerfiles, Terraform, Kubernetes, Helm, CloudFormation, Bicep
- `trivy image` — detecta CVEs em pacotes de imagens Docker + misconfigurations
- `trivy fs --scanners secret` — detecta secrets expostos no código (chaves de API, tokens, senhas hardcoded)

---

## Score de segurança

O score vai de **0 a 100** e representa a postura de segurança do alvo escaneado.

**Começa em 100 e desconta por finding encontrado:**

| Severidade | Desconto por finding |
|---|---|
| 🔴 Critical | −10 pontos |
| 🟠 High | −5 pontos |
| 🟡 Medium | −2 pontos |
| 🟢 Low | −1 ponto |
| ⚪ Unknown | 0 pontos |

**Fórmula:**
```
score = max(0, 100 − (critical×10 + high×5 + medium×2 + low×1))
```

**Exemplos:**
- 0 findings → score **100** (Excelente)
- 2 critical + 1 high → 100 − 25 = score **75** (Bom)
- 3 critical + 4 high → 100 − 50 = score **50** (Regular)
- 5 critical + 6 high → 100 − 80 = score **20** (Crítico)

**Classificação:**

| Score | Label |
|---|---|
| 90–100 | ✅ Excelente |
| 70–89 | 🟢 Bom |
| 50–69 | 🟡 Regular |
| 25–49 | 🟠 Ruim |
| 0–24 | 🔴 Crítico |

---

## Remediação por IA

Ao abrir um finding, o frontend chama `POST /remediation` que envia o finding para a API da Anthropic (Claude). O modelo retorna:

- **Snippet corrigido** — trecho de código com a misconfiguration resolvida
- **Explicação** — descrição em português do que foi corrigido e por quê

Secrets não recebem remediação automática por segurança — o valor exposto é mascarado no relatório.

---

## Como rodar

### Com Docker (recomendado)

```bash
docker compose up --build
```

### Manualmente

```bash
# Dependências externas
docker run -d -p 6379:6379 redis:7-alpine
docker run -d -p 5432:5432 -e POSTGRES_DB=moirai -e POSTGRES_USER=moirai -e POSTGRES_PASSWORD=moirai postgres:16-alpine
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Backend
cd backend
npm install
export ANTHROPIC_API_KEY=sua_chave_aqui

# Terminal 1 — API
node src/server.js

# Terminal 2 — Worker
node src/workers/scanWorker.js

# Terminal 3 — Frontend
cd ../frontend
npm install
npm run dev
```

**Acesso:**
- Frontend: http://localhost:5173
- API: http://localhost:3000
- Health check: http://localhost:3000/health

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
│       ├── server.js                  # Entry point da API
│       ├── config/
│       │   ├── redis.js               # Conexão Redis
│       │   └── db.js                  # Conexão PostgreSQL + migrations
│       ├── queues/
│       │   └── scanQueue.js           # Definição da fila BullMQ
│       ├── workers/
│       │   └── scanWorker.js          # Processador de jobs
│       ├── services/
│       │   ├── trivyService.js        # Wrapper do Trivy
│       │   ├── scoreService.js        # Cálculo do score
│       │   └── historyService.js      # Persistência no PostgreSQL
│       └── routes/
│           ├── scan.js                # Rotas de scan
│           └── remediation.js         # Rota de remediação por IA
└── frontend/
    ├── Dockerfile
    └── src/
        └── App.tsx                    # Aplicação React
```
