# Contributing

1. Open an issue first for anything bigger than a small fix.
2. Branch from `main`. Every change lands through a pull request with one approving review.
3. Run `bun run typecheck && bun run lint && bun test` before you push. CI runs the same, plus a
   secret scan, a dependency audit and CodeQL.
4. Changes to Mike's prompt or tools also run the voice tests (`evals/`): a wrong call outcome fails
   the check.
5. Never commit a key, a token or real customer data. Sample data stays synthetic.
