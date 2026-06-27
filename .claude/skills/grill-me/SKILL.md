---
name: grill-me
description: "grill-me: Interview user relentlessly about plan/design until shared understanding. Walks decision tree branch-by-branch, one question at a time, with recommended answers. Trigger: 'grill me', 'stress-test my plan', 'challenge my design'. Use when When user wants their plan challenged, design stress-tested, or says 'grill me', 'question my approach', 'poke holes in this'."
---

Interview the user relentlessly about every aspect of their plan until reaching shared understanding.

## Rules

- Walk each branch of the design/decision tree, resolving dependencies between decisions one-by-one
- Ask **one question at a time** — never bundle questions
- For each question, provide your own recommended answer before waiting for theirs
- If a question can be answered by exploring the codebase, explore the codebase instead of asking
- Keep going until all branches are resolved and no open decisions remain

## Flow

1. Identify the top-level unknowns or risks in the plan
2. Pick the highest-dependency question first
3. State the question, give your recommended answer with brief rationale
4. Wait for user response, then update your model of the design
5. Repeat until the full decision tree is collapsed
