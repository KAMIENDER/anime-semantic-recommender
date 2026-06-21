import { AppDatabase } from "../storage/db.js";
import type { ExperienceProfile, Feedback, Intent, Recommendation, Subject } from "../types.js";
import { getBangumiSubject, searchBangumiAnime } from "../sources/bangumi.js";
import { searchAniListAnime } from "../sources/anilist.js";
import { buildExperienceProfile, subjectHash } from "../semantic/profile.js";
import { clamp, cosineText, normalizeText, unique, yearFromDate } from "../utils/text.js";
import { parseIntent } from "./intent.js";
import { rerankWithLlm } from "./rerank.js";

export interface RecommendOptions {
  limit: number;
  noNetwork?: boolean;
  refresh?: boolean;
  useLlmRerank?: boolean;
}

export interface RecommendResult {
  intent: Intent;
  recommendations: Recommendation[];
  warnings: string[];
}

export async function recommendAnime(
  db: AppDatabase,
  query: string,
  options: RecommendOptions,
): Promise<RecommendResult> {
  const warnings: string[] = [];
  const feedback = db.listFeedback();
  let subjects = db.listSubjects();
  const intent = await parseIntent(query, subjects, feedback);

  if (!options.noNetwork) {
    const fetched = await fetchExternalCandidates(db, query, subjects, warnings);
    if (fetched > 0) subjects = db.listSubjects();
  }

  const profiles = await ensureProfiles(db, subjects, options.refresh);
  const profileMap = new Map(profiles.map((profile) => [profile.subjectId, profile]));
  const enrichedIntent = enrichIntentWithFeedback(intent, feedback, db, profileMap);

  const scored = subjects
    .map((subject) => {
      const profile = profileMap.get(subject.id);
      if (!profile) return null;
      return scoreSubject(subject, profile, enrichedIntent, feedback);
    })
    .filter((item): item is Recommendation => Boolean(item))
    .filter((item) => !item.debug.excluded)
    .sort((a, b) => b.score - a.score);

  const deduped = dedupeByTitle(scored).slice(0, Math.max(options.limit * 4, 24));
  const reranked =
    options.useLlmRerank === false ? deduped
    : await rerankWithLlm(enrichedIntent, deduped);

  return {
    intent: enrichedIntent,
    recommendations: diversify(reranked).slice(0, options.limit),
    warnings,
  };
}

async function fetchExternalCandidates(
  db: AppDatabase,
  query: string,
  subjects: Subject[],
  warnings: string[],
): Promise<number> {
  const terms = unique([query, ...extractLikelySearchTerms(query, subjects)]).slice(0, 4);
  let count = 0;

  for (const term of terms) {
    try {
      const bangumi = await searchBangumiAnime(term, 8);
      for (const subject of bangumi) {
        try {
          const detail = await getBangumiSubject(Number(subject.sourceId));
          db.upsertSubject(detail);
          count += 1;
        } catch {
          db.upsertSubject(subject);
          count += 1;
        }
      }
    } catch (error) {
      warnings.push(`Bangumi 搜索失败，已跳过 "${term}"：${String(error).slice(0, 120)}`);
    }

    try {
      const anilist = await searchAniListAnime(term, 8);
      for (const subject of anilist) {
        db.upsertSubject(subject);
        count += 1;
      }
    } catch (error) {
      warnings.push(`AniList 搜索失败，已跳过 "${term}"：${String(error).slice(0, 120)}`);
    }
  }

  return count;
}

function extractLikelySearchTerms(query: string, subjects: Subject[]): string[] {
  const matchedTitles = subjects
    .filter((subject) =>
      [subject.nameCn, subject.name, ...subject.aliases]
        .filter((title) => title.length >= 2)
        .some((title) => query.toLowerCase().includes(title.toLowerCase())),
    )
    .flatMap((subject) => [subject.nameCn, subject.name]);

  const quoted = [...query.matchAll(/[《「"']([^》」"']{2,30})[》」"']/g)].map((match) => match[1]);
  const compact = query
    .replace(/[，。,.!?！？]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 2 && part.length <= 24)
    .slice(0, 2);

  return unique([...matchedTitles, ...quoted, ...compact]);
}

async function ensureProfiles(
  db: AppDatabase,
  subjects: Subject[],
  refresh = false,
): Promise<ExperienceProfile[]> {
  const profiles: ExperienceProfile[] = [];
  for (const subject of subjects) {
    const existing = db.getProfile(subject.id);
    if (
      existing &&
      !refresh &&
      (existing.sourceHash === subjectHash(subject) ||
        (subject.source === "seed" && existing.model.startsWith("seed-")))
    ) {
      profiles.push(existing);
      continue;
    }
    const profile = await buildExperienceProfile(subject);
    db.upsertProfile(profile);
    profiles.push(profile);
  }
  return profiles;
}

