# Relatórios de Compra / Estoque

Sistema web (HTML/CSS/JavaScript puro + Firebase) para transportadora, com foco em:
- controle de estoque
- entrada de Nota Fiscal (NF)
- baixa de peças por placa
- relatórios mensais
- consultas por NF e por placa
- pedidos internos de compra

## Estrutura

```text
.
├── index.html
└── src
    ├── assets
    ├── scripts
    │   ├── app.js
    │   └── firebase.js
    └── styles
        └── main.css
```

## Funcionalidades implementadas

- **Login** (Firebase Auth email/senha) + logout
- **Cadastros**
  - placas (CRUD simples)
  - itens/catálogo (CRUD simples + validação de código único)
- **Estoque**
  - saldo atual por item
  - alerta de estoque mínimo
  - filtros por categoria e busca por código/nome
- **Entrada de NF**
  - cabeçalho e itens
  - cálculo automático: subtotal, descontos e total líquido
  - ao salvar: grava NF + subcoleção `nf_items` + movimentações IN + atualização de estoque
- **Baixa por placa**
  - registra movimentação OUT
  - impede baixa sem estoque suficiente
- **Relatórios e consultas**
  - relatório mensal (quantidades + valor líquido total)
  - consulta por número de NF
  - consulta por placa (com gasto estimado por último custo)
  - exportação CSV de relatório mensal
- **Solicitações internas de compra**
  - abertura de solicitação
  - fila com atualização de status
  - atalho para criar solicitação a partir de alerta de estoque mínimo

## 1) Configurar Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/).
2. Crie um projeto.
3. Habilite **Authentication > Sign-in method > Email/Password**.
4. Crie o app web e copie a configuração.
5. Abra `src/scripts/firebase.js` e substitua:

```js
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
```

6. No Firestore, crie o banco em modo produção (recomendado) ou teste.
7. (Opcional, recomendado) Defina regras iniciais para usuários autenticados.

### Coleções esperadas

- `plates`
- `items`
- `stock`
- `nfs` + subcoleção `nf_items`
- `movements`
- `purchase_requests`

## 2) Rodar localmente

Como é frontend estático, basta servir a pasta com um servidor local:

### Opção A: VS Code Live Server
- Abra a pasta do projeto
- Clique com botão direito em `index.html`
- **Open with Live Server**

### Opção B: Python
```bash
python3 -m http.server 5500
```
Depois acesse `http://localhost:5500`.

> Não abra via `file://` porque módulos ES e Firebase podem falhar por CORS.

## 3) Modelo de dados (resumo)

- `plates`: `{ plate, model?, notes?, createdAt }`
- `items`: `{ code, name, category?, unit, minStock?, createdAt }`
- `stock`: `{ itemId, quantityAtual, updatedAt }`
- `nfs`: `{ numeroNF, fornecedor, dataEntrada, chave?, observacoes?, totalBruto, totalDescontos, totalLiquido, createdAt }`
- `nfs/{nfId}/nf_items`: `{ itemId, codeSnapshot, nameSnapshot, quantidade, valorUnitario, discount, subtotalItem, totalItem }`
- `movements`: `{ type, refNF?, plateId?, itemId, quantidade, valorUnitarioSnapshot?, data, createdAt, obs? }`
- `purchase_requests`: `{ itemId, quantidade, prioridade, status, requestedBy, createdAt, obs? }`

## 4) Publicação futura

### GitHub Pages (frontend estático)
1. Suba o repositório no GitHub.
2. Em **Settings > Pages**, configure branch e pasta raiz.
3. Publicação automática da interface.

### Firebase Hosting
1. Instale Firebase CLI (ambiente com Node):
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase init hosting
   firebase deploy
   ```
2. Defina `public` como raiz do projeto (ou ajuste para onde estiver o `index.html`).

## Observações técnicas

- Desconto na NF está padronizado em **valor absoluto (R$)**.
- Arquitetura visual e CSS estão em **mobile-first responsivo**.
- Preparado para futura evolução de perfis/roles (`admin`/`usuário`) via claims e regras do Firestore.
