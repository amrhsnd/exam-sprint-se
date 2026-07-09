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
- Includes the imported 1000-question exam sprint bank.
- Generates reverse concept questions, formula-recognition questions, explanation questions, and exam-sentence completion questions from the base material.
- Prioritizes formula cards, unseen questions, due questions, and questions where your answers show weakness.
- Randomly builds each lesson from the full question pool.
- Repeats missed questions after 2, then 4, then 8, then 16 questions when you keep missing them.
- Saves covered questions, answer history, and review progress in browser storage.
- Opens straight into the question flow with rendered formulas and no deck filtering.
