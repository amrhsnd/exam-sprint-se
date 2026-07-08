# Exam Sprint

A phone-friendly Duolingo-style quiz app for the Smart Environments exam data.

## Run

From this folder:

```sh
npm run start
```

Then open the shown address on your phone. If the phone is on the same Wi-Fi as this computer, use your computer's local network IP with port `8080`, for example `http://192.168.1.25:8080`.

## What It Does

- Builds 10-question multiple-choice lessons from formulas, concepts, existing multiple choice, cloze cards, and generated variants.
- Generates reverse concept questions, formula-recognition questions, explanation questions, and exam-sentence completion questions from the base material.
- Prioritizes formula cards and decks where your answers show weakness or low coverage.
- Repeats missed cards inside the same lesson and schedules them sooner.
- Saves covered cards, answer history, weak cards, and deck progress in browser storage.
- Includes deck filters, weak-deck reporting, rendered formulas, and a cheat sheet.
