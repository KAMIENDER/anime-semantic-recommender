import type { Feedback, Intent, Subject } from "../types.js";
import { generateJson } from "../llm/openai.js";
import { unique } from "../utils/text.js";

interface IntentJson {
  ideal_profile_text?: string;
  positive_semantics?: string[];
  negative_semantics?: string[];
  hard_filters?: Partial<Intent["hardFilters"]>;
  soft_preferences?: Partial<Intent["softPreferences"]>;
}

const NEGATIVE_TERMS = ["王道热血", "打怪升级", "后宫", "卖肉", "致郁", "压抑", "长篇", "剧场版", "恐怖", "猎奇"];
const POSITIVE_TERMS = [
  "时间流逝",
  "关系余韵",
  "余韵",
  "慢节奏",
  "世界观",
  "治愈",
  "旅行",
  "日常",
  "悬疑",
  "群像",
  "成长",
  "温柔",
  "怅然",
  "关系",
  "陪伴",
  "错过",
];

export async function parseIntent(
  query: string,
  subjects: Subject[],
  feedback: Feedback[],
): Promise<Intent> {
  const anchors = detectAnchors(query, subjects);
  const llmIntent = await buildWithLlm(query, anchors);
  const fallback = fallbackIntent(query, anchors, feedback);

  return {
    raw: query,
    idealProfileText: llmIntent?.ideal_profile_text ?? fallback.idealProfileText,
    positiveSemantics: unique([...(llmIntent?.positive_semantics ?? []), ...fallback.positiveSemantics]),
    negativeSemantics: unique([...(llmIntent?.negative_semantics ?? []), ...fallback.negativeSemantics]),
    anchors,
    hardFilters: {
      ...fallback.hardFilters,
      ...(llmIntent?.hard_filters ?? {}),
    },
    softPreferences: {
      ...fallback.softPreferences,
      ...(llmIntent?.soft_preferences ?? {}),
    },
  };
}

function detectAnchors(query: string, subjects: Subject[]): string[] {
  const normalized = query.toLowerCase();
  return subjects
    .filter((subject) =>
      [subject.name, subject.nameCn, ...subject.aliases]
        .filter((title) => title.length >= 2)
        .some((title) => normalized.includes(title.toLowerCase())),
    )
    .map((subject) => subject.id);
}

async function buildWithLlm(query: string, anchorIds: string[]): Promise<IntentJson | null> {
  const prompt = `
你是中文动漫推荐系统的 taste context 建模器。
请把用户请求展开成一段 ideal_profile_text。重点是体验、情绪、叙事结构和避雷，不要只列标签。

用户请求: ${query}
已检测锚点数量: ${anchorIds.length}

输出 JSON:
{
  "ideal_profile_text": "一段自然语言理想作品画像",
  "positive_semantics": [],
  "negative_semantics": [],
  "hard_filters": {"nsfw": false, "minRatingTotal": 50, "minCollectionTotal": 100},
  "soft_preferences": {"popularity": "mixed", "novelty": "normal"}
}
`;
  return generateJson<IntentJson>(prompt);
}

function fallbackIntent(query: string, anchors: string[], feedback: Feedback[]): Intent {
  const positive = POSITIVE_TERMS.filter((term) => query.includes(term));
  const negative = NEGATIVE_TERMS.filter((term) => query.includes(`不要${term}`) || query.includes(`别${term}`) || query.includes(term));
  const explore = /冷门|小众|挖宝|深潜/.test(query);
  const popular = /热门|经典|民工漫|长篇/.test(query);
  const likedCount = feedback.filter((item) => item.type === "seen_liked").length;
  const dislikedComments = feedback
    .filter((item) => item.type === "seen_disliked" || item.type === "not_interested")
    .map((item) => item.comment)
    .filter(Boolean)
    .join("；");

  const ideal = [
    `用户请求：${query}`,
    positive.length ? `正向体验：${positive.join("、")}。` : "需要从用户自然语言里理解情绪、叙事、关系和观看后味，而不是只按题材标签匹配。",
    negative.length ? `明确避雷：${negative.join("、")}。` : "",
    anchors.length ? "用户提到的作品应作为口味锚点，不应原样重复推荐。" : "",
    likedCount ? `已有 ${likedCount} 条喜欢反馈，可优先靠近这些作品的整体体验。` : "",
    dislikedComments ? `负反馈摘要：${dislikedComments}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    raw: query,
    idealProfileText: ideal,
    positiveSemantics: positive,
    negativeSemantics: negative,
    anchors,
    hardFilters: {
      nsfw: false,
      minRatingTotal: explore ? 30 : 50,
      minCollectionTotal: explore ? 50 : 100,
    },
    softPreferences: {
      popularity: explore ? "explore" : popular ? "popular" : "mixed",
      novelty: explore ? "high" : "normal",
    },
  };
}
