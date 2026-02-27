import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const state = {
  plates: [],
  items: [],
  stockByItem: new Map(),
  nfDraftItems: [],
  requests: []
};

const $ = (id) => document.getElementById(id);
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayISO = () => new Date().toISOString().slice(0, 10);

function toast(message, type = "success") {
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.textContent = message;
  $("toastContainer").appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab, .tab-content").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
    });
  });
}

function renderDashboard() {
  const totalItems = state.items.length;
  const totalStock = [...state.stockByItem.values()].reduce((acc, v) => acc + Number(v), 0);
  const lowStock = state.items.filter((item) => Number(state.stockByItem.get(item.id) || 0) < Number(item.minStock || 0)).length;
  $("dashboardCards").innerHTML = `
    <article class="card kpi"><span>Total de itens cadastrados</span><strong>${totalItems}</strong></article>
    <article class="card kpi"><span>Saldo total em estoque</span><strong>${totalStock}</strong></article>
    <article class="card kpi"><span>Itens abaixo do mínimo</span><strong>${lowStock}</strong></article>
  `;
  renderLowStockAlerts();
}

function renderLowStockAlerts() {
  const list = state.items
    .filter((item) => Number(state.stockByItem.get(item.id) || 0) < Number(item.minStock || 0))
    .map((item) => `
      <div class="request-line">
        <span><strong>${item.code}</strong> - ${item.name} (saldo ${state.stockByItem.get(item.id) || 0}/${item.minStock || 0})</span>
        <button class="btn btn-outline" data-alert-item="${item.id}">Criar solicitação</button>
      </div>
    `).join("");

  $("lowStockAlerts").innerHTML = list || "<p class='hint'>Nenhum item em estado crítico.</p>";
  document.querySelectorAll("[data-alert-item]").forEach((btn) => {
    btn.onclick = () => {
      const item = state.items.find((i) => i.id === btn.dataset.alertItem);
      if (!item) return;
      $("requestItem").value = `${item.code} - ${item.name}`;
      $("requestQty").value = Math.max(1, Number(item.minStock || 1) - Number(state.stockByItem.get(item.id) || 0));
      document.querySelector(".tab[data-tab='requests']")?.click();
    };
  });
}

function parseItemInput(raw) {
  const code = raw.split(" - ")[0]?.trim();
  return state.items.find((it) => it.code.toLowerCase() === code?.toLowerCase() || `${it.code} - ${it.name}`.toLowerCase() === raw.toLowerCase());
}

async function loadPlates() {
  const snap = await getDocs(query(collection(db, "plates"), orderBy("plate")));
  state.plates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderPlates();
  const options = state.plates.map((p) => `<option value="${p.plate}">`).join("");
  $("platesList").innerHTML = options;
}

async function loadItems() {
  const snap = await getDocs(query(collection(db, "items"), orderBy("code")));
  state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderItems();
  const options = state.items.map((item) => `<option value="${item.code} - ${item.name}">`).join("");
  $("itemsList").innerHTML = options;
}

async function loadStock() {
  const snap = await getDocs(collection(db, "stock"));
  state.stockByItem = new Map(snap.docs.map((d) => [d.data().itemId, Number(d.data().quantityAtual || 0)]));
  renderStock();
  renderDashboard();
}

async function loadRequests() {
  const snap = await getDocs(query(collection(db, "purchase_requests"), orderBy("createdAt", "desc"), limit(200)));
  state.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderRequests();
}

function renderPlates() {
  const term = $("plateSearch").value?.toLowerCase() || "";
  const rows = state.plates
    .filter((p) => p.plate.toLowerCase().includes(term))
    .map((p) => `<div class='request-line'><span><strong>${p.plate}</strong> ${p.model || ""}<br><small>${p.notes || ""}</small></span><button class='btn btn-danger' data-del-plate='${p.id}'>Excluir</button></div>`).join("");
  $("platesListContainer").innerHTML = rows || "<p class='hint'>Nenhuma placa cadastrada.</p>";
  document.querySelectorAll("[data-del-plate]").forEach((btn) => btn.onclick = async () => {
    await deleteDoc(doc(db, "plates", btn.dataset.delPlate));
    toast("Placa removida");
    loadPlates();
  });
}

