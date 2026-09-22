# Running Claude Code on this project

## 1. Install and log in (once)

You need a Claude Pro, Max, Team or Enterprise subscription, or a Claude Console account.

macOS, Linux or WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Check it worked with `claude --version`, then run `claude` once and follow the browser login.
Full instructions: https://code.claude.com/docs/en/quickstart

## 2. Put the project under Git

```bash
unzip patrol-prototype.zip && cd patrol-prototype
git init && git add . && git commit -m "Prototype after design discussion"
npm install
pip install -r tests/requirements.txt && playwright install chromium
```

Commit before each phase so every change Claude Code makes can be reviewed with `git diff` and undone.

## 3. Start a session in the project folder

```bash
claude
```

Claude Code reads `CLAUDE.md` automatically. The docs it points to (`docs/spec.md`, `docs/implementation-plan.md`, `docs/decisions.md`) carry the rest of the context from the design discussion.

## 4. Prompts to use

First session:

```text
Read CLAUDE.md, docs/decisions.md, docs/spec.md and docs/implementation-plan.md.
Summarise the project and the fixed decisions in a few lines, list anything that looks
inconsistent between the docs and the code, then restate the Phase 1 acceptance criteria
and give me a plan. Do not change any files yet.
```

After you agree with the plan:

```text
Implement Phase 1. Run npm run lint, npm run typecheck and npm test when you are done,
fix anything that fails, and update docs/spec.md if behaviour changed.
```

Later phases, in a fresh session (`/clear`) each time:

```text
Read CLAUDE.md and the Phase N section of docs/implementation-plan.md. Restate the
acceptance criteria, plan, and wait for my go-ahead before editing.
```

## 5. Habits that keep it on track

- One phase per session. Use `/clear` between phases so old context does not leak in; `claude -c` continues the most recent session if you stop halfway.
- Review `git diff` before committing each phase.
- If Claude Code proposes changing a fixed decision (framework, native app, scan photos, backend), treat it as a question for you, not a change to accept.
- Supabase secrets (service role key, export secret) go in Supabase function secrets or a local `.env` that is git-ignored. Never paste them into chat or commit them.
- Ask it to check current Supabase documentation when writing migrations or functions; its built-in knowledge can be out of date.
