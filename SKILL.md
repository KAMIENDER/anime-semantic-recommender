---
name: anime-semantic-recommender
description: Use for Chinese-first, source-grounded anime recommendations when the user asks for anime similar to something they watched, describes nuanced taste, wants feedback-driven refinement, or cares about story texture, romance dynamics, emotional aftertaste, pacing, relationship patterns, and avoidances rather than only genre tags.
---

# Anime Semantic Recommender

Default to a lightweight taste-analysis workflow. Do not start with the local CLI unless the user explicitly asks to use the experimental local recommender, cache, Bangumi/AniList fetch, or feedback database.

## Mandatory Source Grounding

If browsing/searching is used, or if factual accuracy affects the recommendation, build a small source packet before taste matching. Do this before generic web search.

Preferred source order:

1. Official anime / publisher / streaming pages for release status, adaptation status, staff, cast, episode count, and availability.
2. Bangumi for Chinese titles, Chinese ACG context, ratings, tags, relationships between entries, and community metadata.
3. AniList for structured tags, format, popularity, cross-language titles, and API-friendly metadata.
4. MAL/Jikan for broader international popularity and fallback metadata.
5. TMDb only for posters, images, and general media metadata; do not use it as the main anime taste source.

Rules:

- Search engines are only discovery tools for finding the source pages above.
- Do not treat search snippets, generic SEO pages, scraped synopsis sites, uncredited blogs, or AI-generated listicles as authoritative.
- For the anchor work, check at least Bangumi or AniList when the exact work is not already clear; also check official sources when the work is current, obscure, or adaptation status matters.
- If the preferred sources are unavailable or unreachable, say "未能从指定高质量源核实" and separate verified facts from memory/inference.
- When reporting the process, name the source class actually checked, such as "先看 Bangumi/AniList/官方信息", rather than saying only "搜索了网页".

## Default Workflow

1. Identify the anchor work.
   - What did the user watch/read?
   - Is it anime, manga, light novel, web novel, or adaptation?
   - If the exact work is obscure or current, verify briefly before relying on facts.

2. Extract the liked experience, not just tags.
   - Relationship pattern: friends-to-lovers, girl leads, slow-burn, group romance, etc.
   - Emotional texture: sweet, shy, low-pressure, wistful, funny, tense.
   - Narrative engine: daily scenes, secrets, club activity, cohabitation, rivalry.
   - Pacing: slow tease, fast confession, episodic, strong plot.
   - Avoidances: harem, fanservice, heavy drama, love triangle, long misunderstandings.

3. Recommend in layers.
   - Direct matches: closest same experience.
   - Adjacent matches: similar emotional or relationship pattern with a different surface.
   - Stretch picks: only if useful, and explain why they are a stretch.

4. Explain every pick.
   - Say exactly what matches the user’s anchor.
   - Say what differs.
   - Include caveats when the fit is uncertain.

5. Use feedback immediately.
   - "Seen" means do not recommend it again.
   - "Too harem" lowers multi-girl/party-war picks.
   - "Too sweet" adds realism or bittersweetness.
   - "Too slow" raises plot momentum.
   - "These are all watched" moves deeper into mid-popularity and older titles.

## Output Shape

For normal requests, keep the answer compact:

```text
你喜欢的可能是：...

1. Title
   像在哪里：...
   不同/注意：...
```

Avoid pretending to know the user's watch history. Mix popular, mid-tier, and one optional exploration pick unless the user asks otherwise.

## Experimental CLI

The repo includes an experimental local recommender. Use it only when the user wants to test the implementation:

```bash
npm run recommend -- "想看像芙莉莲那种，有余韵但不要王道热血"
npm run recommend -- "想看安静的旅途感" -- --no-network --limit 5
npm run feedback -- "少女终末旅行" -- --seen --liked --comment "方向对"
npm run profile
```

Current limitation: the local seed catalog is small and biased toward "余韵/旅途/治愈/世界观" examples. It is not yet reliable for every genre, especially school romance/light-novel romance, unless that catalog is expanded.

## Reference

For the lightweight methodology, see `docs/simple-methodology.md`.
For the heavier experimental architecture, see `docs/technical-plan.md`.