function renderItems() {
  const term = $("itemSearch").value?.toLowerCase() || "";
  const rows = state.items
    .filter((i) => i.code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term))
    .map((i) => `<div class='request-line'><span><strong>${i.code}</strong> - ${i.name} (${i.unit})<br><small>${i.category || "Sem categoria"} • Mínimo: ${i.minStock || 0}</small></span><button class='btn btn-danger' data-del-item='${i.id}'>Excluir</button></div>`).join("");
  $("itemsListContainer").innerHTML = rows || "<p class='hint'>Nenhum item cadastrado.</p>";
  document.querySelectorAll("[data-del-item]").forEach((btn) => btn.onclick = async () => {
    await deleteDoc(doc(db, "items", btn.dataset.delItem));
    toast("Item removido");
    loadItems();
    loadStock();
  });
}

function renderStock() {
  const term = $("stockSearch").value?.toLowerCase() || "";
  const category = $("stockCategoryFilter").value?.toLowerCase() || "";
  const rows = state.items
    .filter((i) => `${i.code} ${i.name}`.toLowerCase().includes(term))
    .filter((i) => !category || (i.category || "").toLowerCase().includes(category))
    .map((i) => {
      const qty = Number(state.stockByItem.get(i.id) || 0);
      const min = Number(i.minStock || 0);
      const bad = qty < min;
      return `<tr>
        <td>${i.code}</td><td>${i.name}</td><td>${i.category || "-"}</td><td>${i.unit}</td>
        <td>${qty}</td><td>${min}</td><td class='${bad ? "status-danger" : "status-ok"}'>${bad ? "Abaixo do mínimo" : "OK"}</td>
      </tr>`;
    }).join("");
  $("stockTableBody").innerHTML = rows || "<tr><td colspan='7'>Sem resultados.</td></tr>";
}

function recalcNfTotals() {
  const bruto = state.nfDraftItems.reduce((acc, it) => acc + it.subtotalItem, 0);
  const desconto = state.nfDraftItems.reduce((acc, it) => acc + it.discount, 0);
  const liquido = state.nfDraftItems.reduce((acc, it) => acc + it.totalItem, 0);
  $("nfTotalBruto").textContent = money(bruto);
  $("nfTotalDesconto").textContent = money(desconto);
  $("nfTotalLiquido").textContent = money(liquido);
}

