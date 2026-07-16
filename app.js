(() => {
  "use strict";

  const APP_VERSION = "20260716-econ-computation-v1";
  const EXAM_CATALOG_URL = `./data/exams.json?v=${APP_VERSION}`;
  const LEGACY_STORAGE_KEY = "exam-sprint-state-v1";
  const STATE_KEY_PREFIX = "exam-sprint-state";
  const SETTINGS_STORAGE_KEY = "exam-sprint-settings-v1";
  const LESSON_SIZE = 10;
  const TYPE_LABELS = {
    calculation: "Calculation",
    concept: "Recall",
    formula: "Formula",
    fill_blank: "Fill blank",
    identify_mistake: "Find mistake",
    choice: "Multiple choice",
    cloze: "Fill blank",
    multiple_choice: "Multiple choice",
    order: "Order",
    sentence: "Exam sentence",
    short_answer: "Short answer",
    true_false: "True / false"
  };

  const app = {
    exams: [],
    activeExam: null,
    data: null,
    cards: [],
    theme: loadTheme(),
    state: defaultState(),
    session: emptySession(),
    toastTimer: 0,
    els: {}
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    applyTheme();
    renderApp();

    try {
      app.exams = await loadExamCatalog();
      migrateLegacyState();
      await hydrateFromSavedExam();
      await registerServiceWorker();
    } catch (error) {
      renderLoadError(error);
    }
  }

  function bindElements() {
    app.els.courseLabel = document.querySelector("#courseLabel");
    app.els.coveredValue = document.querySelector("#coveredValue");
    app.els.answeredValue = document.querySelector("#answeredValue");
    app.els.reviewValue = document.querySelector("#reviewValue");
    app.els.userArea = document.querySelector("#userArea");
    app.els.lessonPanel = document.querySelector("#lessonPanel");
    app.els.toast = document.querySelector("#toast");
  }

  function bindEvents() {
    document.body.addEventListener("click", handleClick);
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    if (action === "new-lesson") {
      startLesson();
      renderAll();
      return;
    }

    if (action === "toggle-theme") {
      toggleTheme();
      return;
    }

    if (action === "switch-exam") {
      app.data = null;
      app.cards = [];
      app.activeExam = null;
      app.session = emptySession();
      saveSettings({ activeExamId: "" });
      renderApp();
      return;
    }

    if (action === "select-exam") {
      selectExam(target.dataset.examId || "");
      return;
    }

    if (action === "review-mistakes") {
      startLesson({ mistakesOnly: true });
      renderAll();
      return;
    }

    if (action === "choice") {
      submitChoice(target.dataset.choice || "");
      return;
    }

    if (action === "next") {
      advanceCard();
      return;
    }
  }

  async function loadExamCatalog() {
    if (window.EXAM_SPRINT_EXAMS) {
      return window.EXAM_SPRINT_EXAMS;
    }

    const response = await fetch(EXAM_CATALOG_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Could not load exam catalog: ${response.status}`);
    }

    const catalog = await response.json();
    return Array.isArray(catalog.exams) ? catalog.exams : [];
  }

  async function hydrateFromSavedExam() {
    const settings = loadSettings();
    const readyExams = app.exams.filter((exam) => exam.status === "ready");
    const initialExamId = settings.activeExamId || readyExams[0]?.id || "";

    if (initialExamId) {
      await selectExam(initialExamId, { quiet: true });
      return;
    }

    renderApp();
  }

  async function selectExam(examId, options = {}) {
    const exam = app.exams.find((item) => item.id === examId);
    if (!exam) {
      renderApp();
      if (!options.quiet) showToast("That exam is not available yet.");
      return;
    }

    app.activeExam = exam;
    saveSettings({ activeExamId: exam.id });
    app.state = loadState(exam.id);
    app.session = emptySession();

    try {
      app.data = await loadQuizData(exam);
      app.cards = normalizeCards(app.data);
      startLesson();
      renderAll();
    } catch (error) {
      renderLoadError(error);
    }
  }

  async function loadQuizData(exam) {
    if (window.EXAM_SPRINT_DATA_BY_URL && window.EXAM_SPRINT_DATA_BY_URL[exam.dataUrl]) {
      return window.EXAM_SPRINT_DATA_BY_URL[exam.dataUrl];
    }

    if (window.EXAM_SPRINT_DATA) {
      return window.EXAM_SPRINT_DATA;
    }

    const response = await fetch(`${exam.dataUrl}?v=${APP_VERSION}`, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Could not load quiz data: ${response.status}`);
    }
    return response.json();
  }

  function normalizeCards(data) {
    const formulaCards = (data.formula_cards || []).map((card) => ({
      id: card.id,
      type: "formula",
      deck: card.deck || "formulas",
      priority: card.priority || 2,
      prompt: card.front || "Formula",
      answer: card.back || "",
      answerGroup: "formula-answer",
      latex: card.latex || "",
      explanation: card.explanation || "",
      tags: card.tags || []
    }));

    const conceptCards = (data.concept_cards || []).map((card) => ({
      id: card.id,
      type: "concept",
      deck: card.deck || "concepts",
      priority: card.priority || 2,
      prompt: card.front || "Concept",
      answer: card.back || "",
      answerGroup: "concept-definition",
      explanation: card.explanation || "",
      tags: card.tags || []
    }));

    const choiceCards = (data.multiple_choice_cards || []).map((card) => ({
      id: card.id,
      type: "choice",
      deck: card.deck || "multiple_choice",
      priority: card.priority || 2,
      prompt: card.question || "Question",
      answer: card.answer || "",
      answerGroup: `choice-${card.deck || "multiple_choice"}`,
      choices: card.choices || [],
      explanation: card.explanation || "",
      tags: card.tags || []
    }));

    const clozeCards = (data.cloze_cards || []).map((card) => {
      const prompt = (card.text || "").replace(/\{\{c\d+::(.*?)\}\}/g, "____");
      const fullText = (card.text || "").replace(/\{\{c\d+::(.*?)\}\}/g, "$1");
      return {
        id: card.id,
        type: "cloze",
        deck: card.deck || "cloze",
        priority: card.priority || 2,
        prompt,
        answer: card.answer || "",
        answerGroup: "cloze-answer",
        fullText,
        explanation: fullText,
        tags: card.tags || []
      };
    });

    const generatedFormulaNameCards = (data.formula_cards || []).map((card) => ({
      id: `${card.id}_name`,
      type: "formula",
      deck: card.deck || "formulas",
      priority: card.priority || 2,
      prompt: "What does this formula represent?",
      promptLatex: card.latex || card.back || "",
      answer: card.front || "",
      answerGroup: "formula-name",
      explanation: card.explanation || "",
      tags: [...(card.tags || []), "generated"]
    }));

    const generatedFormulaExplanationCards = (data.formula_cards || [])
      .filter((card) => card.explanation)
      .map((card) => ({
        id: `${card.id}_why`,
        type: "formula",
        deck: card.deck || "formulas",
        priority: card.priority || 2,
        prompt: `Which explanation matches ${card.front || "this formula"}?`,
        promptLatex: card.latex || card.back || "",
        answer: card.explanation || "",
        answerGroup: "formula-explanation",
        explanation: card.back || "",
        tags: [...(card.tags || []), "generated"]
      }));

    const generatedConceptTermCards = (data.concept_cards || []).map((card) => ({
      id: `${card.id}_term`,
      type: "concept",
      deck: card.deck || "concepts",
      priority: card.priority || 2,
      prompt: `Which concept is described here? ${card.back || ""}`,
      answer: conceptTermFromPrompt(card.front || ""),
      answerGroup: "concept-term",
      explanation: card.front || "",
      tags: [...(card.tags || []), "generated"]
    }));

    const generatedConceptTopicCards = (data.concept_cards || [])
      .filter((card) => card.tags && card.tags.length)
      .map((card) => ({
        id: `${card.id}_topic`,
        type: "concept",
        deck: card.deck || "concepts",
        priority: Math.max(2, card.priority || 2),
        prompt: `Which topic does this fact belong to? ${card.back || ""}`,
        answer: formatTagLabel(card.tags[0]),
        answerGroup: "topic-label",
        explanation: card.front || "",
        tags: [...(card.tags || []), "generated"]
      }));

    const generatedSentenceCards = (data.exam_sentences || [])
      .map((sentence, index) => createSentenceQuestion(sentence, index))
      .filter(Boolean);

    const flatQuestionCards = (data.questions || []).map((question) => ({
      id: question.id,
      type: question.type || "short_answer",
      deck: question.deck || "questions",
      priority: question.priority || 2,
      difficulty: question.difficulty || "",
      prompt: question.prompt || "Question",
      answer: formatQuestionAnswer(question.answer),
      answerGroup: `question-${question.type || "short_answer"}`,
      choices: (question.choices || question.options || []).map(formatQuestionAnswer),
      explanation: question.explanation || "",
      tags: question.tags || []
    }));

    return [
      ...flatQuestionCards,
      ...formulaCards,
      ...conceptCards,
      ...choiceCards,
      ...clozeCards,
      ...generatedFormulaNameCards,
      ...generatedFormulaExplanationCards,
      ...generatedConceptTermCards,
      ...generatedConceptTopicCards,
      ...generatedSentenceCards
    ].filter(
      (card) => card.id && card.prompt && card.answer
    );
  }

  function conceptTermFromPrompt(prompt) {
    return String(prompt || "")
      .replace(/[?.]$/g, "")
      .replace(/^define\s+/i, "")
      .replace(/^what\s+(is|are|does|do)\s+/i, "")
      .replace(/^explain\s+/i, "")
      .replace(/^describe\s+/i, "")
      .replace(/^name\s+/i, "")
      .replace(/^list\s+/i, "")
      .replace(/^give\s+an?\s+example\s+of\s+/i, "")
      .replace(/^why\s+is\s+/i, "")
      .replace(/\s+/g, " ")
      .trim() || String(prompt || "Concept").trim();
  }

  function formatQuestionAnswer(answer) {
    return Array.isArray(answer) ? answer.join(" -> ") : String(answer || "");
  }

  function formatTagLabel(tag) {
    return String(tag || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function createSentenceQuestion(sentence, index) {
    const phrase = findBlankPhrase(sentence);
    if (!phrase) return null;

    return {
      id: `S${String(index + 1).padStart(3, "0")}`,
      type: "sentence",
      deck: "exam_sentences",
      priority: 1,
      prompt: `Complete the exam sentence: ${blankPhrase(sentence, phrase)}`,
      answer: phrase,
      answerGroup: "exam-sentence-term",
      explanation: sentence,
      tags: ["exam_sentence", "generated"]
    };
  }

  function findBlankPhrase(sentence) {
    const keyPhrases = [
      "Graph Fourier transform",
      "Fourier transform",
      "Cloud computing",
      "Data analytics",
      "Broadcast storm",
      "smart environment",
      "local processing",
      "CSMA/CA",
      "LoRaWAN",
      "VANETs",
      "WebSockets",
      "Quantization",
      "Aliasing",
      "actuators",
      "sensors",
      "MQTT",
      "XMPP",
      "DCT",
      "JPEG",
      "LPWAN",
      "V2V",
      "V2I",
      "IaaS",
      "PaaS",
      "SaaS"
    ];

    const lower = sentence.toLowerCase();
    const match = keyPhrases.find((phrase) => lower.includes(phrase.toLowerCase()));
    if (match) {
      return sentence.match(new RegExp(escapeRegExp(match), "i"))?.[0] || match;
    }

    const words = sentence.match(/\b[A-Z][A-Za-z0-9/+-]{2,}\b/g);
    return words && words.length ? words[0] : null;
  }

  function blankPhrase(sentence, phrase) {
    return sentence.replace(new RegExp(escapeRegExp(phrase), "i"), "____");
  }

  function startLesson(options = {}) {
    const queue = buildLessonQueue(options);
    app.session = {
      queue,
      index: 0,
      results: [],
      mistakes: [],
      repeats: {},
      completed: queue.length === 0,
      startedAt: Date.now(),
      interaction: freshInteraction()
    };

    if (app.session.completed) {
      showToast("No questions are available yet.");
    }
  }

  function buildLessonQueue(options = {}) {
    let source = app.cards;

    if (options.mistakesOnly) {
      const mistakeIds = new Set(app.state.lastMistakes || []);
      source = source.filter((card) => mistakeIds.has(card.id));
    }

    if (!source.length) {
      source = app.cards;
    }

    const selected = [];
    const selectedIds = new Set();
    const lessonLength = Math.min(LESSON_SIZE, source.length);

    while (selected.length < lessonLength) {
      const card = pickWeightedCard(source, null, selectedIds);
      if (!card) break;
      selected.push(card.id);
      selectedIds.add(card.id);
    }

    return shuffle(selected);
  }

  function pickWeightedCard(source, targetType, excludedIds) {
    let pool = source.filter((card) => !excludedIds.has(card.id));
    if (targetType) {
      const typePool = pool.filter((card) => card.type === targetType);
      if (typePool.length) pool = typePool;
    }

    if (!pool.length) return null;

    const now = Date.now();
    const weighted = pool.map((card) => {
      const progress = getCardProgress(card.id);
      const priorityWeight = card.priority === 1 ? 2.15 : 1.2;
      const formulaWeight = card.type === "formula" || card.type === "cloze" ? 2.35 : 1;
      const unseenWeight = progress.seen ? 1 : 1.85;
      const dueWeight = !progress.due || progress.due <= now ? 1.65 : 0.3;
      const weakCardWeight = progress.mastery < 0 ? 2.4 : 1 + Math.min(progress.wrong, 4) * 0.34;
      const recentPenalty = progress.last && now - progress.last < 3 * 60 * 1000 ? 0.45 : 1;
      const score = priorityWeight * formulaWeight * unseenWeight * dueWeight * weakCardWeight * recentPenalty;
      return { card, score: Math.max(0.05, score) };
    });

    const total = weighted.reduce((sum, item) => sum + item.score, 0);
    let cursor = Math.random() * total;
    for (const item of weighted) {
      cursor -= item.score;
      if (cursor <= 0) return item.card;
    }
    return weighted[weighted.length - 1].card;
  }

  function renderAll() {
    renderAppFrame();
    renderShell();
    renderLesson();
    typesetMath(document.querySelector("main"));
  }

  function renderApp() {
    renderAppFrame();

    if (!app.activeExam) {
      app.els.lessonPanel.innerHTML = renderExamPicker();
      return;
    }

    renderShell();
    renderLesson();
  }

  function renderAppFrame() {
    const nextTheme = app.theme === "dark" ? "Light" : "Dark";
    app.els.userArea.innerHTML = `
      <button type="button" class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${nextTheme.toLowerCase()} mode">
        ${nextTheme} mode
      </button>
    `;

    if (!app.activeExam) {
      app.els.courseLabel.textContent = "Choose exam";
      renderEmptyStats();
    }
  }

  function renderShell() {
    const stats = getStudyStats();
    app.els.coveredValue.textContent = `${stats.covered}/${stats.total}`;
    app.els.answeredValue.textContent = String(stats.answered);
    app.els.reviewValue.textContent = String(stats.review);

    const label = app.activeExam?.title || app.data?.metadata?.title || "Exam Sprint";
    app.els.courseLabel.textContent = label.replace(" Exam Quiz Data", "");
  }

  function renderEmptyStats() {
    app.els.coveredValue.textContent = "0/0";
    app.els.answeredValue.textContent = "0";
    app.els.reviewValue.textContent = "0";
  }

  function renderLesson() {
    if (!app.activeExam) {
      app.els.lessonPanel.innerHTML = renderExamPicker();
      return;
    }

    if (!app.cards.length) {
      app.els.lessonPanel.innerHTML = `
        <div class="empty-state">
          This exam does not have question data yet. Add a JSON file for it in the data folder.
        </div>
      `;
      return;
    }

    if (app.session.completed) {
      app.els.lessonPanel.innerHTML = renderSummary();
      return;
    }

    const card = getCurrentCard();
    if (!card) {
      app.session.completed = true;
      app.els.lessonPanel.innerHTML = renderSummary();
      return;
    }

    const progressPercent = ((app.session.index) / Math.max(1, app.session.queue.length)) * 100;
    const progress = getCardProgress(card.id);
    app.els.lessonPanel.innerHTML = `
      <article class="lesson-card">
        <div class="lesson-head">
          <div class="lesson-progress">
            <div class="lesson-track"><span style="width: ${progressPercent}%"></span></div>
            <span>${app.session.index + 1} / ${app.session.queue.length}</span>
          </div>
          <div class="lesson-meta">
            <span class="pill">${TYPE_LABELS[card.type] || formatTagLabel(card.type || "question")}</span>
            <span class="pill priority">Priority ${card.priority}</span>
            ${progress.mastery < 0 ? `<span class="pill weak">Needs review</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          ${renderPrompt(card)}
          ${renderKindBody(card)}
        </div>
      </article>
    `;
  }

  function renderExamPicker() {
    const cards = app.exams
      .map((exam) => {
        const badge = exam.status === "ready" ? "Ready" : "Needs data";
        const disabled = exam.status === "ready" ? "" : " disabled";
        const action = exam.status === "ready" ? `data-action="select-exam" data-exam-id="${escapeAttr(exam.id)}"` : "";

        return `
          <button type="button" class="exam-option"${disabled} ${action}>
            <span>
              <strong>${escapeHtml(exam.title)}</strong>
              <small>${escapeHtml(exam.description || "Exam practice")}</small>
            </span>
            <em>${escapeHtml(badge)}</em>
          </button>
        `;
      })
      .join("");

    return `
      <section class="summary-card exam-picker">
        <h2>Choose your exam</h2>
        <div class="exam-list">
          ${cards || `<div class="empty-state">No exams are configured yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderPrompt(card) {
    if (card.promptLatex) {
      return `
        <div class="prompt prompt-with-math">
          <span>${escapeHtml(card.prompt)}</span>
          <div class="math-block">${renderLatex(card.promptLatex, true)}</div>
        </div>
      `;
    }

    return `<p class="prompt">${escapeHtml(card.prompt)}</p>`;
  }

  function renderKindBody(card) {
    if (app.session.interaction.submitted) {
      return renderSubmittedFeedback(card);
    }

    return renderChoiceBody(card);
  }

  function renderChoiceBody(card) {
    const choices = buildChoices(card);
    return `
      <div class="choice-grid">
        ${choices
          .map(
            (choice) => `
              <button type="button" class="choice-btn" data-action="choice" data-choice="${escapeAttr(choice)}">
                ${renderAnswerContent(choice)}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderSubmittedFeedback(card) {
    const result = app.session.interaction.result;
    const label = result === "correct" ? "Correct" : "Review soon";
    const panelClass = result === "correct" ? "correct" : result === "wrong" ? "wrong" : "";
    const selected = app.session.interaction.selected;
    const selectedLine =
      selected && result === "wrong"
        ? `<p class="answer-explanation">Your choice: ${renderAnswerContent(selected)}</p>`
        : "";

    return `
      <div class="answer-panel ${panelClass}">
        <p class="answer-main">${label}.</p>
        ${selectedLine}
        ${renderAnswer(card)}
        <button type="button" class="primary-btn" data-action="next">
          ${app.session.index + 1 >= app.session.queue.length ? "Finish lesson" : "Continue"}
        </button>
      </div>
    `;
  }

  function renderAnswer(card) {
    const answer = card.fullText || card.answer;
    const formula = card.latex || (card.type === "formula" && isStandaloneFormulaText(answer) ? answer : "");
    const formulaBlock = formula ? `<div class="math-block">${renderLatex(formula, true)}</div>` : "";
    const answerText =
      !formula || normalizeForCompare(formula) !== normalizeForCompare(answer)
        ? `<p class="answer-main">${renderAnswerContent(answer)}</p>`
        : "";
    const explanation =
      card.explanation && card.explanation !== answer
        ? `<p class="answer-explanation">${escapeHtml(card.explanation)}</p>`
        : "";

    return `
      ${formulaBlock}
      ${answerText}
      ${explanation}
    `;
  }

  function renderAnswerContent(value) {
    const text = String(value || "");
    const source = findCardByAnswer(text);

    if (source && source.latex && source.type === "formula") {
      const formula = `<span class="math-inline">${renderLatex(source.latex)}</span>`;
      if (normalizeForCompare(source.latex) !== normalizeForCompare(text)) {
        return `<span class="choice-content">${formula}<span>${escapeHtml(text)}</span></span>`;
      }
      return formula;
    }

    if (isStandaloneFormulaText(text)) {
      return `<span class="math-inline">${renderLatex(text)}</span>`;
    }

    return escapeHtml(text);
  }

  function findCardByAnswer(answer) {
    const normalized = normalizeForCompare(answer);
    return app.cards.find((card) => normalizeForCompare(card.answer) === normalized) || null;
  }

  function isStandaloneFormulaText(value) {
    const text = String(value || "").trim();
    if (!text || !hasFormulaSyntax(text)) return false;

    const words = text.match(/[A-Za-z]{2,}/g) || [];
    const proseWords = words.filter((word) => !isFormulaWord(word));
    const endsLikeSentence = /[.!?]$/.test(text);

    return proseWords.length < 3 && !(endsLikeSentence && proseWords.length > 1);
  }

  function hasFormulaSyntax(text) {
    return /\\|[_^=<>≥≤≈∑Σ∫λΔσπ√∈]|\b(f_s|T_s|MSE|D_|A_|L=|BW|SF)\b/.test(text);
  }

  function isFormulaWord(word) {
    return [
      "ber",
      "bw",
      "cos",
      "ct",
      "dct",
      "dt",
      "fft",
      "frac",
      "int",
      "left",
      "ln",
      "log",
      "mse",
      "operatorname",
      "right",
      "sf",
      "sin",
      "sinc",
      "snr",
      "sqrt",
      "sum",
      "tan"
    ].includes(String(word || "").toLowerCase());
  }

  function renderLatex(value, display = false) {
    const source = normalizeLatexSource(value);
    const opener = display ? "\\[" : "\\(";
    const closer = display ? "\\]" : "\\)";
    return `${opener}${escapeHtml(source)}${closer}`;
  }

  function normalizeLatexSource(value) {
    return String(value || "")
      .replace(/≥/g, "\\ge ")
      .replace(/≤/g, "\\le ")
      .replace(/≈/g, "\\approx ")
      .replace(/∑/g, "\\sum ")
      .replace(/Σ/g, "\\sum ")
      .replace(/∫/g, "\\int ")
      .replace(/λ/g, "\\lambda ")
      .replace(/Δ/g, "\\Delta ")
      .replace(/σ/g, "\\sigma ")
      .replace(/π/g, "\\pi ")
      .replace(/√/g, "\\sqrt{}")
      .replace(/∈/g, "\\in ")
      .replace(/−/g, "-")
      .trim();
  }

  function typesetMath(root) {
    if (!root || !window.MathJax) return;

    const run = () => {
      window.MathJax.typesetClear?.([root]);
      window.MathJax.typesetPromise?.([root])?.catch(() => {});
    };

    if (window.MathJax.startup?.promise) {
      window.MathJax.startup.promise.then(run).catch(() => {});
    } else {
      run();
    }
  }

  function renderSummary() {
    const results = app.session.results;
    const total = Math.max(1, results.length);
    const correct = results.filter((item) => item.result === "correct").length;
    const review = results.filter((item) => item.result === "wrong").length;
    const accuracy = Math.round((correct / total) * 100);
    const mistakeButton =
      app.state.lastMistakes && app.state.lastMistakes.length
        ? `<button type="button" class="secondary-btn" data-action="review-mistakes">Review mistakes</button>`
        : "";

    return `
      <section class="summary-card">
        <h2>Lesson complete</h2>
        <div class="summary-grid">
          <div class="summary-tile"><span>Accuracy</span><strong>${accuracy}%</strong></div>
          <div class="summary-tile"><span>Correct</span><strong>${correct}</strong></div>
          <div class="summary-tile"><span>Review</span><strong>${review}</strong></div>
        </div>
        <div class="button-row">
          <button type="button" class="primary-btn" data-action="new-lesson">Next lesson</button>
          ${mistakeButton}
          <button type="button" class="plain-btn" data-action="switch-exam">Switch exam</button>
        </div>
      </section>
    `;
  }

  function submitChoice(choice) {
    const card = getCurrentCard();
    if (!card || app.session.interaction.submitted) return;

    const correct = normalizeForCompare(choice) === normalizeForCompare(card.answer);
    submitResult(correct ? "correct" : "wrong", { selected: choice });
  }

  function submitResult(result, detail) {
    const card = getCurrentCard();
    if (!card || app.session.interaction.submitted) return;

    updateCardProgress(card, result);
    maybeInsertRepeat(card, result);

    app.session.interaction = {
      ...app.session.interaction,
      ...detail,
      submitted: true,
      result
    };

    app.session.results.push({
      id: card.id,
      result,
      at: Date.now()
    });

    if (result === "wrong") {
      app.session.mistakes.push(card.id);
      app.state.lastMistakes = uniqueRecent([card.id, ...(app.state.lastMistakes || [])], 30);
      softBuzz(50);
    } else {
      softBuzz(18);
    }

    saveState();
    renderAll();
  }

  function advanceCard() {
    if (!app.session.interaction.submitted) return;

    app.session.index += 1;
    app.session.interaction = freshInteraction();

    if (app.session.index >= app.session.queue.length) {
      completeLesson();
    }

    saveState();
    renderAll();
  }

  function completeLesson() {
    app.session.completed = true;

    if (!app.session.mistakes.length) {
      showToast("Clean lesson.");
    } else {
      showToast("Mistakes are queued for review.");
    }
  }

  function updateCardProgress(card, result) {
    const progress = getCardProgress(card.id);
    const now = Date.now();

    progress.seen += 1;
    progress.last = now;

    if (result === "correct") {
      progress.correct += 1;
      progress.mastery = clamp(progress.mastery + 1, -5, 8);
      progress.due = now + (30 + Math.random() * 30) * 60 * 1000;
    } else if (result === "unsure") {
      progress.unsure += 1;
      progress.mastery = clamp(progress.mastery + 0.25, -5, 8);
      progress.due = now + 10 * 60 * 1000;
    } else {
      progress.wrong += 1;
      progress.mastery = clamp(progress.mastery - 1.5, -5, 8);
      progress.due = now + 2 * 60 * 1000;
    }

    app.state.cards[card.id] = progress;
  }

  function maybeInsertRepeat(card, result) {
    if (result !== "wrong") return;
    const missCount = (app.session.repeats[card.id] || 0) + 1;
    app.session.repeats[card.id] = missCount;

    const spacing = 2 ** missCount;
    const insertAt = app.session.index + spacing + 1;
    fillQueueToLength(insertAt, card.id);
    app.session.queue.splice(Math.min(insertAt, app.session.queue.length), 0, card.id);
  }

  function fillQueueToLength(targetLength, currentCardId) {
    let guard = 0;

    while (app.session.queue.length < targetLength && guard < app.cards.length + targetLength) {
      guard += 1;

      const excludedIds = new Set(app.session.queue.slice(app.session.index + 1));
      excludedIds.add(currentCardId);

      const filler =
        pickWeightedCard(app.cards, null, excludedIds) ||
        pickWeightedCard(
          app.cards.filter((candidate) => candidate.id !== currentCardId),
          null,
          new Set()
        );

      if (!filler) return;
      app.session.queue.push(filler.id);
    }
  }

  function getCurrentCard() {
    return app.cards.find((card) => card.id === app.session.queue[app.session.index]) || null;
  }

  function buildChoices(card) {
    const baseChoices = card.choices && card.choices.length ? [...card.choices] : [];
    if (baseChoices.length >= 2) {
      return shuffle(uniqueRecent(baseChoices, 5));
    }

    const answerGroup = card.answerGroup || card.type;
    const distractors = app.cards
      .filter((candidate) => candidate.id !== card.id && (candidate.answerGroup || candidate.type) === answerGroup)
      .map((candidate) => candidate.answer)
      .filter(Boolean);

    const choices = uniqueRecent([card.answer, ...shuffle(distractors)], 4);
    return shuffle(choices);
  }

  function getCardProgress(id) {
    const existing = app.state.cards[id];
    if (existing) return existing;
    return {
      seen: 0,
      correct: 0,
      wrong: 0,
      unsure: 0,
      mastery: 0,
      due: 0,
      last: 0
    };
  }

  function getStudyStats() {
    const covered = app.cards.filter((card) => getCardProgress(card.id).seen > 0).length;
    const answered = app.cards.reduce((sum, card) => sum + getCardProgress(card.id).seen, 0);
    const review = app.cards.filter((card) => {
      const progress = getCardProgress(card.id);
      return progress.wrong > 0 || progress.mastery < 0;
    }).length;

    return {
      total: app.cards.length,
      covered,
      answered,
      review
    };
  }

  function loadState(examId) {
    const defaults = defaultState();
    try {
      const raw = localStorage.getItem(stateStorageKey(examId));
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
        cards: parsed.cards || {},
        lastMistakes: parsed.lastMistakes || []
      };
    } catch (error) {
      return defaults;
    }
  }

  function migrateLegacyState() {
    const firstExamId = app.exams[0]?.id;
    if (!firstExamId) return;

    try {
      const targetKey = stateStorageKey(firstExamId);
      if (localStorage.getItem(targetKey)) return;
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacy) return;
      localStorage.setItem(targetKey, legacy);
    } catch (error) {
      // Migration is best-effort; the app can still create fresh progress.
    }
  }

  function stateStorageKey(examId) {
    return `${STATE_KEY_PREFIX}-${examId || "default"}-v1`;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function saveSettings(nextSettings) {
    try {
      const settings = {
        ...loadSettings(),
        ...nextSettings
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      showToast("Settings could not be saved on this browser.");
    }
  }

  function loadTheme() {
    const stored = loadSettings().theme;
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function toggleTheme() {
    app.theme = app.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveSettings({ theme: app.theme });
    renderAppFrame();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = app.theme;
  }

  function defaultState() {
    return {
      activeDate: "",
      cards: {},
      lastMistakes: []
    };
  }

  function saveState() {
    try {
      localStorage.setItem(stateStorageKey(app.activeExam?.id), JSON.stringify(app.state));
    } catch (error) {
      showToast("Progress could not be saved on this browser.");
    }
  }

  function freshInteraction() {
    return {
      submitted: false,
      checked: false,
      typeMatch: false,
      result: ""
    };
  }

  function emptySession() {
    return {
      queue: [],
      index: 0,
      results: [],
      mistakes: [],
      repeats: {},
      completed: false,
      startedAt: 0,
      interaction: freshInteraction()
    };
  }

  function showToast(message) {
    clearTimeout(app.toastTimer);
    app.els.toast.textContent = message;
    app.els.toast.classList.add("is-visible");
    app.toastTimer = window.setTimeout(() => {
      app.els.toast.classList.remove("is-visible");
    }, 1800);
  }

  function renderLoadError(error) {
    app.els.lessonPanel.innerHTML = `
      <div class="empty-state">
        Could not start the quiz app. ${escapeHtml(error.message)}
        Run it through a local web server so the JSON file can load.
      </div>
    `;
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      // The app still works without offline caching, especially over local HTTP.
    }
  }

  function normalizeForCompare(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u2265/g, ">=")
      .replace(/\u2264/g, "<=")
      .replace(/\u2212/g, "-")
      .replace(/\u00d7/g, "x")
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
      .replace(/[^a-z0-9+\-*/=<>]/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function uniqueRecent(items, limit) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
      const key = String(item);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
      if (output.length >= limit) break;
    }
    return output;
  }

  function softBuzz(duration) {
    if ("vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  }
})();
