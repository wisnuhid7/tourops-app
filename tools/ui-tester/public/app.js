/**
 * TourOps Visual UI Tester Controller
 */

let flows = [];
let activeViewport = "desktop";

document.addEventListener("DOMContentLoaded", async () => {
  await checkHealth();
  await loadFlows();
});

async function checkHealth() {
  const el = document.getElementById("status-indicator");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.status === "ONLINE") {
      el.innerHTML = `
        <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
        <span class="text-emerald-300 font-medium">Engine Ready (Target: ${data.appUrl})</span>
      `;
    }
  } catch (err) {
    el.innerHTML = `
      <span class="h-2 w-2 rounded-full bg-rose-500"></span>
      <span class="text-rose-400 font-medium">Server Offline</span>
    `;
  }
}

function setViewport(vp) {
  activeViewport = vp;
  document.querySelectorAll(".vp-btn").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`vp-${vp}`)?.classList.add("active");
  log(`Viewport set to ${vp.toUpperCase()}`, "info");
}

async function loadFlows() {
  try {
    const res = await fetch("/api/flows");
    const data = await res.json();
    flows = data.flows || [];
    renderFlows(flows);
    document.getElementById("flows-summary").textContent = `${flows.length} Scenarios Loaded`;
  } catch (err) {
    log(`Failed to load flows: ${err.message}`, "error");
  }
}

function renderFlows(list) {
  const grid = document.getElementById("flows-grid");
  grid.innerHTML = list
    .map((f) => {
      return `
        <div id="card-${f.id}" class="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition shadow-lg">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">${f.category}</span>
              <span id="badge-${f.id}" class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Idle</span>
            </div>
            <h4 class="text-sm font-bold text-white mb-1">${f.name}</h4>
            <p class="text-xs text-slate-400 line-clamp-2">${f.description}</p>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span id="meta-${f.id}" class="text-[11px] text-slate-500 font-mono">0 steps</span>
            <button onclick="runSingleFlow('${f.id}')" id="btn-${f.id}" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition">
              <i class="fa-solid fa-play text-[10px] text-indigo-400"></i>
              <span>Run UI</span>
            </button>
          </div>

          <!-- Step screenshots gallery container -->
          <div id="shots-${f.id}" class="hidden mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2">
          </div>
        </div>
      `;
    })
    .join("");
}

function log(msg, type = "info") {
  const terminal = document.getElementById("execution-logs");
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

function clearLogs() {
  document.getElementById("execution-logs").innerHTML = `<div class="text-slate-500">// Ready.</div>`;
}

async function runSingleFlow(flowId) {
  const btn = document.getElementById(`btn-${flowId}`);
  const badge = document.getElementById(`badge-${flowId}`);
  const shotsContainer = document.getElementById(`shots-${flowId}`);
  const isHeaded = document.getElementById("toggle-headed").checked;

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Running`;
  badge.className = "text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20";
  badge.textContent = "Running";

  log(`▶ Executing ${flowId} (Viewport: ${activeViewport}, Headed: ${isHeaded})...`, "info");

  try {
    const res = await fetch(`/api/run-flow/${flowId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headless: !isHeaded, viewport: activeViewport }),
    });

    const data = await res.json();

    if (data.passed) {
      badge.className = "text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      badge.textContent = `Passed (${data.durationMs}ms)`;
      log(`✅ ${data.name} PASSED in ${data.durationMs}ms`, "success");
    } else {
      badge.className = "text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20";
      badge.textContent = `Failed`;
      log(`❌ ${data.name} FAILED: ${data.error || "Step assertion failed"}`, "error");
    }

    // Render step results & screenshots
    if (data.steps && data.steps.length > 0) {
      shotsContainer.classList.remove("hidden");
      shotsContainer.innerHTML = data.steps
        .map((s, idx) => {
          if (s.screenshot) {
            return `
              <div onclick="openModal('${s.name}', '${s.details || ""}', '${s.screenshot}')" class="group relative cursor-pointer overflow-hidden rounded border border-slate-700 hover:border-indigo-500 transition">
                <img src="${s.screenshot}" alt="${s.name}" class="w-full h-12 object-cover">
                <div class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[10px] text-white font-medium">
                  Step ${idx + 1}
                </div>
              </div>
            `;
          }
          return "";
        })
        .join("");

      data.steps.forEach((s) => {
        log(`  - [${s.passed ? "OK" : "FAIL"}] ${s.name}: ${s.details || s.error || ""}`);
      });
    }
  } catch (err) {
    badge.className = "text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20";
    badge.textContent = "Error";
    log(`Network error running ${flowId}: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-play text-[10px] text-indigo-400"></i> Run UI`;
  }
}

async function runAllUiFlows() {
  const btn = document.getElementById("btn-run-all");
  const isHeaded = document.getElementById("toggle-headed").checked;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Executing Suite...`;

  log(`🚀 Starting Full UI Test Suite Execution (${flows.length} Scenarios)...`, "info");

  for (const f of flows) {
    await runSingleFlow(f.id);
  }

  log(`🎉 Full UI Suite Execution Completed!`, "success");
  btn.disabled = false;
  btn.innerHTML = `<i class="fa-solid fa-play"></i> Run All UI Flows`;
}

function openModal(title, desc, src) {
  document.getElementById("modal-step-title").textContent = title;
  document.getElementById("modal-step-desc").textContent = desc;
  document.getElementById("modal-screenshot-img").src = src;
  document.getElementById("screenshot-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("screenshot-modal").classList.add("hidden");
}

