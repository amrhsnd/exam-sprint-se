(() => {
  "use strict";

  const DATA_URL = "./data/se_duolingo_quiz_data.json";
  const STORAGE_KEY = "exam-sprint-state-v1";
  const LESSON_SIZE = 10;
  const SMART_TYPE_SEQUENCE = [
    "formula",
    "formula",
    "concept",
    "formula",
    "choice",
    "formula",
    "cloze",
    "concept",
    "sentence",
    "concept"
  ];

  const TYPE_LABELS = {
    concept: "Recall",
    formula: "Formula",
    choice: "Multiple choice",
    cloze: "Fill blank",
    sentence: "Exam sentence"
  };

  const app = {
    data: null,
    cards: [],
    decks: [],
    state: loadState(),
    session: emptySession(),
    tab: "lesson",
    deck: "all",
    toastTimer: 0,
    els: {}
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    renderShell();

    try {
      app.data = await loadQuizData();
      app.cards = normalizeCards(app.data);
      app.decks = getDeckNames(app.cards);
      renderDeckOptions();
      startLesson();
      await registerServiceWorker();
    } catch (error) {
      renderLoadError(error);
    }
  }

  function bindElements() {
    app.els.courseLabel = document.querySelector("#courseLabel");
    app.els.coveredValue = document.querySelector("#coveredValue");
    app.els.answeredValue = document.querySelector("#answeredValue");
    app.els.weakDeckValue = document.querySelector("#weakDeckValue");
    app.els.deckSelect = document.querySelector("#deckSelect");
    app.els.lessonPanel = document.querySelector("#lessonPanel");
    app.els.decksPanel = document.querySelector("#decksPanel");
    app.els.cheatPanel = document.querySelector("#cheatPanel");
    app.els.toast = document.querySelector("#toast");
  }

  function bindEvents() {
    document.body.addEventListener("click", handleClick);

    app.els.deckSelect.addEventListener("change", () => {
      app.deck = app.els.deckSelect.value;
      startLesson();
      renderAll();
    });
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    if (action === "show-tab") {
      showTab(target.dataset.tab || "lesson");
      return;
    }

    if (action === "new-lesson") {
      startLesson();
      renderAll();
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

    if (action === "select-deck") {
      app.deck = target.dataset.deck || "all";
      app.els.deckSelect.value = app.deck;
      showTab("lesson");
      startLesson();
      renderAll();
    }
  }

  async function loadQuizData() {
    if (window.EXAM_SPRINT_DATA) {
      return window.EXAM_SPRINT_DATA;
    }

    const response = await fetch(DATA_URL, { cache: "no-cache" });
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

    return [
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

  function getDeckNames(cards) {
    return [...new Set(cards.map((card) => card.deck))].sort((a, b) => a.localeCompare(b));
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

  function renderDeckOptions() {
    const options = [
      `<option value="all">All decks</option>`,
      ...app.decks.map((deck) => `<option value="${escapeAttr(deck)}">${formatDeckName(deck)}</option>`)
    ];
    app.els.deckSelect.innerHTML = options.join("");
    app.els.deckSelect.value = app.deck;
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
      showToast("No cards match this filter yet.");
    }
  }

  function buildLessonQueue(options = {}) {
    let source = filteredCards();

    if (options.mistakesOnly) {
      const mistakeIds = new Set(app.state.lastMistakes || []);
      source = source.filter((card) => mistakeIds.has(card.id));
    }

    if (!source.length) {
      source = filteredCards();
    }

    const selected = [];
    const selectedIds = new Set();

    for (let i = 0; i < LESSON_SIZE; i += 1) {
      const targetType = SMART_TYPE_SEQUENCE[i % SMART_TYPE_SEQUENCE.length];
      const card = pickWeightedCard(source, targetType, selectedIds);
      if (!card) break;
      selected.push(card.id);
      selectedIds.add(card.id);
    }

    if (selected.length < Math.min(LESSON_SIZE, source.length)) {
      const fallbackIds = new Set(selected);
      while (selected.length < Math.min(LESSON_SIZE, source.length)) {
        const card = pickWeightedCard(source, null, fallbackIds);
        if (!card) break;
        selected.push(card.id);
        fallbackIds.add(card.id);
      }
    }

    return selected;
  }

  function filteredCards() {
    if (app.deck === "all") return app.cards;
    return app.cards.filter((card) => card.deck === app.deck);
  }

  function pickWeightedCard(source, targetType, excludedIds) {
    let pool = source.filter((card) => !excludedIds.has(card.id));
    if (targetType) {
      const typePool = pool.filter((card) => card.type === targetType);
      if (typePool.length) pool = typePool;
    }

    if (!pool.length) return null;

    const now = Date.now();
    const deckStatsByName = getDeckStatsMap();
    const weighted = pool.map((card) => {
      const progress = getCardProgress(card.id);
      const deckStats = deckStatsByName.get(card.deck);
      const priorityWeight = card.priority === 1 ? 2.15 : 1.2;
      const formulaWeight = card.type === "formula" || card.type === "cloze" ? 2.35 : 1;
      const unseenWeight = progress.seen ? 1 : 1.85;
      const dueWeight = !progress.due || progress.due <= now ? 1.65 : 0.3;
      const weakCardWeight = progress.mastery < 0 ? 2.4 : 1 + Math.min(progress.wrong, 4) * 0.34;
      const weakDeckWeight = deckStats ? 1 + deckStats.weakness * 2.2 : 1;
      const recentPenalty = progress.last && now - progress.last < 3 * 60 * 1000 ? 0.45 : 1;
      const score =
        priorityWeight * formulaWeight * unseenWeight * dueWeight * weakCardWeight * weakDeckWeight * recentPenalty;
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
    renderShell();
    renderLesson();
    renderDecks();
    renderCheatSheet();
    updateTabButtons();
  }

  function renderShell() {
    const stats = getStudyStats();
    app.els.coveredValue.textContent = `${stats.covered}/${stats.total}`;
    app.els.answeredValue.textContent = String(stats.answered);
    app.els.weakDeckValue.textContent = String(stats.weakDecks);

    if (app.data && app.data.metadata && app.data.metadata.title) {
      app.els.courseLabel.textContent = app.data.metadata.title.replace(" Exam Quiz Data", "");
    }
  }

  function renderLesson() {
    if (!app.cards.length) return;

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
            <span class="pill">${TYPE_LABELS[card.type]}</span>
            <span class="pill priority">Priority ${card.priority}</span>
            ${progress.mastery < 0 ? `<span class="pill weak">Needs review</span>` : ""}
            <span class="pill">${formatDeckName(card.deck)}</span>
          </div>
        </div>
        <div class="card-body">
          ${renderPrompt(card)}
          ${renderKindBody(card)}
          ${renderTags(card)}
        </div>
      </article>
    `;
  }

  function renderPrompt(card) {
    if (card.promptLatex) {
      return `
        <div class="prompt prompt-with-math">
          <span>${escapeHtml(card.prompt)}</span>
          <div class="math-block">${renderLatex(card.promptLatex)}</div>
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
    const formula = card.latex || (card.type === "formula" && isFormulaText(answer) ? answer : "");
    const formulaBlock = formula ? `<div class="math-block">${renderLatex(formula)}</div>` : "";
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

    if (isFormulaText(text)) {
      return `<span class="math-inline">${renderLatex(text)}</span>`;
    }

    return escapeHtml(text);
  }

  function findCardByAnswer(answer) {
    const normalized = normalizeForCompare(answer);
    return app.cards.find((card) => normalizeForCompare(card.answer) === normalized) || null;
  }

  function isFormulaText(value) {
    return /\\|[_^=<>≥≤≈∑Σ∫λΔσπ√]|\b(f_s|T_s|MSE|D_|A_|L=|BW|SF)\b/.test(String(value || ""));
  }

  function renderLatex(value) {
    const holds = [];
    const hold = (html) => {
      const id = holds.length;
      holds.push(html);
      return `@@H${id}@@`;
    };

    const symbols = {
      approx: "≈",
      cdot: "·",
      Delta: "Δ",
      frac: "frac",
      ge: "≥",
      in: "∈",
      infinity: "∞",
      infty: "∞",
      int: "∫",
      lambda: "λ",
      le: "≤",
      Leftrightarrow: "⇔",
      Longleftrightarrow: "⇔",
      pi: "π",
      quad: " ",
      sigma: "σ",
      sin: "sin",
      sum: "∑",
      times: "×"
    };

    const convert = (raw) => {
      let text = String(raw || "")
        .replace(/\\left/g, "")
        .replace(/\\right/g, "")
        .replace(/\\,/g, " ")
        .replace(/\\operatorname\{([^{}]+)\}/g, "$1")
        .replace(/\\hat\{([^{}]+)\}/g, "$1\u0302");

      text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, top, bottom) =>
        hold(`<span class="frac"><span>${convert(top)}</span><span>${convert(bottom)}</span></span>`)
      );
      text = text.replace(/\\sqrt\{([^{}]+)\}/g, (_, inner) =>
        hold(`<span class="root">√<span>${convert(inner)}</span></span>`)
      );

      text = escapeHtml(text);
      text = text.replace(/\\([A-Za-z]+)/g, (_, name) => symbols[name] || name);
      text = text.replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>");
      text = text.replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>");
      text = text.replace(/\^([A-Za-z0-9+\-]+)/g, "<sup>$1</sup>");
      text = text.replace(/_([A-Za-z0-9+\-]+)/g, "<sub>$1</sub>");
      text = text.replace(/\s+/g, " ");
      return text;
    };

    let html = convert(value);
    let previous = "";
    while (html !== previous) {
      previous = html;
      html = html.replace(/@@H(\d+)@@/g, (_, index) => holds[Number(index)] || "");
    }
    return html;
  }

  function renderTags(card) {
    const tags = (card.tags || []).slice(0, 5);
    if (!tags.length) return "";
    return `<div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
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
        </div>
      </section>
    `;
  }

  function renderDecks() {
    if (!app.cards.length) return;

    const deckStats = getDeckStats().sort((a, b) => {
      if (a.status !== b.status) {
        const rank = { weak: 0, unstarted: 1, partial: 2, good: 3 };
        return rank[a.status] - rank[b.status];
      }
      return b.weakness - a.weakness || a.name.localeCompare(b.name);
    });

    const rows = deckStats.map((deck) => {
      const accuracyText = deck.answered ? `${Math.round(deck.accuracy * 100)}% correct` : "not started";
      const statusText =
        deck.status === "weak"
          ? "Needs attention"
          : deck.status === "unstarted"
            ? "Not started"
            : deck.status === "partial"
              ? "Keep going"
              : "Good";
      return `
        <button type="button" class="deck-row ${deck.status}" data-action="select-deck" data-deck="${escapeAttr(deck.name)}">
          <strong>${formatDeckName(deck.name)}</strong>
          <span>${deck.seen}/${deck.total} covered - ${deck.answered} answered - ${deck.weakCards} weak - ${accuracyText}</span>
          <span class="deck-status">${statusText}</span>
          <div class="meter" aria-hidden="true"><span style="width: ${Math.round(deck.coverage * 100)}%"></span></div>
        </button>
      `;
    });

    const stats = getStudyStats();
    app.els.decksPanel.innerHTML = `
      <h2 class="section-title">Decks</h2>
      <div class="deck-list">
        <button type="button" class="deck-row" data-action="select-deck" data-deck="all">
          <strong>All decks</strong>
          <span>${stats.covered}/${stats.total} cards covered - ${stats.answered} answers given</span>
          <span class="deck-status">${stats.weakDecks} weak decks</span>
          <div class="meter" aria-hidden="true"><span style="width: ${getOverallSeenPercent()}%"></span></div>
        </button>
        ${rows.join("")}
      </div>
    `;
  }

  function renderCheatSheet() {
    if (!app.data) return;

    const formulas = (app.data.formula_cards || []).map(
      (card) => `
        <div class="cheat-item">
          <strong>${escapeHtml(card.front || "Formula")}</strong>
          ${card.latex ? `<div class="math-block">${renderLatex(card.latex)}</div>` : `<span>${renderAnswerContent(card.back || "")}</span>`}
          ${card.back && card.latex && normalizeForCompare(card.back) !== normalizeForCompare(card.latex)
            ? `<span>${escapeHtml(card.back)}</span>`
            : ""}
          ${card.explanation ? `<span>${escapeHtml(card.explanation)}</span>` : ""}
        </div>
      `
    );

    const sentences = (app.data.exam_sentences || []).map(
      (sentence, index) => `
        <div class="cheat-item">
          <strong>Exam sentence ${index + 1}</strong>
          <span>${escapeHtml(sentence)}</span>
        </div>
      `
    );

    app.els.cheatPanel.innerHTML = `
      <h2 class="section-title">Must Memorize Formulas</h2>
      <div class="cheat-list">${formulas.join("")}</div>
      <h2 class="section-title">Exam Sentences</h2>
      <div class="cheat-list">${sentences.join("")}</div>
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
    const count = app.session.repeats[card.id] || 0;
    if (count >= 2) return;
    app.session.repeats[card.id] = count + 1;
    const insertAt = Math.min(app.session.index + 3, app.session.queue.length);
    app.session.queue.splice(insertAt, 0, card.id);
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
    const deckStats = getDeckStats();
    const covered = app.cards.filter((card) => getCardProgress(card.id).seen > 0).length;
    const answered = app.cards.reduce((sum, card) => sum + getCardProgress(card.id).seen, 0);
    const weakDecks = deckStats.filter((deck) => deck.status === "weak").length;

    return {
      total: app.cards.length,
      covered,
      answered,
      weakDecks
    };
  }

  function getDeckStatsMap() {
    return new Map(getDeckStats().map((deck) => [deck.name, deck]));
  }

  function getDeckStats() {
    return app.decks.map((deck) => {
      const cards = app.cards.filter((card) => card.deck === deck);
      const totals = cards.reduce(
        (acc, card) => {
          const progress = getCardProgress(card.id);
          acc.seen += progress.seen > 0 ? 1 : 0;
          acc.answered += progress.seen;
          acc.correct += progress.correct;
          acc.wrong += progress.wrong;
          acc.unsure += progress.unsure;
          acc.weakCards += progress.wrong > 0 || progress.mastery < 0 ? 1 : 0;
          return acc;
        },
        { seen: 0, answered: 0, correct: 0, wrong: 0, unsure: 0, weakCards: 0 }
      );

      const total = Math.max(1, cards.length);
      const coverage = totals.seen / total;
      const weakRatio = totals.weakCards / total;
      const accuracy = totals.answered ? totals.correct / totals.answered : 0;
      const mistakeRate = totals.answered ? (totals.wrong + totals.unsure * 0.5) / totals.answered : 0;
      const coverageGap = 1 - coverage;
      const weakness = clamp(coverageGap * 0.35 + weakRatio * 0.45 + mistakeRate * 0.55, 0, 1);
      const status =
        totals.answered && (accuracy < 0.7 || weakRatio >= 0.25)
          ? "weak"
          : totals.answered === 0
            ? "unstarted"
            : coverage < 0.6
              ? "partial"
              : "good";

      return {
        name: deck,
        total: cards.length,
        seen: totals.seen,
        answered: totals.answered,
        correct: totals.correct,
        wrong: totals.wrong,
        unsure: totals.unsure,
        weakCards: totals.weakCards,
        coverage,
        accuracy,
        weakness,
        status
      };
    });
  }

  function loadState() {
    const defaults = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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

  function defaultState() {
    return {
      activeDate: "",
      cards: {},
      lastMistakes: []
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
    } catch (error) {
      showToast("Progress could not be saved on this browser.");
    }
  }

  function getOverallSeenPercent() {
    if (!app.cards.length) return 0;
    const seen = app.cards.filter((card) => getCardProgress(card.id).seen > 0).length;
    return Math.round((seen / app.cards.length) * 100);
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

  function showTab(tab) {
    app.tab = tab;
    const panels = {
      lesson: app.els.lessonPanel,
      decks: app.els.decksPanel,
      cheat: app.els.cheatPanel
    };

    Object.entries(panels).forEach(([name, panel]) => {
      const active = name === tab;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    updateTabButtons();
    if (tab === "decks") renderDecks();
    if (tab === "cheat") renderCheatSheet();
  }

  function updateTabButtons() {
    document.querySelectorAll("[data-action='show-tab']").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === app.tab);
    });
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

  function formatDeckName(deck) {
    return String(deck || "")
      .replace(/^\d+_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
