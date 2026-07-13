(() => {
  "use strict";

  const STORAGE_KEY = "payday_v1_8_7_data";

  const defaultData = {
    version: "1.8.7",
    settings: {
      savingsBuffer: 100,
      leftoverCash: 150,
      payFrequency: "biweekly",
      rentAdvance: true
    },
    paychecks: [],
    bills: [],
    debts: [],
    goals: [],
    transactions: []
  };

  let data = loadData();
  let selectedPaycheckId = null;

  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD"
  }).format(Number(value || 0));

  const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed ? { ...structuredClone(defaultData), ...parsed } : structuredClone(defaultData);
    } catch {
      return structuredClone(defaultData);
    }
  }

  function saveData(message = "Saved") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    $("storageStatus").textContent = `Saved locally • ${new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`;
    if (message) toast(message);
    renderAll();
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function daysUntil(dateString) {
    const now = new Date(todayISO() + "T00:00:00");
    const due = new Date(dateString + "T00:00:00");
    return Math.round((due - now) / 86400000);
  }

  function billStatus(bill) {
    if (bill.paid) return "paid";
    const days = daysUntil(bill.dueDate);
    if (days < 0) return "overdue";
    if (days <= 7) return "due";
    return "upcoming";
  }

  function statusBadge(status) {
    const labels = { paid: "Paid", overdue: "Overdue", due: "Due Soon", upcoming: "Upcoming" };
    return `<span class="badge badge-${status}">${labels[status]}</span>`;
  }

  function sortedPaychecks() {
    return [...data.paychecks].sort((a,b) => a.date.localeCompare(b.date));
  }

  function sortedBills() {
    return [...data.bills].sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  }

  function paycheckTotal(check) {
    return Number(check.amount || 0) + Number(check.extra || 0);
  }

  function assignedBills(paycheckId) {
    return data.bills.filter(b => b.paycheckId === paycheckId);
  }

  function paycheckRemaining(check) {
    const assigned = assignedBills(check.id).reduce((s,b) => s + Number(b.amount || 0), 0);
    return paycheckTotal(check) - assigned - Number(data.settings.savingsBuffer || 0) - Number(data.settings.leftoverCash || 0);
  }

  function nextPaycheck() {
    return sortedPaychecks().find(p => p.date >= todayISO()) || sortedPaychecks().at(-1) || null;
  }

  function renderDashboard() {
    const next = nextPaycheck();
    $("metricNextPaycheck").textContent = next ? money(paycheckTotal(next)) : money(0);
    $("metricNextPaycheckDate").textContent = next ? new Date(next.date + "T00:00:00").toLocaleDateString() : "No paycheck scheduled";

    const unpaid = data.bills.filter(b => !b.paid);
    $("metricUpcomingBills").textContent = money(unpaid.reduce((s,b) => s + Number(b.amount || 0), 0));
    $("metricUpcomingBillsCount").textContent = `${unpaid.length} unpaid bill${unpaid.length === 1 ? "" : "s"}`;
    $("metricDebt").textContent = money(data.debts.reduce((s,d) => s + Number(d.balance || 0), 0));
    $("metricDebtCount").textContent = `${data.debts.length} active debt${data.debts.length === 1 ? "" : "s"}`;
    $("metricAvailable").textContent = next ? money(paycheckRemaining(next)) : money(0);

    const plan = $("dashboardPaycheckPlan");
    if (!next) {
      plan.innerHTML = `<div class="empty-state">Add a paycheck to begin planning.</div>`;
    } else {
      const bills = assignedBills(next.id);
      plan.innerHTML = `
        <div class="list-row"><div><strong>${new Date(next.date+"T00:00:00").toLocaleDateString()}</strong><br><small>${next.notes || "Scheduled paycheck"}</small></div><strong>${money(paycheckTotal(next))}</strong></div>
        <div class="list-row"><span>Assigned bills</span><strong>${money(bills.reduce((s,b)=>s+Number(b.amount),0))}</strong></div>
        <div class="list-row"><span>Savings buffer</span><strong>${money(data.settings.savingsBuffer)}</strong></div>
        <div class="list-row"><span>Leftover cash</span><strong>${money(data.settings.leftoverCash)}</strong></div>
        <div class="list-row"><span>Remaining</span><strong>${money(paycheckRemaining(next))}</strong></div>`;
    }

    const status = $("dashboardBillStatus");
    const upcoming = sortedBills().filter(b => !b.paid).slice(0, 6);
    status.innerHTML = upcoming.length ? upcoming.map(b => `
      <div class="list-row">
        <div>${statusBadge(billStatus(b))} <strong>${escapeHtml(b.name)}</strong><br><small>${new Date(b.dueDate+"T00:00:00").toLocaleDateString()}</small></div>
        <strong>${money(b.amount)}</strong>
      </div>`).join("") : `<div class="empty-state">No unpaid bills.</div>`;

    const byPriority = [1,2,3].map(priority => ({
      priority,
      total: data.bills.filter(b => !b.paid && Number(b.priority) === priority).reduce((s,b)=>s+Number(b.amount),0)
    }));
    $("waterfallSummary").innerHTML = byPriority.map(x => `
      <div class="waterfall-row priority-${x.priority}">
        <span>Priority ${x.priority} ${x.priority===1?"— Fixed date":x.priority===2?"— Fixed flexible":"— Adjustable goals"}</span>
        <strong>${money(x.total)}</strong>
      </div>`).join("");
  }

  function renderPaychecks() {
    const tbody = $("paycheckTableBody");
    const checks = sortedPaychecks();
    tbody.innerHTML = checks.length ? checks.map(p => {
      const assigned = assignedBills(p.id).reduce((s,b)=>s+Number(b.amount),0);
      return `<tr>
        <td><button class="btn btn-small btn-secondary" data-select-paycheck="${p.id}">${new Date(p.date+"T00:00:00").toLocaleDateString()}</button></td>
        <td>${money(p.amount)}</td><td>${money(p.extra)}</td><td>${money(paycheckTotal(p))}</td>
        <td>${money(assigned)}</td><td>${money(paycheckRemaining(p))}</td>
        <td class="row-actions">
          <button class="btn btn-small btn-secondary" data-edit-paycheck="${p.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-delete-paycheck="${p.id}">Delete</button>
        </td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty-state">No paychecks added.</div></td></tr>`;

    renderPaycheckOptions();
    renderSelectedPaycheck();
  }

  function renderSelectedPaycheck() {
    const container = $("selectedPaycheckBreakdown");
    const check = data.paychecks.find(p => p.id === selectedPaycheckId);
    if (!check) {
      container.className = "empty-state";
      container.innerHTML = "Select a paycheck to see its breakdown.";
      return;
    }
    const bills = assignedBills(check.id).sort((a,b)=>Number(a.priority)-Number(b.priority));
    container.className = "waterfall";
    container.innerHTML = `
      <div class="waterfall-row"><span>Paycheck total</span><strong>${money(paycheckTotal(check))}</strong></div>
      ${bills.map(b=>`<div class="waterfall-row priority-${b.priority}"><span>${escapeHtml(b.name)}</span><strong>-${money(b.amount)}</strong></div>`).join("")}
      <div class="waterfall-row priority-3"><span>Savings buffer</span><strong>-${money(data.settings.savingsBuffer)}</strong></div>
      <div class="waterfall-row priority-3"><span>Leftover cash</span><strong>-${money(data.settings.leftoverCash)}</strong></div>
      <div class="waterfall-row"><span>Remaining</span><strong>${money(paycheckRemaining(check))}</strong></div>`;
  }

  function renderPaycheckOptions() {
    const select = $("billPaycheckId");
    const current = select.value;
    select.innerHTML = `<option value="">Unassigned</option>` + sortedPaychecks().map(p =>
      `<option value="${p.id}">${new Date(p.date+"T00:00:00").toLocaleDateString()} — ${money(paycheckTotal(p))}</option>`
    ).join("");
    select.value = current;
  }

  function renderBills() {
    const filter = $("billFilter").value;
    let bills = sortedBills();
    if (filter === "paid") bills = bills.filter(b=>b.paid);
    if (filter === "unpaid") bills = bills.filter(b=>!b.paid);
    if (filter === "overdue") bills = bills.filter(b=>billStatus(b)==="overdue");

    const tbody = $("billTableBody");
    tbody.innerHTML = bills.length ? bills.map(b => {
      const check = data.paychecks.find(p=>p.id===b.paycheckId);
      return `<tr>
        <td>${statusBadge(billStatus(b))}</td>
        <td><strong>${escapeHtml(b.name)}</strong><br><small class="muted">${escapeHtml(b.category || "Uncategorized")}${b.recurring ? " • Recurring" : ""}</small></td>
        <td>${money(b.amount)}</td>
        <td>${new Date(b.dueDate+"T00:00:00").toLocaleDateString()}</td>
        <td>${b.priority}</td>
        <td>${check ? new Date(check.date+"T00:00:00").toLocaleDateString() : "Unassigned"}</td>
        <td><input type="checkbox" data-toggle-paid="${b.id}" ${b.paid ? "checked" : ""} /></td>
        <td class="row-actions">
          <button class="btn btn-small btn-secondary" data-edit-bill="${b.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-delete-bill="${b.id}">Delete</button>
        </td></tr>`;
    }).join("") : `<tr><td colspan="8"><div class="empty-state">No bills match this filter.</div></td></tr>`;
  }

  function renderMonthly() {
    const selectedMonth = $("monthPicker").value || todayISO().slice(0,7);
    const checks = sortedPaychecks().filter(p=>p.date.startsWith(selectedMonth));
    const bills = sortedBills().filter(b=>b.dueDate.startsWith(selectedMonth));
    const income = checks.reduce((s,p)=>s+paycheckTotal(p),0);
    const expenses = bills.reduce((s,b)=>s+Number(b.amount),0);
    const paid = bills.filter(b=>b.paid).reduce((s,b)=>s+Number(b.amount),0);
    const buffers = checks.length * (Number(data.settings.savingsBuffer)+Number(data.settings.leftoverCash));

    $("monthlySummary").innerHTML = [
      ["Income", income],
      ["Bills", expenses],
      ["Paid", paid],
      ["After bills & buffers", income-expenses-buffers]
    ].map(([label,val])=>`<article class="metric-card"><span>${label}</span><strong>${money(val)}</strong></article>`).join("");

    const container = $("monthlyPaycheckCards");
    container.innerHTML = checks.length ? checks.map(p => {
      const pbills = assignedBills(p.id);
      return `<article class="data-card">
        <div class="data-card-header"><div><strong>${new Date(p.date+"T00:00:00").toLocaleDateString()}</strong><div class="muted">${p.notes || "Paycheck"}</div></div><strong>${money(paycheckTotal(p))}</strong></div>
        <div class="card-meta"><span>${pbills.length} assigned bills</span><span>Remaining ${money(paycheckRemaining(p))}</span></div>
        <div class="stack" style="margin-top:12px">${pbills.map(b=>`<div class="list-row"><span>${escapeHtml(b.name)}</span><strong>${money(b.amount)}</strong></div>`).join("") || `<div class="empty-state">No bills assigned.</div>`}</div>
      </article>`;
    }).join("") : `<div class="empty-state">No paychecks in this month.</div>`;
  }

  function renderDebts() {
    const container = $("debtCards");
    container.innerHTML = data.debts.length ? data.debts.map(d => {
      const original = Number(d.original || d.balance || 0);
      const paid = Math.max(0, original - Number(d.balance || 0));
      const pct = original ? Math.min(100, paid/original*100) : 0;
      return `<article class="data-card">
        <div class="data-card-header"><div><strong>${escapeHtml(d.name)}</strong><div class="muted">${Number(d.apr||0).toFixed(2)}% APR</div></div><strong>${money(d.balance)}</strong></div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="card-meta"><span>${pct.toFixed(1)}% paid</span><span>Minimum ${money(d.minimum)}</span></div>
        <div class="form-actions"><button class="btn btn-small btn-danger" data-delete-debt="${d.id}">Delete</button></div>
      </article>`;
    }).join("") : `<div class="empty-state">No debts added.</div>`;
  }

  function renderGoals() {
    const container = $("goalCards");
    container.innerHTML = data.goals.length ? data.goals.sort((a,b)=>Number(a.priority)-Number(b.priority)).map(g => {
      const pct = Number(g.target) ? Math.min(100, Number(g.current)/Number(g.target)*100) : 0;
      return `<article class="data-card">
        <div class="data-card-header"><div><strong>${escapeHtml(g.name)}</strong><div class="muted">Priority ${g.priority}</div></div><strong>${money(g.current)} / ${money(g.target)}</strong></div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="card-meta"><span>${pct.toFixed(1)}% complete</span></div>
        <div class="form-actions">
          <button class="btn btn-small btn-secondary" data-add-goal="${g.id}">Add Contribution</button>
          <button class="btn btn-small btn-danger" data-delete-goal="${g.id}">Delete</button>
        </div>
      </article>`;
    }).join("") : `<div class="empty-state">No savings goals added.</div>`;
  }

  function renderReports() {
    const totalIncome = data.paychecks.reduce((s,p)=>s+paycheckTotal(p),0);
    const totalBills = data.bills.reduce((s,b)=>s+Number(b.amount),0);
    const totalPaid = data.bills.filter(b=>b.paid).reduce((s,b)=>s+Number(b.amount),0);
    const totalDebt = data.debts.reduce((s,d)=>s+Number(d.balance),0);
    $("reportCards").innerHTML = [
      ["Scheduled Income", totalIncome],["Total Bills", totalBills],["Bills Paid", totalPaid],["Debt Balance", totalDebt]
    ].map(([label,val])=>`<article class="metric-card"><span>${label}</span><strong>${money(val)}</strong></article>`).join("");

    renderBarReport("categoryReport", groupTotals(data.bills, b=>b.category || "Uncategorized"));
    renderBarReport("priorityReport", groupTotals(data.bills, b=>`Priority ${b.priority}`));
  }

  function groupTotals(items, keyFn) {
    return items.reduce((acc,item)=>{
      const key = keyFn(item);
      acc[key] = (acc[key] || 0) + Number(item.amount || 0);
      return acc;
    }, {});
  }

  function renderBarReport(id, totals) {
    const max = Math.max(1, ...Object.values(totals));
    $(id).innerHTML = Object.keys(totals).length ? Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
      <div class="bar-row"><span>${escapeHtml(k)}</span><div class="bar-track"><span style="width:${v/max*100}%"></span></div><strong>${money(v)}</strong></div>
    `).join("") : `<div class="empty-state">No data available.</div>`;
  }

  function renderSettings() {
    $("settingsSavingsBuffer").value = data.settings.savingsBuffer;
    $("settingsLeftoverCash").value = data.settings.leftoverCash;
    $("settingsPayFrequency").value = data.settings.payFrequency;
    $("settingsRentAdvance").checked = !!data.settings.rentAdvance;
  }

  function renderAll() {
    renderDashboard();
    renderPaychecks();
    renderBills();
    renderMonthly();
    renderDebts();
    renderGoals();
    renderReports();
    renderSettings();
  }

  function openModal(id) {
    if (id === "billModal") resetBillForm();
    if (id === "paycheckModal") resetPaycheckForm();
    $(id).showModal();
  }

  function resetBillForm() {
    $("billForm").reset();
    $("billId").value = "";
    $("billDueDate").value = todayISO();
    $("billPriority").value = "2";
    $("billModalTitle").textContent = "Add Bill";
    renderPaycheckOptions();
  }

  function resetPaycheckForm() {
    $("paycheckForm").reset();
    $("paycheckId").value = "";
    $("paycheckDate").value = todayISO();
    $("paycheckExtra").value = "0";
    $("paycheckModalTitle").textContent = "Add Paycheck";
  }

  function editBill(id) {
    const b = data.bills.find(x=>x.id===id);
    if (!b) return;
    resetBillForm();
    $("billId").value = b.id;
    $("billName").value = b.name;
    $("billAmount").value = b.amount;
    $("billDueDate").value = b.dueDate;
    $("billCategory").value = b.category || "";
    $("billPriority").value = String(b.priority);
    $("billPaycheckId").value = b.paycheckId || "";
    $("billRecurring").checked = !!b.recurring;
    $("billPaid").checked = !!b.paid;
    $("billModalTitle").textContent = "Edit Bill";
    $("billModal").showModal();
  }

  function editPaycheck(id) {
    const p = data.paychecks.find(x=>x.id===id);
    if (!p) return;
    resetPaycheckForm();
    $("paycheckId").value = p.id;
    $("paycheckDate").value = p.date;
    $("paycheckAmount").value = p.amount;
    $("paycheckExtra").value = p.extra || 0;
    $("paycheckNotes").value = p.notes || "";
    $("paycheckModalTitle").textContent = "Edit Paycheck";
    $("paycheckModal").showModal();
  }

  function loadDemoData() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth()+1).padStart(2,"0");
    const nextMonthDate = new Date(year, new Date().getMonth()+1, 1);
    const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth()+1).padStart(2,"0")}`;
    const p1 = uid("pay"), p2 = uid("pay");
    data = structuredClone(defaultData);
    data.paychecks = [
      {id:p1,date:`${year}-${month}-10`,amount:2184,extra:0,notes:"Regular paycheck"},
      {id:p2,date:`${year}-${month}-24`,amount:2184,extra:150,notes:"Regular paycheck + overtime"}
    ];
    data.bills = [
      {id:uid("bill"),name:"Rent",amount:1150,dueDate:`${nextMonth}-01`,category:"Housing",priority:2,paycheckId:p1,recurring:true,paid:false},
      {id:uid("bill"),name:"Student Loan 1",amount:100,dueDate:`${year}-${month}-05`,category:"Debt",priority:1,paycheckId:p1,recurring:true,paid:false},
      {id:uid("bill"),name:"Spotify",amount:12,dueDate:`${year}-${month}-12`,category:"Subscription",priority:1,paycheckId:p1,recurring:true,paid:false},
      {id:uid("bill"),name:"Electric",amount:75,dueDate:`${year}-${month}-16`,category:"Utility",priority:2,paycheckId:p1,recurring:true,paid:false},
      {id:uid("bill"),name:"Student Loan 2",amount:238,dueDate:`${year}-${month}-18`,category:"Debt",priority:1,paycheckId:p2,recurring:true,paid:false},
      {id:uid("bill"),name:"Credit Card",amount:300,dueDate:`${year}-${month}-22`,category:"Debt",priority:2,paycheckId:p2,recurring:true,paid:false},
      {id:uid("bill"),name:"Personal Loan",amount:444,dueDate:`${year}-${month}-28`,category:"Debt",priority:2,paycheckId:p2,recurring:true,paid:false}
    ];
    data.debts = [
      {id:uid("debt"),name:"PSECU Credit Card",balance:16250,original:18000,apr:12.9,minimum:300},
      {id:uid("debt"),name:"Personal Loans",balance:17000,original:20000,apr:8.5,minimum:444},
      {id:uid("debt"),name:"Student Loans",balance:30000,original:34000,apr:5.2,minimum:338}
    ];
    data.goals = [
      {id:uid("goal"),name:"Emergency Fund",target:5000,current:1200,priority:1},
      {id:uid("goal"),name:"Wedding Savings",target:10000,current:3200,priority:2}
    ];
    saveData("Demo data loaded");
  }

  function exportJson() {
    downloadBlob(JSON.stringify(data,null,2), "PayDay_v1.8.7_backup.json", "application/json");
  }

  function exportCsv() {
    const rows = [["Status","Bill","Amount","Due Date","Category","Priority","Paid"]];
    sortedBills().forEach(b=>rows.push([billStatus(b),b.name,b.amount,b.dueDate,b.category||"",b.priority,b.paid?"Yes":"No"]));
    const csv = rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    downloadBlob(csv, "PayDay_Bills.csv", "text/csv");
  }

  function downloadBlob(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-page]");
    if (nav) {
      document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
      nav.classList.add("active");
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      $(nav.dataset.page).classList.add("active");
      $("pageTitle").textContent = nav.textContent;
    }

    const modal = e.target.closest("[data-open-modal]");
    if (modal) openModal(modal.dataset.openModal);

    const selectPay = e.target.closest("[data-select-paycheck]");
    if (selectPay) { selectedPaycheckId = selectPay.dataset.selectPaycheck; renderSelectedPaycheck(); }

    const editB = e.target.closest("[data-edit-bill]");
    if (editB) editBill(editB.dataset.editBill);
    const delB = e.target.closest("[data-delete-bill]");
    if (delB && confirm("Delete this bill?")) {
      data.bills = data.bills.filter(b=>b.id!==delB.dataset.deleteBill); saveData("Bill deleted");
    }

    const editP = e.target.closest("[data-edit-paycheck]");
    if (editP) editPaycheck(editP.dataset.editPaycheck);
    const delP = e.target.closest("[data-delete-paycheck]");
    if (delP && confirm("Delete this paycheck? Assigned bills will become unassigned.")) {
      const id = delP.dataset.deletePaycheck;
      data.paychecks = data.paychecks.filter(p=>p.id!==id);
      data.bills.forEach(b=>{ if (b.paycheckId===id) b.paycheckId=""; });
      if (selectedPaycheckId===id) selectedPaycheckId=null;
      saveData("Paycheck deleted");
    }

    const delD = e.target.closest("[data-delete-debt]");
    if (delD && confirm("Delete this debt?")) {
      data.debts = data.debts.filter(d=>d.id!==delD.dataset.deleteDebt); saveData("Debt deleted");
    }

    const delG = e.target.closest("[data-delete-goal]");
    if (delG && confirm("Delete this goal?")) {
      data.goals = data.goals.filter(g=>g.id!==delG.dataset.deleteGoal); saveData("Goal deleted");
    }

    const addG = e.target.closest("[data-add-goal]");
    if (addG) {
      const goal = data.goals.find(g=>g.id===addG.dataset.addGoal);
      const amount = Number(prompt("Contribution amount:", "0"));
      if (goal && Number.isFinite(amount) && amount > 0) {
        goal.current = Number(goal.current||0)+amount;
        data.transactions.push({id:uid("txn"),date:todayISO(),type:"goal",name:goal.name,amount});
        saveData("Contribution added");
      }
    }
  });

  document.addEventListener("change", (e)=>{
    if (e.target.matches("[data-toggle-paid]")) {
      const bill = data.bills.find(b=>b.id===e.target.dataset.togglePaid);
      if (bill) {
        bill.paid = e.target.checked;
        data.transactions.push({id:uid("txn"),date:todayISO(),type:"bill",name:bill.name,amount:Number(bill.amount),paid:bill.paid});
        saveData(bill.paid ? "Bill marked paid" : "Bill marked unpaid");
      }
    }
  });

  $("billForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    const id = $("billId").value || uid("bill");
    const bill = {
      id,
      name:$("billName").value.trim(),
      amount:Number($("billAmount").value),
      dueDate:$("billDueDate").value,
      category:$("billCategory").value.trim(),
      priority:Number($("billPriority").value),
      paycheckId:$("billPaycheckId").value,
      recurring:$("billRecurring").checked,
      paid:$("billPaid").checked
    };
    const i = data.bills.findIndex(b=>b.id===id);
    if (i>=0) data.bills[i]=bill; else data.bills.push(bill);
    $("billModal").close();
    saveData(i>=0 ? "Bill updated" : "Bill added");
  });

  $("paycheckForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    const id = $("paycheckId").value || uid("pay");
    const paycheck = {
      id,
      date:$("paycheckDate").value,
      amount:Number($("paycheckAmount").value),
      extra:Number($("paycheckExtra").value || 0),
      notes:$("paycheckNotes").value.trim()
    };
    const i = data.paychecks.findIndex(p=>p.id===id);
    if (i>=0) data.paychecks[i]=paycheck; else data.paychecks.push(paycheck);
    $("paycheckModal").close();
    selectedPaycheckId = id;
    saveData(i>=0 ? "Paycheck updated" : "Paycheck added");
  });

  $("debtForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    data.debts.push({
      id:uid("debt"),
      name:$("debtName").value.trim(),
      balance:Number($("debtBalance").value),
      original:Number($("debtOriginal").value || $("debtBalance").value),
      apr:Number($("debtApr").value || 0),
      minimum:Number($("debtMinimum").value || 0)
    });
    $("debtModal").close(); $("debtForm").reset(); saveData("Debt added");
  });

  $("goalForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    data.goals.push({
      id:uid("goal"),
      name:$("goalName").value.trim(),
      target:Number($("goalTarget").value),
      current:Number($("goalCurrent").value || 0),
      priority:Number($("goalPriority").value)
    });
    $("goalModal").close(); $("goalForm").reset(); saveData("Goal added");
  });

  $("settingsForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    data.settings = {
      savingsBuffer:Number($("settingsSavingsBuffer").value || 0),
      leftoverCash:Number($("settingsLeftoverCash").value || 0),
      payFrequency:$("settingsPayFrequency").value,
      rentAdvance:$("settingsRentAdvance").checked
    };
    saveData("Settings saved");
  });

  $("billFilter").addEventListener("change", renderBills);
  $("monthPicker").addEventListener("change", renderMonthly);
  $("quickAddBill").addEventListener("click", ()=>openModal("billModal"));
  $("quickAddPaycheck").addEventListener("click", ()=>openModal("paycheckModal"));
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("exportCsvBtn").addEventListener("click", exportCsv);
  $("loadDemoBtn").addEventListener("click", ()=>{ if(confirm("Replace current data with demo data?")) loadDemoData(); });
  $("resetDataBtn").addEventListener("click", ()=>{
    if (confirm("Reset all PayDay data? This cannot be undone unless you exported a backup.")) {
      data = structuredClone(defaultData); localStorage.removeItem(STORAGE_KEY); saveData("All data reset");
    }
  });

  $("importJsonInput").addEventListener("change", async (e)=>{
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      data = { ...structuredClone(defaultData), ...imported };
      saveData("Backup imported");
    } catch {
      alert("That file is not a valid PayDay backup.");
    }
    e.target.value = "";
  });

  $("todayLabel").textContent = new Date().toLocaleDateString(undefined, {weekday:"long",year:"numeric",month:"long",day:"numeric"});
  $("monthPicker").value = todayISO().slice(0,7);
  renderAll();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
})();
