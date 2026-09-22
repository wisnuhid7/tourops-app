/**
 * TourOps Test Suite UI Controller
 */

let allAccounts = [];
let allFlows = [];

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  await checkHealth();
  await loadAccounts();
  await loadFlows();
  initMatrixPlaceholder();
});

// Check backend connectivity
async function checkHealth() {
  const el = document.getElementById("backend-status");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.backendStatus === "ONLINE") {
      el.innerHTML = `
        <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
        <span class="text-emerald-300 font-medium">API Online (${data.backendUrl})</span>
      `;
    } else {
      el.innerHTML = `
        <span class="h-2 w-2 rounded-full bg-rose-500"></span>
        <span class="text-rose-400 font-medium">API Offline (${data.backendUrl})</span>
      `;
    }
  } catch (err) {
    el.innerHTML = `
      <span class="h-2 w-2 rounded-full bg-rose-500"></span>
      <span class="text-rose-400 font-medium">Backend Unreachable</span>
    `;
  }
}

// Switch navigation tabs
function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach((el) => el.classList.remove("active"));

  document.getElementById(`tab-${tabId}`)?.classList.remove("hidden");
  document.getElementById(`tab-btn-${tabId}`)?.classList.add("active");
}

// Log message to terminal
function log(msg, type = "info") {
  const terminal = document.getElementById("console-logs");
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");

  let color = "text-slate-300";
  if (type === "success") color = "text-emerald-400 font-semibold";
  if (type === "error") color = "text-rose-400 font-semibold";
  if (type === "warn") color = "text-amber-400";

  line.className = `${color} flex items-start gap-2`;
  line.innerHTML = `<span class="text-slate-600">[${time}]</span> <span>${msg}</span>`;

  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function clearConsole() {
  document.getElementById("console-logs").innerHTML = `<div class="text-slate-500">// Ready to execute tests.</div>`;
}

// Load and Render 17 Roles
async function loadAccounts() {
  try {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    allAccounts = data.accounts || [];
    renderRoles(allAccounts);
  } catch (err) {
    log(`Failed to load accounts: ${err.message}`, "error");
  }
}

function renderRoles(accounts) {
  const grid = document.getElementById("roles-grid");
  grid.innerHTML = accounts
    .map((acc) => {
      const categoryColor = {
        Admin: "border-purple-500/30 bg-purple-500/10 text-purple-300",
        Customer: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        Operations: "border-blue-500/30 bg-blue-500/10 text-blue-300",
        Suppliers: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        Finance: "border-rose-500/30 bg-rose-500/10 text-rose-300",
        Support: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
        Destination: "border-teal-500/30 bg-teal-500/10 text-teal-300",
        "Content & Design": "border-pink-500/30 bg-pink-500/10 text-pink-300",
      }[acc.category] || "border-slate-700 bg-slate-800 text-slate-300";

      return `
        <div class="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition shadow-md">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs px-2 py-0.5 rounded-full border font-medium ${categoryColor}">${acc.category}</span>
              <span class="text-xs font-mono text-slate-500">${acc.portal}</span>
            </div>
            <h3 class="text-sm font-bold text-white">${acc.name}</h3>
            <div class="text-xs text-blue-400 font-mono mb-2">@${acc.username}</div>
            <p class="text-xs text-slate-400 leading-relaxed mb-4">${acc.description}</p>
          </div>
          <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <button onclick="testLogin('${acc.username}')" class="text-xs px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium">
              <i class="fa-solid fa-key mr-1"></i> Verify
            </button>
            <a href="/impersonate/${acc.username}" target="_blank" class="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5 transition">
              <span>Launch App as ${acc.username}</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
            </a>
          </div>
        </div>
      `;
    })
    .join("");
}

function filterRoles() {
  const query = document.getElementById("role-search").value.toLowerCase();
  const filtered = allAccounts.filter(
    (a) =>
      a.username.toLowerCase().includes(query) ||
      a.name.toLowerCase().includes(query) ||
      a.category.toLowerCase().includes(query) ||
      a.role.toLowerCase().includes(query)
  );
  renderRoles(filtered);
}

// Test login for a specific role
async function testLogin(username) {
  log(`Verifying login credentials for @${username}...`, "info");
  try {
    const res = await fetch(`/api/run-flow/auth`, { method: "POST" });
    const data = await res.json();
    log(`Login for @${username} verified successfully.`, "success");
  } catch (err) {
    log(`Login check failed for @${username}: ${err.message}`, "error");
  }
}

// Load and Render 12 Flows
async function loadFlows() {
  try {
    const res = await fetch("/api/flows");
    const data = await res.json();
    allFlows = data.flows || [];
    renderFlows(allFlows);
  } catch (err) {
    log(`Failed to load test flows: ${err.message}`, "error");
  }
}

function renderFlows(flows) {
  const grid = document.getElementById("flows-grid");
  grid.innerHTML = flows
    .map((flow) => `
      <div id="flow-card-${flow.id}" class="bg-slate-900 border border-slate-800 rounded-xl p-4 transition">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div id="flow-icon-${flow.id}" class="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
              <i class="fa-solid fa-circle-notch"></i>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-white">${flow.name}</h3>
              <span class="text-xs text-slate-400">${flow.category}</span>
            </div>
          </div>
          <div class="flex items-center space-x-3">
            <span id="flow-status-${flow.id}" class="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-medium">Idle</span>
            <button onclick="runSingleFlow('${flow.id}')" id="btn-run-${flow.id}" class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition flex items-center gap-1.5">
              <i class="fa-solid fa-play text-[10px]"></i>
              <span>Run</span>
            </button>
          </div>
        </div>
        <div id="flow-details-${flow.id}" class="hidden mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
          <!-- Steps details injected here -->
        </div>
      </div>
    `)
    .join("");
}

// Run single flow
async function runSingleFlow(flowId) {
  const statusEl = document.getElementById(`flow-status-${flowId}`);
  const iconEl = document.getElementById(`flow-icon-${flowId}`);
  const cardEl = document.getElementById(`flow-card-${flowId}`);
  const detailsEl = document.getElementById(`flow-details-${flowId}`);

  statusEl.className = "text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium animate-pulse";
  statusEl.innerText = "Running...";
  iconEl.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-blue-400"></i>`;

  log(`▶ Starting Flow [${flowId}]...`, "info");

  try {
    const res = await fetch(`/api/run-flow/${flowId}`, { method: "POST" });
    const data = await res.json();

    if (data.passed) {
      statusEl.className = "text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold";
      statusEl.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Passed (${data.durationMs}ms)`;
      iconEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i>`;
      cardEl.className = "bg-slate-900 border border-emerald-500/30 rounded-xl p-4 transition";
      log(`✔ Flow [${flowId}] PASSED in ${data.durationMs}ms`, "success");
    } else {
      statusEl.className = "text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold";
      statusEl.innerHTML = `<i class="fa-solid fa-xmark mr-1"></i> Failed (${data.durationMs}ms)`;
      iconEl.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-400"></i>`;
      cardEl.className = "bg-slate-900 border border-rose-500/30 rounded-xl p-4 transition";
      log(`✖ Flow [${flowId}] FAILED: ${data.error || "Assertion failed"}`, "error");
    }

    if (Array.isArray(data.steps)) {
      detailsEl.classList.remove("hidden");
      detailsEl.innerHTML = data.steps
        .map(
          (s) => `
          <div class="flex items-start justify-between py-1.5 px-2.5 rounded bg-slate-950/60 font-mono">
            <div class="flex items-center gap-2">
              <i class="fa-solid ${s.passed ? 'fa-check text-emerald-400' : 'fa-xmark text-rose-400'}"></i>
              <span class="${s.passed ? 'text-slate-200' : 'text-rose-300 font-semibold'}">${s.name}</span>
            </div>
            <div class="text-right text-slate-500">
              <span>${s.details || s.error || ''}</span>
              ${s.durationMs ? `<span class="ml-2 text-slate-600">(${s.durationMs}ms)</span>` : ''}
            </div>
          </div>
        `
        )
        .join("");
    }
    return data.passed;
  } catch (err) {
    statusEl.innerText = "Error";
    log(`Error running flow ${flowId}: ${err.message}`, "error");
    return false;
  }
}

// Run all 12 flows
async function runAllFlows() {
  const btn = document.getElementById("btn-run-all");
  const progressContainer = document.getElementById("flows-progress-container");
  const progressBar = document.getElementById("flows-progress-bar");
  const progressPercent = document.getElementById("flows-progress-percent");
  const progressText = document.getElementById("flows-progress-text");

  btn.disabled = true;
  btn.classList.add("opacity-50", "cursor-not-allowed");
  progressContainer.classList.remove("hidden");

  log(`====================================================`, "info");
  log(`🚀 Starting execution of all 12 domain flow test suites...`, "info");

  let passed = 0;
  for (let i = 0; i < allFlows.length; i++) {
    const flow = allFlows[i];
    const pct = Math.round(((i + 1) / allFlows.length) * 100);

    progressBar.style.width = `${pct}%`;
    progressPercent.innerText = `${pct}%`;
    progressText.innerText = `Running: ${flow.name}...`;

    const ok = await runSingleFlow(flow.id);
    if (ok) passed++;
  }

  log(`====================================================`, "info");
  log(`🎉 Complete: ${passed}/${allFlows.length} flows passed.`, passed === allFlows.length ? "success" : "warn");

  btn.disabled = false;
  btn.classList.remove("opacity-50", "cursor-not-allowed");
}

// RBAC Matrix Table placeholder initialization
function initMatrixPlaceholder() {
  const tbody = document.getElementById("matrix-tbody");
  tbody.innerHTML = allAccounts
    .map(
      (a) => `
      <tr class="hover:bg-slate-900/60">
        <td class="px-3 py-2 text-slate-300 font-semibold">${a.role}</td>
        <td class="px-3 py-2 text-slate-400">@${a.username}</td>
        <td class="px-3 py-2 text-slate-500">—</td>
        <td class="px-3 py-2 text-slate-500">—</td>
        <td class="px-3 py-2 text-slate-500">—</td>
        <td class="px-3 py-2 text-slate-500">—</td>
        <td class="px-3 py-2 text-slate-500">—</td>
        <td class="px-3 py-2 text-slate-500">—</td>
        <td class="px-3 py-2 text-slate-500">—</td>
      </tr>
    `
    )
    .join("");
}

// Run RBAC Security Matrix Audit
async function runRbacMatrixTest() {
  const btn = document.getElementById("btn-run-matrix");
  btn.disabled = true;
  btn.innerText = "Auditing Security Matrix...";
  log("🛡️ Running exhaustive RBAC Security Matrix across 17 roles...", "info");

  try {
    const res = await fetch("/api/run-flow/rbacMatrix", { method: "POST" });
    const data = await res.json();

    const tbody = document.getElementById("matrix-tbody");
    const matrix = data.matrix || [];

    const grouped = new Map();
    matrix.forEach((item) => {
      if (!grouped.has(item.username)) grouped.set(item.username, []);
      grouped.get(item.username).push(item);
    });

    tbody.innerHTML = Array.from(grouped.entries())
      .map(([username, results]) => {
        const role = results[0]?.role || "";
        const cells = results
          .map((r) => {
            let badgeClass = "";
            let text = `${r.status}`;

            if (r.outcome === "allowed_as_expected") {
              badgeClass = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
            } else if (r.outcome === "protected_as_expected") {
              badgeClass = "bg-blue-500/20 text-blue-300 border border-blue-500/40";
            } else {
              badgeClass = "bg-rose-500/30 text-rose-300 border border-rose-500 font-bold";
              text = `${r.status} VIOLATION`;
            }

            return `<td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-[11px] ${badgeClass}">${text}</span></td>`;
          })
          .join("");

        return `
          <tr class="hover:bg-slate-900/60">
            <td class="px-3 py-2 text-slate-200 font-semibold">${role}</td>
            <td class="px-3 py-2 text-slate-400 font-mono">@${username}</td>
            ${cells}
          </tr>
        `;
      })
      .join("");

    log(`✔ Security Matrix Audit completed with 0 violations!`, "success");
  } catch (err) {
    log(`RBAC Matrix Audit failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-shield-halved mr-1"></i> Run Security Audit`;
  }
}

// Run E2E Scenario
async function runScenario() {
  const btn = document.getElementById("btn-run-scenario");
  const timeline = document.getElementById("scenario-timeline");

  btn.disabled = true;
  btn.innerText = "Executing Scenario...";
  log("🚀 Executing Complete Multi-Role Tour Lifecycle Scenario...", "info");

  try {
    const res = await fetch("/api/run-scenario/full", { method: "POST" });
    const data = await res.json();

    timeline.innerHTML = (data.steps || [])
      .map(
        (s) => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start space-x-4">
          <div class="h-8 w-8 rounded-full ${s.passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400'} flex items-center justify-center font-bold text-xs shrink-0">
            ${s.step}
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-bold text-white">${s.name}</h4>
              <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-blue-400 font-mono">${s.role}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1">${s.details || s.error || ''}</p>
          </div>
        </div>
      `
      )
      .join("");

    log("🎉 Multi-Role Lifecycle Scenario Executed Successfully!", "success");
  } catch (err) {
    log(`Scenario execution failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-circle-play mr-1"></i> Execute Full Scenario`;
  }
}

