# Anime Semantic Recommender

Chinese-first anime recommendation methodology, Codex skill, and experimental TypeScript CLI.

This project is intentionally lightweight. The default recommendation path is not a big vector database or a top-list scraper; it is a repeatable workflow for understanding what a viewer liked, grounding factual claims in anime-specific sources, and then using semantic reasoning to explain why each recommendation fits.

## What This Is

- A Codex skill for Chinese-first anime recommendations.
- A compact methodology for semantic taste analysis: relationship pattern, emotional texture, pacing, narrative engine, and avoidances.
- An experimental local CLI that can cache Bangumi/AniList metadata, record feedback, and test recommendation heuristics.

## Source Policy

When facts matter, the recommender should not rely on generic search snippets or SEO listicles. Preferred source order:

1. Official anime, publisher, or streaming pages.
2. Bangumi for Chinese titles, Chinese ACG context, tags, ratings, and related entries.
3. AniList for structured tags, format, popularity, and cross-language titles.
4. MAL/Jikan as broader international metadata fallback.
5. TMDb only for posters and general media metadata.

Recommendation explanations can use LLM semantic judgment, but factual fields should come from high-quality sources when possible.

## Quick Start

Requirements:

- Node.js 22.5 or newer.
- npm.
- Optional: `OPENAI_API_KEY` for LLM profile generation and reranking.

```bash
npm install
npm run build
npm run smoke
```

Try a local recommendation:

```bash
npm run recommend -- "想看像芙莉莲那种，有余韵但不要王道热血" -- --limit 5 --no-network
```

Search source metadata:

```bash
npm run search -- "葬送的芙莉莲"
```

Record feedback:

```bash
npm run feedback -- "少女终末旅行" -- --seen --liked --comment "方向对"
npm run profile
```

## Codex Skill

The skill entrypoint is [SKILL.md](SKILL.md). It tells Codex to:

- Start from lightweight taste analysis.
- Ground factual claims in official sources, Bangumi, AniList, MAL/Jikan, or TMDb before generic web search.
- Explain each recommendation by "where it matches", "where it differs", and "who should avoid it".
- Use feedback immediately instead of repeating the same popular recommendations.

For the shorter method reference, see [docs/simple-methodology.md](docs/simple-methodology.md).
For the heavier implementation plan, see [docs/technical-plan.md](docs/technical-plan.md).

## Current Status

This is an early personal-use MVP. The local seed catalog is small and biased toward works with quiet, reflective, healing, journey, or worldbuilding texture. The CLI is useful for experimentation, but the skill methodology is the main artifact right now.

## License

MIT