function enrichIntentWithFeedback(
  intent: Intent,
  feedback: Feedback[],
  db: AppDatabase,
  profileMap: Map<string, ExperienceProfile>,
): Intent {
  const anchors = intent.anchors
    .map((subjectId) => profileMap.get(subjectId)?.profileText)
    .filter((text): text is string => Boolean(text));
  const liked = feedback
    .filter((item) => item.type === "seen_liked")
    .slice(0, 8)
    .map((item) => profileMap.get(item.subjectId)?.profileText)
    .filter((text): text is string => Boolean(text));

  const disliked = feedback
    .filter((item) => item.type === "seen_disliked" || item.type === "not_interested")
    .slice(0, 8)
    .map((item) => {
      const subject = db.getSubject(item.subjectId);
      const profile = profileMap.get(item.subjectId);
      return unique([subject?.nameCn, subject?.name, item.comment, profile?.profileText]).join("：");
    })
    .filter(Boolean);

  const idealProfileText = [
    intent.idealProfileText,
    anchors.length ? `用户本轮提到的口味锚点体验画像：${anchors.join(" / ")}` : "",
    liked.length ? `用户过往喜欢的体验画像：${liked.join(" / ")}` : "",
    disliked.length ? `用户过往负反馈，需要避开相似体验：${disliked.join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...intent,
    idealProfileText,
    negativeSemantics: unique([
      ...intent.negativeSemantics,
      ...feedback.filter((item) => item.type === "too_popular").map(() => "太热门"),
      ...feedback.filter((item) => item.type === "too_obscure").map(() => "太冷门"),
    ]),
  };
}

function scoreSubject(
  subject: Subject,
  profile: ExperienceProfile,
  intent: Intent,
  feedback: Feedback[],
): Recommendation {
  const seen = feedback.some(
    (item) =>
      item.subjectId === subject.id &&
      (item.type === "seen_liked" || item.type === "seen_ok" || item.type === "seen_disliked"),
  );
  const anchor = intent.anchors.includes(subject.id);

  const corpus = `${profile.profileText} ${profile.facets.themes.join(" ")} ${subject.tags.join(" ")}`;
  const notForCorpus = profile.facets.notFor.join(" ");
  const warningCorpus = `${profile.facets.contentWarnings.join(" ")} ${subject.tags.join(" ")}`;
  const positiveText = intent.positiveSemantics.join(" ");
  const negativeText = intent.negativeSemantics.join(" ");

  const semanticFit = cosineText(intent.idealProfileText, profile.profileText);
  const positiveFit = positiveText ? cosineText(positiveText, corpus) : 0;
  const antiFit = negativeText ? cosineText(negativeText, warningCorpus) : 0;
  const antiAlignment = negativeText ? cosineText(negativeText, notForCorpus) : 0;
  const quality = qualityScore(subject);
  const confidence = confidenceScore(subject, profile);
  const popularity = popularityFit(subject, intent);
  const novelty = noveltyFit(subject, intent);
  const dislikedPenalty = dislikedSimilarity(subject, profile, feedback);

  const tooSparse =
    (subject.ratingTotal ?? 9999) < intent.hardFilters.minRatingTotal &&
    (subject.collectionTotal ?? 9999) < intent.hardFilters.minCollectionTotal &&
    subject.source !== "seed";

  const excluded = seen || anchor || tooSparse;
  const score = clamp(
    semanticFit * 0.4 +
      positiveFit * 0.12 +
      quality * 0.18 +
      confidence * 0.14 +
      popularity * 0.08 +
      novelty * 0.08 +
      antiAlignment * 0.08 -
      antiFit * 0.18 -
      dislikedPenalty * 0.25 -
      (tooSparse ? 0.2 : 0),
  );

  return {
    subject,
    profile,
    score,
    reasons: buildReasons(subject, profile, semanticFit, positiveFit, antiAlignment),
    caveats: buildCaveats(subject, profile, antiFit, confidence),
    debug: {
      semanticFit,
      positiveFit,
      quality,
      confidence,
      popularity,
      novelty,
      antiFit,
      antiAlignment,
      dislikedPenalty,
      seen,
      anchor,
      tooSparse,
      excluded,
    },
  };
}

function qualityScore(subject: Subject): number {
  if (!subject.score) return 0.52;
  const total = subject.ratingTotal ?? Math.max(20, Math.round((subject.collectionTotal ?? 0) / 8));
  const global = 7.0;
  const prior = 300;
  const bayes = (subject.score * total + global * prior) / (total + prior);
  return clamp((bayes - 5.5) / 3.5);
}

function confidenceScore(subject: Subject, profile: ExperienceProfile): number {
  const rating = Math.min(1, Math.log10((subject.ratingTotal ?? 0) + 1) / 4);
  const collection = Math.min(1, Math.log10((subject.collectionTotal ?? 0) + 1) / 4.2);
  const tags = Math.min(1, subject.tags.length / 10);
  const summary = subject.summary.length > 30 ? 1 : 0.35;
  return clamp(profile.confidence * 0.45 + rating * 0.2 + collection * 0.15 + tags * 0.12 + summary * 0.08);
}

function popularityFit(subject: Subject, intent: Intent): number {
  const exposure = Math.max(
    Math.min(1, Math.log10((subject.collectionTotal ?? 0) + 1) / 4.7),
    subject.rank ? Math.max(0, 1 - subject.rank / 2000) : 0,
  );
  if (intent.softPreferences.popularity === "popular") return exposure;
  if (intent.softPreferences.popularity === "explore") return 1 - Math.abs(exposure - 0.35);
  if (intent.softPreferences.popularity === "mid") return 1 - Math.abs(exposure - 0.55);
  return 1 - Math.abs(exposure - 0.65);
}

function noveltyFit(subject: Subject, intent: Intent): number {
  const exposure = Math.min(1, Math.log10((subject.collectionTotal ?? 0) + 1) / 4.7);
  if (intent.softPreferences.novelty === "high") return 1 - exposure;
  if (intent.softPreferences.novelty === "low") return exposure;
  return 1 - Math.abs(exposure - 0.55);
}

function dislikedSimilarity(subject: Subject, profile: ExperienceProfile, feedback: Feedback[]): number {
  const disliked = feedback.filter((item) => item.type === "seen_disliked" || item.type === "not_interested");
  if (!disliked.length) return 0;
  const ownText = `${subject.nameCn} ${subject.name} ${profile.profileText}`;
  return Math.max(
    ...disliked.map((item) => cosineText(`${item.comment ?? ""} ${item.subjectId}`, ownText)),
    0,
  );
}

function buildReasons(
  subject: Subject,
  profile: ExperienceProfile,
  semanticFit: number,
  positiveFit: number,
  antiAlignment: number,
): string[] {
  const reasons = [
    semanticFit > 0.18 ? "整体体验画像和这次需求相近，不只是表面标签命中。" : undefined,
    positiveFit > 0.12 ? "它在用户提到的正向语义上有明显重合。" : undefined,
    antiAlignment > 0.08 ? "它的“不适合人群”恰好避开了用户不想要的方向。" : undefined,
    profile.facets.viewerAftertaste ? `观看后味：${profile.facets.viewerAftertaste}。` : undefined,
    subject.tags.length ? `可解释标签：${subject.tags.slice(0, 5).join("、")}。` : undefined,
  ];
  return unique(reasons).slice(0, 4);
}

function buildCaveats(
  subject: Subject,
  profile: ExperienceProfile,
  antiFit: number,
  confidence: number,
): string[] {
  const caveats = [
    antiFit > 0.12 ? "有部分内容可能碰到你的避雷点，建议先看简介或短评确认。" : undefined,
    confidence < 0.55 ? "本地数据置信度一般，推荐理由需要后续反馈校准。" : undefined,
    profile.facets.contentWarnings.length ? `注意：${profile.facets.contentWarnings.join("、")}。` : undefined,
    subject.ratingTotal && subject.ratingTotal < 100 ? "评分样本较少，质量信号不够稳。" : undefined,
  ];
  return unique(caveats).slice(0, 3);
}

function dedupeByTitle(items: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const result: Recommendation[] = [];
  for (const item of items) {
    const key = normalizeText(item.subject.nameCn || item.subject.name)
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function diversify(items: Recommendation[]): Recommendation[] {
  const selected: Recommendation[] = [];
  const remaining = [...items];
  while (remaining.length && selected.length < items.length) {
    if (!selected.length) {
      selected.push(remaining.shift()!);
      continue;
    }
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const similarityToSelected = Math.max(
        ...selected.map((item) => cosineText(candidate.profile.profileText, item.profile.profileText)),
      );
      const score = candidate.score - similarityToSelected * 0.08;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

export function formatRecommendation(item: Recommendation, index: number): string {
  const subject = item.subject;
  const title = subject.nameCn || subject.name;
  const meta = [
    yearFromDate(subject.date),
    subject.platform,
    subject.eps ? `${subject.eps} 集` : undefined,
    subject.score ? `评分 ${subject.score.toFixed(1)}` : undefined,
  ]
    .filter(Boolean)
    .join(" / ");
  const reasons = item.reasons.map((reason) => `  - ${reason}`).join("\n");
  const caveats = item.caveats.length ? `\n  可能不适合：${item.caveats.join(" ")}` : "";
  const source = subject.siteUrl ? `\n  来源：${subject.siteUrl}` : "";
  return `${index + 1}. ${title} (${meta || "资料待补"})\n  匹配度：${Math.round(item.score * 100)}\n${reasons}${caveats}${source}`;
}
