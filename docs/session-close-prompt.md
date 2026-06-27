# Session Close Prompt

Use this prompt at the end of a Codex session to preserve project context for the next fresh chat.

```text
Please perform an end-of-session context save for this repository.

1. Read AGENTS.md and docs/project-context.md first.
2. Review the current repo state with git status --short and inspect relevant diffs/files from this session.
3. Update docs/project-context.md with any important new context from this session, including:
   - architecture or security decisions
   - Terraform/AWS resource names and regions
   - GitHub Actions workflow inputs and deployment behavior
   - commands that worked
   - errors encountered and how they were fixed
   - current next steps or known risks
4. Update docs/frontend-prd.md as the living product record:
   - Compare the session changes against the PRD.
   - If a feature was implemented and is missing from the PRD, add it to the relevant requirements, acceptance criteria, and release phase.
   - If implementation behavior differs from the PRD, either update the PRD to match the approved direction or add an open product question.
   - Update the implementation tracker with what is done, what remains, and what is deferred.
   - Keep product claims aligned with client-provided material; do not invent official approvals, partnerships, or capabilities.
5. Keep the context concise and useful for a future Codex chat.
6. Do not save secrets, passwords, AWS access keys, kubeconfigs, .env values, Terraform state contents, or private tokens.
7. If README.md, AGENTS.md, or another docs file should point to the updated context, update that too.
8. Run only lightweight verification needed for docs, then summarize exactly which files changed.

Do not commit or push unless I explicitly ask.
```

## Automation Note

Codex cannot currently trigger an action exactly when a chat session ends. The safest workflow is to paste the prompt above before closing a session. A scheduled reminder can be added separately if you want a daily or weekly nudge.
