# Exam Sprint

A phone-friendly Duolingo-style quiz app for the Smart Environments exam data.

## Run

From this folder:

```sh
npm run start
```

Then open the shown address on your phone. If the phone is on the same Wi-Fi as this computer, use your computer's local network IP with port `8080`, for example `http://192.168.1.25:8080`.

## What It Does

- Builds 10-question lessons from formulas, concepts, multiple choice, and cloze cards.
- Shows priority 1 cards more often.
- Repeats missed cards inside the same lesson and schedules them sooner.
- Saves XP, streak, hearts, weak cards, and card progress in browser storage.
- Includes deck filters, formula drill, weak-card mode, and a cheat sheet.