function renderNfItems() {
  $("nfItemsBody").innerHTML = state.nfDraftItems.map((it, idx) => `
    <tr>
      <td>${it.codeSnapshot}</td><td>${it.nameSnapshot}</td><td>${it.quantidade}</td><td>${money(it.valorUnitario)}</td><td>${money(it.discount)}</td><td>${money(it.totalItem)}</td>
      <td><button data-rm-nf-item='${idx}' class='btn btn-danger'>X</button></td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-rm-nf-item]").forEach((btn) => btn.onclick = () => {
    state.nfDraftItems.splice(Number(btn.dataset.rmNfItem), 1);
    renderNfItems();
  });
  recalcNfTotals();
}

function renderRequests() {
  const status = $("requestStatusFilter").value;
  const priority = $("requestPriorityFilter").value;
  const items = state.requests.filter((r) => (!status || r.status === status) && (!priority || r.prioridade === priority));
  $("requestsList").innerHTML = items.map((r) => `
    <div class='request-line'>
      <span><strong>${r.itemName || "Item"}</strong> • ${r.quantidade} • prioridade ${r.prioridade}<br><small>Status: ${r.status} • ${r.obs || "sem observação"}</small></span>
      <span>
        <button class='btn btn-outline' data-req='${r.id}' data-status='done'>Atendido</button>
        <button class='btn btn-danger' data-req='${r.id}' data-status='canceled'>Cancelar</button>
      </span>
    </div>
  `).join("") || "<p class='hint'>Sem solicitações.</p>";

  document.querySelectorAll("[data-req]").forEach((btn) => {
    btn.onclick = async () => {
      await updateDoc(doc(db, "purchase_requests", btn.dataset.req), { status: btn.dataset.status, updatedAt: serverTimestamp() });
      toast("Solicitação atualizada");
      loadRequests();
    };
  });
}

async function saveNf() {
  const numeroNF = $("nfNumero").value.trim();
  const fornecedor = $("nfFornecedor").value.trim();
  const dataEntrada = $("nfData").value;
  if (!numeroNF || !fornecedor || !dataEntrada) {
    toast("Preencha número da NF, fornecedor e data.", "error");
    return;
  }
  if (state.nfDraftItems.length === 0) {
    toast("Adicione ao menos um item na NF.", "error");
    return;
  }

  const totalBruto = state.nfDraftItems.reduce((acc, i) => acc + i.subtotalItem, 0);
  const totalDescontos = state.nfDraftItems.reduce((acc, i) => acc + i.discount, 0);
  const totalLiquido = state.nfDraftItems.reduce((acc, i) => acc + i.totalItem, 0);

  await runTransaction(db, async (transaction) => {
    const nfRef = doc(collection(db, "nfs"));
    transaction.set(nfRef, {
      numeroNF,
      fornecedor,
      dataEntrada,
      chave: $("nfKey").value.trim() || null,
      observacoes: $("nfObs").value.trim() || null,
      totalBruto,
      totalDescontos,
      totalLiquido,
      createdAt: serverTimestamp()
    });

    for (const item of state.nfDraftItems) {
      const nfItemRef = doc(collection(db, `nfs/${nfRef.id}/nf_items`));
      transaction.set(nfItemRef, item);

      const moveRef = doc(collection(db, "movements"));
      transaction.set(moveRef, {
        type: "IN",
        refNF: nfRef.id,
        itemId: item.itemId,
        quantidade: item.quantidade,
        valorUnitarioSnapshot: item.valorUnitario,
        data: dataEntrada,
        createdAt: serverTimestamp()
      });

      const stockRef = doc(db, "stock", item.itemId);
      const stockDoc = await transaction.get(stockRef);
      const prev = stockDoc.exists() ? Number(stockDoc.data().quantityAtual || 0) : 0;
      transaction.set(stockRef, { itemId: item.itemId, quantityAtual: prev + Number(item.quantidade), updatedAt: serverTimestamp() }, { merge: true });
    }
  });

  toast("NF salva e estoque atualizado.");
  state.nfDraftItems = [];
  renderNfItems();
  $("nfHeaderForm").reset();
  await Promise.all([loadStock()]);
}

async function submitOutMovement(e) {
  e.preventDefault();
  const plate = state.plates.find((p) => p.plate.toLowerCase() === $("outPlateSearch").value.toLowerCase());
  const item = parseItemInput($("outItemSearch").value);
  const quantidade = Number($("outQty").value);
  const data = $("outDate").value;
  if (!plate || !item || !quantidade || !data) {
    toast("Informe placa, item, quantidade e data válidos.", "error");
    return;
  }

  const stockDocRef = doc(db, "stock", item.id);
  await runTransaction(db, async (transaction) => {
    const stockDoc = await transaction.get(stockDocRef);
    const current = stockDoc.exists() ? Number(stockDoc.data().quantityAtual || 0) : 0;
    if (current < quantidade) throw new Error("Estoque insuficiente para essa baixa.");

    transaction.set(stockDocRef, { itemId: item.id, quantityAtual: current - quantidade, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(doc(collection(db, "movements")), {
      type: "OUT",
      plateId: plate.id,
      plateSnapshot: plate.plate,
      itemId: item.id,
      itemCodeSnapshot: item.code,
      itemNameSnapshot: item.name,
      quantidade,
      data,
      refNF: $("outNfRef").value.trim() || null,
      obs: $("outObs").value.trim() || null,
      createdAt: serverTimestamp()
    });
  });

  toast("Baixa registrada com sucesso.");
  $("outForm").reset();
  $("outDate").value = todayISO();
  loadStock();
}

async function searchNf() {
  const numero = $("searchNumeroNF").value.trim();
  if (!numero) return;
  const snap = await getDocs(query(collection(db, "nfs"), where("numeroNF", "==", numero), limit(1)));
  if (snap.empty) {
    $("nfSearchResult").innerHTML = "<p class='hint'>NF não encontrada.</p>";
    return;
  }
  const nf = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const itemsSnap = await getDocs(collection(db, `nfs/${nf.id}/nf_items`));
  const list = itemsSnap.docs.map((d) => d.data()).map((it) => `<li>${it.codeSnapshot} - ${it.nameSnapshot}: ${it.quantidade} x ${money(it.valorUnitario)} = ${money(it.totalItem)}</li>`).join("");
  $("nfSearchResult").innerHTML = `
    <p><strong>Fornecedor:</strong> ${nf.fornecedor} • <strong>Data:</strong> ${nf.dataEntrada}</p>
    <p><strong>Total gasto:</strong> ${money(nf.totalLiquido)}</p>
    <ul>${list}</ul>
  `;
}

async function reportByPlate() {
  const plateInput = $("movementPlateFilter").value.trim().toLowerCase();
  const plate = state.plates.find((p) => p.plate.toLowerCase() === plateInput);
  if (!plate) {
    $("plateReport").innerHTML = "<p class='hint'>Placa não encontrada.</p>";
    return;
  }

  const snap = await getDocs(query(collection(db, "movements"), where("type", "==", "OUT"), where("plateId", "==", plate.id), orderBy("data", "desc")));
  const moves = snap.docs.map((d) => d.data());
  let gastoEstimado = 0;
  const lines = [];
  for (const mv of moves) {
    const inSnap = await getDocs(query(collection(db, "movements"), where("type", "==", "IN"), where("itemId", "==", mv.itemId), orderBy("data", "desc"), limit(1)));
    const lastCost = inSnap.empty ? 0 : Number(inSnap.docs[0].data().valorUnitarioSnapshot || 0);
    gastoEstimado += lastCost * Number(mv.quantidade || 0);
    lines.push(`<tr><td>${mv.data}</td><td>${mv.itemCodeSnapshot || "-"} - ${mv.itemNameSnapshot || "-"}</td><td>${mv.quantidade}</td></tr>`);
  }
  $("plateReport").innerHTML = `
    <p>Total de baixas: ${moves.length} • Gasto estimado: <strong>${money(gastoEstimado)}</strong></p>
    <p class='hint'>Estimativa baseada no último custo de entrada de cada item.</p>
    <div class='table-wrap'><table><thead><tr><th>Data</th><th>Item</th><th>Quantidade</th></tr></thead><tbody>${lines.join("") || "<tr><td colspan='3'>Sem baixas.</td></tr>"}</tbody></table></div>
  `;
}

async function runMonthlyReport() {
  const monthRaw = $("reportMonth").value;
  if (!monthRaw) return toast("Selecione mês/ano", "error");
  const [year, month] = monthRaw.split("-");
  const start = `${year}-${month}-01`;
  const end = `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;
  const snap = await getDocs(query(collection(db, "nfs"), where("dataEntrada", ">=", start), where("dataEntrada", "<", end), orderBy("dataEntrada", "asc")));
  const nfs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let totalQtd = 0;
  for (const nf of nfs) {
    const itemsSnap = await getDocs(collection(db, `nfs/${nf.id}/nf_items`));
    totalQtd += itemsSnap.docs.reduce((acc, itemDoc) => acc + Number(itemDoc.data().quantidade || 0), 0);
  }
  const valorTotal = nfs.reduce((acc, nf) => acc + Number(nf.totalLiquido || 0), 0);
  $("monthlyReportResult").dataset.rows = JSON.stringify(nfs);
  $("monthlyReportResult").innerHTML = `
    <p>Total de itens recebidos: <strong>${totalQtd}</strong></p>
    <p>Valor total de entradas: <strong>${money(valorTotal)}</strong></p>
    <div class='table-wrap'><table><thead><tr><th>NF</th><th>Fornecedor</th><th>Data</th><th>Total Líquido</th></tr></thead><tbody>
      ${nfs.map((nf) => `<tr><td>${nf.numeroNF}</td><td>${nf.fornecedor}</td><td>${nf.dataEntrada}</td><td>${money(nf.totalLiquido)}</td></tr>`).join("") || "<tr><td colspan='4'>Sem NFs no período.</td></tr>"}
    </tbody></table></div>
  `;
}

function exportMonthlyCsv() {
  const rows = JSON.parse($("monthlyReportResult").dataset.rows || "[]");
  if (!rows.length) return toast("Nenhum dado para exportar.", "error");
  const csv = ["numeroNF,fornecedor,dataEntrada,totalLiquido", ...rows.map((r) => `${r.numeroNF},${r.fornecedor},${r.dataEntrada},${r.totalLiquido}`)].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-mensal-nf.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function bootstrapData() {
  await Promise.all([loadPlates(), loadItems(), loadStock(), loadRequests()]);
}

function setupEvents() {
  setupTabs();
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, $("loginEmail").value, $("loginPassword").value);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("logoutBtn").onclick = () => signOut(auth);
  $("plateSearch").oninput = renderPlates;
  $("itemSearch").oninput = renderItems;
  $("stockSearch").oninput = renderStock;
  $("stockCategoryFilter").oninput = renderStock;
  $("requestStatusFilter").onchange = renderRequests;
  $("requestPriorityFilter").onchange = renderRequests;

  $("plateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const plate = $("plateValue").value.trim().toUpperCase();
    if (!plate) return;
    await addDoc(collection(db, "plates"), { plate, model: $("plateModel").value.trim() || null, notes: $("plateNotes").value.trim() || null, createdAt: serverTimestamp() });
    e.target.reset();
    toast("Placa salva.");
    loadPlates();
  });

  $("itemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("itemCode").value.trim();
    const name = $("itemName").value.trim();
    if (!code || !name) return;
    const dup = await getDocs(query(collection(db, "items"), where("code", "==", code), limit(1)));
    if (!dup.empty) return toast("Código de item já cadastrado.", "error");

    const ref = await addDoc(collection(db, "items"), {
      code,
      name,
      category: $("itemCategory").value.trim() || null,
      unit: $("itemUnit").value.trim() || "un",
      minStock: Number($("itemMinStock").value || 0),
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, "stock", ref.id), { itemId: ref.id, quantityAtual: 0, updatedAt: serverTimestamp() }, { merge: true });
    e.target.reset();
    $("itemUnit").value = "un";
    toast("Item salvo.");
    await Promise.all([loadItems(), loadStock()]);
  });

  $("openNfItemModalBtn").onclick = () => $("nfItemModal").classList.remove("hidden");
  $("closeModalBtn").onclick = () => $("nfItemModal").classList.add("hidden");
  $("nfItemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const item = parseItemInput($("nfItemSearch").value);
    const quantidade = Number($("nfItemQty").value);
    const valorUnitario = Number($("nfItemUnitPrice").value);
    const discount = Number($("nfItemDiscount").value || 0);
    if (!item || quantidade <= 0 || valorUnitario < 0) return toast("Preencha item, quantidade e valor unitário válidos.", "error");
    const subtotalItem = quantidade * valorUnitario;
    const totalItem = Math.max(subtotalItem - discount, 0);
    state.nfDraftItems.push({
      itemId: item.id,
      codeSnapshot: item.code,
      nameSnapshot: item.name,
      quantidade,
      valorUnitario,
      discount,
      subtotalItem,
      totalItem
    });
    e.target.reset();
    $("nfItemDiscount").value = "0";
    $("nfItemModal").classList.add("hidden");
    renderNfItems();
  });

  $("saveNfBtn").onclick = saveNf;
  $("outForm").addEventListener("submit", (e) => submitOutMovement(e).catch((err) => toast(err.message, "error")));
  $("searchNfBtn").onclick = () => searchNf().catch((err) => toast(err.message, "error"));
  $("searchByPlateBtn").onclick = () => reportByPlate().catch((err) => toast(err.message, "error"));
  $("runMonthlyReportBtn").onclick = () => runMonthlyReport().catch((err) => toast(err.message, "error"));
  $("exportCsvBtn").onclick = exportMonthlyCsv;

  $("requestForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = parseItemInput($("requestItem").value);
    if (!item) return toast("Selecione um item válido.", "error");
    await addDoc(collection(db, "purchase_requests"), {
      itemId: item.id,
      itemName: `${item.code} - ${item.name}`,
      quantidade: Number($("requestQty").value),
      prioridade: $("requestPriority").value,
      status: "open",
      requestedBy: auth.currentUser?.uid || null,
      obs: $("requestObs").value.trim() || null,
      createdAt: serverTimestamp()
    });
    e.target.reset();
    toast("Solicitação criada.");
    loadRequests();
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    $("userEmail").textContent = user.email;
    $("authHeader").classList.remove("hidden");
    $("loginSection").classList.add("hidden");
    $("appSection").classList.remove("hidden");
    $("outDate").value = todayISO();
    $("reportMonth").value = new Date().toISOString().slice(0, 7);
    await bootstrapData();
  } else {
    $("authHeader").classList.add("hidden");
    $("loginSection").classList.remove("hidden");
    $("appSection").classList.add("hidden");
  }
});

setupEvents();
