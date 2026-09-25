(() => {
  "use strict";

  const STORAGE_KEY = "curupira_ctf_progress_v1";
  const THEME_KEY = "curupira_ctf_theme";

  /** @type {{answers: Record<string, {value:string, status:string, ts:number}>}} */
  let progress = loadProgress();

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupted state */ }
    return { answers: {} };
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) { /* storage unavailable */ }
    refreshExportBox();
  }

  function normalize(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function isSolved(id) {
    return progress.answers[id]?.status === "correct";
  }

  function questionsByCategory(cat) {
    return QUESTIONS.filter(q => q.category === cat);
  }

  function categoryStats(cat) {
    const qs = questionsByCategory(cat);
    const solved = qs.filter(q => isSolved(q.id)).length;
    return { total: qs.length, solved };
  }

  function globalStats() {
    const total = QUESTIONS.length;
    const solved = QUESTIONS.filter(q => isSolved(q.id)).length;
    const points = QUESTIONS.filter(q => isSolved(q.id)).reduce((a, q) => a + (q.points || 0), 0);
    const totalPoints = QUESTIONS.reduce((a, q) => a + (q.points || 0), 0);
    return { total, solved, points, totalPoints };
  }

  // ---------- Screens ----------
  const screens = {
    home: document.getElementById("screen-home"),
    dashboard: document.getElementById("screen-dashboard"),
    questions: document.getElementById("screen-questions"),
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.hidden = true);
    screens[name].hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------- Top bar ----------
  function updateTopbar() {
    const { solved, total, points, totalPoints } = globalStats();
    document.getElementById("score-pill").textContent = `${points} / ${totalPoints} pts · ${solved}/${total}`;
  }

  function updateHomeStats() {
    const { solved, points } = globalStats();
    document.getElementById("stat-solved").textContent = solved;
    document.getElementById("stat-points").textContent = points;
  }

  // ---------- Dashboard ----------
  function renderDashboard(filter = "") {
    const grid = document.getElementById("cat-grid");
    grid.innerHTML = "";
    const f = normalize(filter);
    CATEGORIES.filter(c => normalize(c.name).includes(f)).forEach(c => {
      const { total, solved } = categoryStats(c.name);
      const pct = total ? Math.round((solved / total) * 100) : 0;
      const card = document.createElement("div");
      card.className = "cat-card" + (solved === total && total > 0 ? " done" : "");
      card.innerHTML = `
        <div class="cat-card-top">
          <div class="cat-name">${escapeHtml(c.name)}</div>
          <div class="cat-check">✔</div>
        </div>
        <div class="cat-progress-text">${solved} / ${total} resolvidos</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
      `;
      card.addEventListener("click", () => openCategory(c.name));
      grid.appendChild(card);
    });

    const g = globalStats();
    const gpct = g.total ? Math.round((g.solved / g.total) * 100) : 0;
    document.getElementById("global-bar").style.width = gpct + "%";
  }

  function openCategory(name) {
    showScreen("questions");
    document.getElementById("qs-title").textContent = name;
    renderQuestions(name);
  }

  // ---------- Questions ----------
  function renderQuestions(cat) {
    const list = document.getElementById("q-list");
    list.innerHTML = "";
    const qs = questionsByCategory(cat);

    qs.forEach(q => {
      const solved = isSolved(q.id);
      const saved = progress.answers[q.id];
      const card = document.createElement("div");
      card.className = "q-card" + (solved ? " solved" : "");
      card.dataset.qid = q.id;

      const links = [];
      if (q.target_url) {
        links.push(`<a class="q-link" href="${escapeAttr(q.target_url)}" target="_blank" rel="noopener">⬇ Download original</a>`);
      }
      if (q.drive_url) {
        links.push(`<a class="q-link drive" href="${escapeAttr(q.drive_url)}" target="_blank" rel="noopener">⬇ Download (Google Drive)</a>`);
      }

      const hasAnswer = !!q.answer;
      const disclaimer = hasAnswer
        ? ""
        : `<div class="q-disclaimer">⚠ Gabarito ainda não definido para este desafio. A resposta enviada fica marcada como "pendente" até o gabarito ser adicionado e revalidado.</div>`;

      card.innerHTML = `
        <div class="q-card-top">
          <div>
            <p class="q-title">#${q.id} · ${escapeHtml(q.title)}</p>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="q-points">${q.points} pts</span>
            <span class="q-check">✔</span>
          </div>
        </div>
        <p class="q-desc">${escapeHtml(q.description)}</p>
        ${links.length ? `<div class="q-links">${links.join("")}</div>` : ""}
        ${disclaimer}
        <div class="q-answer-row">
          <input type="text" class="q-input" placeholder="Digite sua resposta..." value="${escapeAttr(saved?.value || "")}" ${solved ? "disabled" : ""}>
          <button class="q-submit">${solved ? "Resolvido" : "Enviar"}</button>
        </div>
        <div class="q-feedback"></div>
      `;

      const input = card.querySelector(".q-input");
      const btn = card.querySelector(".q-submit");
      const feedback = card.querySelector(".q-feedback");

      if (saved && saved.status !== "correct") {
        feedback.textContent = saved.status === "pending"
          ? "Resposta salva. Aguardando gabarito para validação."
          : "Resposta anterior incorreta. Tente novamente.";
        feedback.className = "q-feedback " + (saved.status === "pending" ? "pending" : "err");
      }
      if (solved) {
        feedback.textContent = "✔ Resposta correta!";
        feedback.className = "q-feedback ok";
      }

      btn.addEventListener("click", () => submitAnswer(q, input, feedback, card, btn));
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") submitAnswer(q, input, feedback, card, btn);
      });

      list.appendChild(card);
    });

    document.getElementById("cat-bar").style.width =
      (qs.length ? Math.round((qs.filter(q => isSolved(q.id)).length / qs.length) * 100) : 0) + "%";
  }

  function submitAnswer(q, input, feedback, card, btn) {
    const val = input.value.trim();
    if (!val) return;

    let status;
    if (!q.answer) {
      status = "pending";
      feedback.textContent = "Resposta salva. Sem gabarito cadastrado ainda — será validada quando o gabarito for adicionado.";
      feedback.className = "q-feedback pending";
    } else if (normalize(val) === normalize(q.answer)) {
      status = "correct";
      feedback.textContent = "✔ Resposta correta!";
      feedback.className = "q-feedback ok";
      card.classList.add("solved");
      input.disabled = true;
      btn.textContent = "Resolvido";
      toast(`+${q.points} pts — ${q.title}`);
    } else {
      status = "wrong";
      feedback.textContent = "✘ Resposta incorreta. Tente novamente.";
      feedback.className = "q-feedback err";
    }

    progress.answers[q.id] = { value: val, status, ts: Date.now() };
    saveProgress();
    updateTopbar();
    updateHomeStats();
    renderDashboard(document.getElementById("cat-search").value);
    const bar = document.getElementById("cat-bar");
    if (bar) {
      const qs = questionsByCategory(q.category);
      bar.style.width = Math.round((qs.filter(x => isSolved(x.id)).length / qs.length) * 100) + "%";
    }
  }

  /**
   * Revalida todas as respostas "pending"/"wrong" contra o gabarito atual em QUESTIONS.
   * Chamar depois de preencher q.answer nos dados (ex.: via console ou update do questions_data.js).
   */
  window.revalidateAllAnswers = function () {
    let changed = 0;
    QUESTIONS.forEach(q => {
      const saved = progress.answers[q.id];
      if (!saved || saved.status === "correct" || !q.answer) return;
      if (normalize(saved.value) === normalize(q.answer)) {
        saved.status = "correct";
        changed++;
      } else {
        saved.status = "wrong";
      }
    });
    saveProgress();
    updateTopbar();
    updateHomeStats();
    renderDashboard();
    toast(`Revalidação concluída: ${changed} resposta(s) confirmada(s).`);
    return changed;
  };

  // ---------- Toast ----------
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- Export / Import ----------
  function refreshExportBox() {
    const el = document.getElementById("export-text");
    if (el) el.value = JSON.stringify(progress, null, 2);
  }

  function downloadProgress() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curupira_ctf_progress_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object" || !data.answers) throw new Error("formato inválido");
        progress = data;
        saveProgress();
        updateTopbar();
        updateHomeStats();
        renderDashboard();
        toast("Progresso importado com sucesso.");
      } catch (e) {
        toast("Falha ao importar: arquivo inválido.");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
    else applyTheme("dark");
  }

  // ---------- Helpers ----------
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  // ---------- Wiring ----------
  document.getElementById("start-btn").addEventListener("click", () => {
    showScreen("dashboard");
    renderDashboard();
  });
  document.getElementById("brand-home-btn").addEventListener("click", () => showScreen("home"));
  document.getElementById("dash-home-btn").addEventListener("click", () => showScreen("home"));
  document.getElementById("questions-back-btn").addEventListener("click", () => {
    showScreen("dashboard");
    renderDashboard(document.getElementById("cat-search").value);
  });
  document.getElementById("cat-search").addEventListener("input", e => renderDashboard(e.target.value));

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  document.getElementById("export-toggle").addEventListener("click", () => {
    const box = document.getElementById("export-box");
    box.hidden = !box.hidden;
    if (!box.hidden) refreshExportBox();
  });
  document.getElementById("download-progress-btn").addEventListener("click", downloadProgress);
  document.getElementById("copy-progress-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(JSON.stringify(progress, null, 2))
      .then(() => toast("Progresso copiado para a área de transferência."))
      .catch(() => toast("Não foi possível copiar."));
  });
  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (confirm("Tem certeza que deseja resetar todo o progresso salvo?")) {
      progress = { answers: {} };
      saveProgress();
      updateTopbar();
      updateHomeStats();
      renderDashboard();
      showScreen("home");
      toast("Progresso resetado.");
    }
  });

  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importProgress(file);
  });

  // ---------- Init ----------
  initTheme();
  updateTopbar();
  updateHomeStats();
  refreshExportBox();
})();
