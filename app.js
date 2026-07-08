(() => {
  "use strict";

  const DATA_URL = "./data/se_duolingo_quiz_data.json";
  const STORAGE_KEY = "exam-sprint-state-v1";
  const DAILY_GOAL_XP = 50;
  const LESSON_SIZE = 10;
  const MAX_HEARTS = 5;
  const LEVEL_SIZE_XP = 120;
  const TYPE_SEQUENCE = [
    "concept",
    "formula",
    "choice",
    "concept",
    "formula",
    "choice",
    "cloze",
    "concept",
    "formula",
    "concept"
  ];

  const TYPE_LABELS = {
    concept: "Recall",
    formula: "Formula",
    choice: "Multiple choice",
    cloze: "Fill blank"
  };

  const app = {
    data: null,
    cards: [],
    decks: [],
    state: loadState(),
    session: emptySession(),
    tab: "lesson",
    focus: "sprint",
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
    app.els.xpValue = document.querySelector("#xpValue");
    app.els.streakValue = document.querySelector("#streakValue");
    app.els.heartValue = document.querySelector("#heartValue");
    app.els.dailyGoalText = document.querySelector("#dailyGoalText");
    app.els.dailyGoalBar = document.querySelector("#dailyGoalBar");
    app.els.levelValue = document.querySelector("#levelValue");
    app.els.deckSelect = document.querySelector("#deckSelect");
    app.els.lessonPanel = document.querySelector("#lessonPanel");
    app.els.decksPanel = document.querySelector("#decksPanel");
    app.els.cheatPanel = document.querySelector("#cheatPanel");
    app.els.focusControls = document.querySelector("#focusControls");
    app.els.toast = document.querySelector("#toast");
  }

  function bindEvents() {
    document.body.addEventListener("click", handleClick);
    document.body.addEventListener("input", handleInput);
    document.body.addEventListener("keydown", handleKeydown);

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

    if (action === "set-focus") {
      app.focus = target.dataset.focus || "sprint";
      updateFocusButtons();
      startLesson();
      renderAll();
      return;
    }

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

    if (action === "reveal") {
      app.session.interaction.revealed = true;
      renderLesson();
      return;
    }

    if (action === "choice") {
      submitChoice(target.dataset.choice || "");
      return;
    }

    if (action === "check-type") {
      checkTypedAnswer();
      return;
    }

    if (action === "grade") {
      submitGrade(target.dataset.grade || "unsure");
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

  function handleInput(event) {
    if (event.target.id === "typedAnswer") {
      app.session.interaction.typedValue = event.target.value;
    }
  }

  function handleKeydown(event) {
    if (event.key !== "Enter") return;
    if (event.target.id === "typedAnswer") {
      event.preventDefault();
      checkTypedAnswer();
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
        fullText,
        explanation: fullText,
        tags: card.tags || []
      };
    });

    return [...formulaCards, ...conceptCards, ...choiceCards, ...clozeCards].filter(
      (card) => card.id && card.prompt && card.answer
    );
  }

  function getDeckNames(cards) {
    return [...new Set(cards.map((card) => card.deck))].sort((a, b) => a.localeCompare(b));
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

    if (app.focus === "weak") {
      source = source.filter((card) => {
        const progress = getCardProgress(card.id);
        return progress.wrong > 0 || progress.mastery < 1 || progress.seen === 0;
      });
    }

    if (app.focus === "formulas") {
      source = source.filter((card) => card.type === "formula" || card.type === "cloze");
    }

    if (!source.length) {
      source = filteredCards();
    }

    const selected = [];
    const selectedIds = new Set();

    for (let i = 0; i < LESSON_SIZE; i += 1) {
      const targetType = app.focus === "sprint" ? TYPE_SEQUENCE[i % TYPE_SEQUENCE.length] : null;
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
    const weighted = pool.map((card) => {
      const progress = getCardProgress(card.id);
      const priorityWeight = card.priority === 1 ? 2.15 : 1.2;
      const unseenWeight = progress.seen ? 1 : 1.85;
      const dueWeight = !progress.due || progress.due <= now ? 1.65 : 0.3;
      const weakWeight = progress.mastery < 0 ? 2.2 : 1 + Math.min(progress.wrong, 4) * 0.28;
      const recentPenalty = progress.last && now - progress.last < 3 * 60 * 1000 ? 0.45 : 1;
      const score = priorityWeight * unseenWeight * dueWeight * weakWeight * recentPenalty;
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
    updateFocusButtons();
  }

  function renderShell() {
    ensureToday(false);
    app.els.xpValue.textContent = String(app.state.xp);
    app.els.streakValue.textContent = String(app.state.streak);
    app.els.heartValue.textContent = String(app.state.hearts);
    app.els.levelValue.textContent = String(getLevel());
    app.els.dailyGoalText.textContent = `${app.state.todayXp} / ${DAILY_GOAL_XP} XP`;
    app.els.dailyGoalBar.style.width = `${Math.min(100, (app.state.todayXp / DAILY_GOAL_XP) * 100)}%`;

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
    const kind = getInteractionKind(card);

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
          <p class="prompt">${escapeHtml(card.prompt)}</p>
          ${renderKindBody(card, kind)}
          ${renderTags(card)}
        </div>
      </article>
    `;

    const input = document.querySelector("#typedAnswer");
    if (input && !app.session.interaction.checked && !app.session.interaction.submitted) {
      input.focus({ preventScroll: true });
      const value = app.session.interaction.typedValue || "";
      input.value = value;
      input.setSelectionRange(value.length, value.length);
    }
  }

  function renderKindBody(card, kind) {
    if (app.session.interaction.submitted) {
      return renderSubmittedFeedback(card);
    }

    if (kind === "choice") {
      return renderChoiceBody(card);
    }

    if (kind === "type") {
      return renderTypeBody(card);
    }

    return renderRecallBody(card);
  }

  function renderChoiceBody(card) {
    const choices = buildChoices(card);
    return `
      <div class="choice-grid">
        ${choices
          .map(
            (choice) => `
              <button type="button" class="choice-btn" data-action="choice" data-choice="${escapeAttr(choice)}">
                ${escapeHtml(choice)}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderTypeBody(card) {
    const interaction = app.session.interaction;

    if (interaction.checked) {
      return `
        <div class="answer-panel ${interaction.typeMatch ? "correct" : "wrong"}">
          <p class="answer-main">${interaction.typeMatch ? "Correct." : "Check it against the answer."}</p>
          ${renderAnswer(card)}
          <div class="grade-row">
            <button type="button" class="grade-btn" data-action="grade" data-grade="wrong">Missed</button>
            <button type="button" class="grade-btn" data-action="grade" data-grade="unsure">Almost</button>
            <button type="button" class="grade-btn" data-action="grade" data-grade="correct">I had it</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="type-box">
        <input
          id="typedAnswer"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Type the missing term or formula"
          value="${escapeAttr(interaction.typedValue || "")}"
        >
        <button type="button" class="primary-btn" data-action="check-type">Check</button>
      </div>
    `;
  }

  function renderRecallBody(card) {
    if (!app.session.interaction.revealed) {
      return `
        <p class="subprompt">Answer out loud, then reveal.</p>
        <button type="button" class="primary-btn" data-action="reveal">Reveal answer</button>
      `;
    }

    return `
      <div class="answer-panel">
        ${renderAnswer(card)}
        <div class="grade-row">
          <button type="button" class="grade-btn" data-action="grade" data-grade="wrong">Forgot</button>
          <button type="button" class="grade-btn" data-action="grade" data-grade="unsure">Hesitated</button>
          <button type="button" class="grade-btn" data-action="grade" data-grade="correct">Knew it</button>
        </div>
      </div>
    `;
  }

  function renderSubmittedFeedback(card) {
    const result = app.session.interaction.result;
    const label = result === "correct" ? "Correct" : result === "unsure" ? "Almost" : "Review soon";
    const panelClass = result === "correct" ? "correct" : result === "wrong" ? "wrong" : "";
    const xp = app.session.interaction.xpAwarded || 0;

    return `
      <div class="answer-panel ${panelClass}">
        <p class="answer-main">${label}. +${xp} XP</p>
        ${renderAnswer(card)}
        <button type="button" class="primary-btn" data-action="next">
          ${app.session.index + 1 >= app.session.queue.length ? "Finish lesson" : "Continue"}
        </button>
      </div>
    `;
  }

  function renderAnswer(card) {
    const answer = card.fullText || card.answer;
    const latex = card.latex ? `<p class="answer-explanation">Latex: ${escapeHtml(card.latex)}</p>` : "";
    const explanation =
      card.explanation && card.explanation !== answer
        ? `<p class="answer-explanation">${escapeHtml(card.explanation)}</p>`
        : "";

    return `
      <p class="answer-main">${escapeHtml(answer)}</p>
      ${latex}
      ${explanation}
    `;
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
    const unsure = results.filter((item) => item.result === "unsure").length;
    const accuracy = Math.round((correct / total) * 100);
    const xp = results.reduce((sum, item) => sum + item.xp, 0);
    const mistakeButton =
      app.state.lastMistakes && app.state.lastMistakes.length
        ? `<button type="button" class="secondary-btn" data-action="review-mistakes">Review mistakes</button>`
        : "";

    return `
      <section class="summary-card">
        <h2>Lesson complete</h2>
        <div class="summary-grid">
          <div class="summary-tile"><span>Accuracy</span><strong>${accuracy}%</strong></div>
          <div class="summary-tile"><span>XP</span><strong>${xp}</strong></div>
          <div class="summary-tile"><span>Almost</span><strong>${unsure}</strong></div>
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

    const rows = app.decks.map((deck) => {
      const cards = app.cards.filter((card) => card.deck === deck);
      const seen = cards.filter((card) => getCardProgress(card.id).seen > 0).length;
      const weak = cards.filter((card) => {
        const progress = getCardProgress(card.id);
        return progress.wrong > 0 || progress.mastery < 0;
      }).length;
      const pct = Math.round((seen / cards.length) * 100);
      return `
        <button type="button" class="deck-row" data-action="select-deck" data-deck="${escapeAttr(deck)}">
          <strong>${formatDeckName(deck)}</strong>
          <span>${cards.length} cards - ${seen} seen - ${weak} weak</span>
          <div class="meter" aria-hidden="true"><span style="width: ${pct}%"></span></div>
        </button>
      `;
    });

    app.els.decksPanel.innerHTML = `
      <h2 class="section-title">Decks</h2>
      <div class="deck-list">
        <button type="button" class="deck-row" data-action="select-deck" data-deck="all">
          <strong>All decks</strong>
          <span>${app.cards.length} cards total</span>
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
          <span>${escapeHtml(card.back || "")}</span>
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

  function checkTypedAnswer() {
    const card = getCurrentCard();
    if (!card || app.session.interaction.submitted) return;

    const input = document.querySelector("#typedAnswer");
    const value = input ? input.value : app.session.interaction.typedValue;
    const isMatch = answerLooksCorrect(value, card);

    app.session.interaction.typedValue = value || "";
    app.session.interaction.checked = true;
    app.session.interaction.typeMatch = isMatch;

    if (isMatch) {
      submitResult("correct", { typed: value });
      return;
    }

    renderLesson();
  }

  function submitGrade(grade) {
    if (app.session.interaction.submitted) return;
    const result = ["wrong", "unsure", "correct"].includes(grade) ? grade : "unsure";
    submitResult(result, {});
  }

  function submitResult(result, detail) {
    const card = getCurrentCard();
    if (!card || app.session.interaction.submitted) return;

    ensureToday(true);
    const xp = awardXp(result);
    updateCardProgress(card, result);
    maybeInsertRepeat(card, result);

    app.session.interaction = {
      ...app.session.interaction,
      ...detail,
      submitted: true,
      result,
      xpAwarded: xp
    };

    app.session.results.push({
      id: card.id,
      result,
      xp,
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
    app.state.lessonsToday += 1;

    const results = app.session.results;
    const correct = results.filter((item) => item.result === "correct").length;
    const accuracy = results.length ? correct / results.length : 0;
    if (accuracy >= 0.8 && app.state.hearts < MAX_HEARTS) {
      app.state.hearts += 1;
    }
    if (!app.session.mistakes.length) {
      showToast("Clean lesson. Nice.");
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
      app.state.combo += 1;
      app.state.bestCombo = Math.max(app.state.bestCombo, app.state.combo);
      if (app.state.combo > 0 && app.state.combo % 5 === 0 && app.state.hearts < MAX_HEARTS) {
        app.state.hearts += 1;
        showToast(`Combo ${app.state.combo}. Heart restored.`);
      }
    } else if (result === "unsure") {
      progress.unsure += 1;
      progress.mastery = clamp(progress.mastery + 0.25, -5, 8);
      progress.due = now + 10 * 60 * 1000;
      app.state.combo = 0;
    } else {
      progress.wrong += 1;
      progress.mastery = clamp(progress.mastery - 1.5, -5, 8);
      progress.due = now + 2 * 60 * 1000;
      app.state.combo = 0;
      app.state.hearts = Math.max(0, app.state.hearts - 1);
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

  function awardXp(result) {
    let xp = result === "correct" ? 10 : result === "unsure" ? 4 : 1;
    if (result === "correct" && app.state.combo > 0 && app.state.combo % 5 === 4) {
      xp += 5;
    }
    app.state.xp += xp;
    app.state.todayXp += xp;
    return xp;
  }

  function getCurrentCard() {
    return app.cards.find((card) => card.id === app.session.queue[app.session.index]) || null;
  }

  function getInteractionKind(card) {
    if (card.type === "choice") return "choice";
    if (card.type === "formula" || card.type === "cloze") return "type";
    return "recall";
  }

  function buildChoices(card) {
    const baseChoices = card.choices && card.choices.length ? [...card.choices] : [];
    if (baseChoices.length >= 2) {
      return shuffle(uniqueRecent(baseChoices, 5));
    }

    const distractors = app.cards
      .filter((candidate) => candidate.id !== card.id && candidate.type === card.type)
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
      xp: 0,
      todayXp: 0,
      hearts: MAX_HEARTS,
      streak: 0,
      activeDate: "",
      combo: 0,
      bestCombo: 0,
      lessonsToday: 0,
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

  function ensureToday(markActive) {
    const today = localDateString(new Date());
    if (app.state.activeDate === today) return;

    const previous = app.state.activeDate;
    const wasYesterday = previous && previous === localDateString(addDays(new Date(), -1));

    app.state.todayXp = 0;
    app.state.lessonsToday = 0;
    app.state.combo = 0;
    app.state.hearts = MAX_HEARTS;

    if (markActive) {
      app.state.streak = wasYesterday ? app.state.streak + 1 : 1;
      app.state.activeDate = today;
      saveState();
    } else if (!previous) {
      app.state.activeDate = "";
    }
  }

  function getLevel() {
    return Math.floor(app.state.xp / LEVEL_SIZE_XP) + 1;
  }

  function getOverallSeenPercent() {
    if (!app.cards.length) return 0;
    const seen = app.cards.filter((card) => getCardProgress(card.id).seen > 0).length;
    return Math.round((seen / app.cards.length) * 100);
  }

  function freshInteraction() {
    return {
      revealed: false,
      submitted: false,
      checked: false,
      typeMatch: false,
      typedValue: "",
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

  function updateFocusButtons() {
    document.querySelectorAll("[data-action='set-focus']").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.focus === app.focus);
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

  function answerLooksCorrect(input, card) {
    const value = normalizeForCompare(input);
    if (!value) return false;

    const targets = [card.answer, card.fullText, card.latex]
      .filter(Boolean)
      .flatMap((answer) => answerVariants(answer));

    return targets.some((target) => {
      const normalized = normalizeForCompare(target);
      if (!normalized) return false;
      if (value === normalized) return true;
      if (value.length >= 3 && normalized.includes(value)) return true;
      if (normalized.length >= 3 && value.includes(normalized)) return true;
      return false;
    });
  }

  function answerVariants(answer) {
    const text = String(answer);
    const afterEquals = text.includes("=") ? text.split("=").slice(1).join("=") : "";
    return [text, afterEquals];
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

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function softBuzz(duration) {
    if ("vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  }
})();
