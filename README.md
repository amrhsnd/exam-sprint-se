# Exam Sprint

A phone-friendly Duolingo-style quiz app with Google sign-in support and selectable exam banks.

## Run

From this folder:

```sh
npm run start
```

Then open the shown address on your phone. If the phone is on the same Wi-Fi as this computer, use your computer's local network IP with port `8080`, for example `http://192.168.1.25:8080`.

## What It Does

- Starts with a sign-in screen. Google sign-in works after you add a Google OAuth client ID to `index.html`; local study mode works immediately.
- Lets you choose between configured exams without deleting older exam files or progress.
- Builds 10-question multiple-choice lessons from formulas, concepts, existing multiple choice, cloze cards, and generated variants.
- Includes the imported 1000-question exam sprint bank.
- Generates reverse concept questions, formula-recognition questions, explanation questions, and exam-sentence completion questions from the base material.
- Prioritizes formula cards, unseen questions, due questions, and questions where your answers show weakness.
- Randomly builds each lesson from the full question pool.
- Repeats missed questions after 2, then 4, then 8, then 16 questions when you keep missing them.
- Saves covered questions, answer history, and review progress in browser storage.
- Saves progress separately per exam.
- Opens straight into the question flow with rendered formulas and no deck filtering.

## Add Google Login

1. Create an OAuth 2.0 Web client in Google Cloud.
2. Add these authorized JavaScript origins:
   - `https://amrhsnd.github.io`
   - `http://localhost:8080`
3. Paste the client ID into `index.html`:

```html
<meta name="google-signin-client_id" content="YOUR_CLIENT_ID.apps.googleusercontent.com">
```

This static app uses Google Identity Services on the client and stores the signed-in profile in browser storage.

## Security Notes

- GitHub Pages is public. Do not include private exam banks, secret notes, API keys, or anything that should not be downloadable.
- Google sign-in is only for local progress separation. It is not server-side authentication and should not be used to protect private content.
- Progress and the local profile label are stored in browser `localStorage`, so avoid using it for sensitive personal data on shared devices.
- The app loads MathJax from jsDelivr. Google Identity Services is loaded only if a Google OAuth client ID is configured.

## Add Another Exam

1. Put the new question bank JSON in `data/`, for example `data/my_exam_quiz_data.json`.
2. Add it to `data/exams.json` with `"status": "ready"`.
3. Keep `data/se_duolingo_quiz_data.json` in place; that is the original Smart Environments exam.
