# GetGo Tools

Cross-platform desktop operations app for GetGo quiz repositories.

## Requirements

- Node.js 20 and npm
- Git
- macOS or Windows
- Tesseract OCR for image orientation detection
- Firebase CLI for Firebase deployments
- EAS CLI, Android Studio/JDK, or Xcode only for their corresponding workflows

## Development setup

Clone the GetGo repositories under one workspace when possible:

```text
tnp-getgo/
|-- tnp-getgo-tools
|-- tnp-getgo-web
|-- tnp-getgo-app
|-- tnp-getgo-quizzes
`-- tnp-getgo-logics
```

Tools validates package identities and searches nearby directories up to three
levels deep. Exact sibling placement is preferred but not required. If a
repository cannot be found, create `.env` and set one or more overrides:

```dotenv
GETGO_QUIZZES_ROOT=C:\path\to\tnp-getgo-quizzes
GETGO_WEB_ROOT=C:\path\to\tnp-getgo-web
GETGO_APP_ROOT=C:\path\to\tnp-getgo-app
GETGO_LOGICS_ROOT=C:\path\to\tnp-getgo-logics
```

Install and run:

```bash
npm ci
npm run dev
```

The committed vendored Logics package is used by default. After changing the
Logics source repository, use `npm run dev:fresh` to validate, repack, install,
and launch that source version.

On first launch, Tools automatically selects a nearby `tnp-getgo-quizzes`
repository. A different quiz repository can always be selected in the UI.

## Environment configuration

`.env.example` contains public project configuration and is loaded directly.
Developers do not need to copy those values. Create an ignored `.env` only for
private credentials or repository path overrides:

```dotenv
GETGO_AI_OPENAI_API_KEY=
GETGO_GOOGLE_DESKTOP_CLIENT_SECRET=
```

For an installed application, place private overrides in the app data folder:

- macOS: `~/Library/Application Support/GetGo Tools/.env`
- Windows: `%APPDATA%\GetGo Tools\.env`

Public and shareable:

- Firebase API keys, project IDs, project numbers, and storage bucket names
- Google OAuth client IDs
- Meta/Facebook app ID
- Model name and repository layout defaults

Private and never committed:

- OpenAI API keys
- Google OAuth client secrets
- Firebase service-account JSON/private keys
- EAS, Firebase, Apple, Google Play, signing, and store credentials

Firebase API keys identify the Firebase project; Firestore/Storage Security
Rules and IAM must enforce authorization. API-key restrictions should still be
configured in Google Cloud.

## Platform notes

- Android workflows require Android Studio, an SDK/emulator, and a compatible JDK.
- iOS workflows require macOS and Xcode and are unavailable on Windows.
- Install Tesseract with `brew install tesseract` on macOS or install it on
  Windows and ensure `tesseract.exe` is on `PATH` (or set `TESSERACT_PATH`).
- Developers need explicit Firebase/EAS permissions for remote operations.

## Verification and packaging

```bash
npm run typecheck
npm test
npm run build
npm run dist
```

`npm run dist` creates the platform installer in `release/`. Build macOS and
Windows installers on their respective operating systems. Private `.env`
files are never bundled; the packaged app contains only `.env.example`.

See [PLAN.md](./PLAN.md) for architecture and job status semantics.
