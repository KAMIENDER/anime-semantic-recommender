import type { ExperienceProfile, Subject } from "../types.js";
import { generateJson } from "../llm/openai.js";
import { normalizeText, stableHash, unique } from "../utils/text.js";

interface ProfileJson {
  experience_profile_text?: string;
  facets?: Partial<ExperienceProfile["facets"]>;
  confidence?: number;
}

const MOOD_MAP: Array<[string[], string]> = [
  [["治愈", "日常", "空气系"], "整体气质偏温柔、低压力，适合想看慢下来的人。"],
  [["致郁", "黑暗", "反乌托邦"], "情绪更沉重，可能有压抑、黑暗或较强后劲。"],
  [["悬疑", "推理", "伏笔"], "观看体验更依赖谜团、结构和信息逐步揭露。"],
  [["旅行", "公路片"], "叙事常通过旅途和短暂停留展开，重点是路上的相遇和变化。"],
  [["青春", "友情", "成长"], "核心体验更靠友情、成长和自我突破推动。"],
  [["奇幻", "妖怪", "科幻"], "有明确非现实设定，但设定是否压过人物需要继续判断。"],
  [["热血", "战斗", "少年漫"], "冲突和爽感可能更依赖战斗、升级或目标达成。"],
  [["后宫", "卖肉", "福利"], "可能包含后宫、擦边或服务性表达，需要按用户避雷降权。"],
];

export async function buildExperienceProfile(subject: Subject): Promise<ExperienceProfile> {
  const sourceHash = subjectHash(subject);
  const llmProfile = await buildWithLlm(subject);
  if (llmProfile) {
    return {
      subjectId: subject.id,
      profileText: normalizeText(llmProfile.experience_profile_text ?? fallbackProfileText(subject)),
      facets: normalizeFacets(llmProfile.facets, subject),
      confidence: llmProfile.confidence ?? heuristicConfidence(subject),
      model: "openai-experience-profile-v0",
      sourceHash,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    subjectId: subject.id,
    profileText: fallbackProfileText(subject),
    facets: fallbackFacets(subject),
    confidence: heuristicConfidence(subject),
    model: "local-heuristic-v0",
    sourceHash,
    generatedAt: new Date().toISOString(),
  };
}

export function subjectHash(subject: Subject): string {
  return stableHash(
    JSON.stringify({
      name: subject.name,
      nameCn: subject.nameCn,
      summary: subject.summary,
      tags: subject.tags,
      score: subject.score,
      ratingTotal: subject.ratingTotal,
    }),
  );
}

async function buildWithLlm(subject: Subject): Promise<ProfileJson | null> {
  const prompt = `
你是中文动漫推荐系统的作品体验画像生成器。
请基于事实字段生成 JSON，不要编造具体剧情。重点描述观看体验，不要堆标签。

作品:
${JSON.stringify(
  {
    title: subject.nameCn || subject.name,
    original_title: subject.name,
    aliases: subject.aliases,
    summary: subject.summary,
    tags: subject.tags,
    date: subject.date,
    platform: subject.platform,
    eps: subject.eps,
  },
  null,
  2,
)}

输出 JSON:
{
  "experience_profile_text": "一段完整自然语言体验画像，说明核心体验、情绪、叙事、关系、冲突风格、适合和不适合的人",
  "facets": {
    "themes": [],
    "emotionalTexture": "",
    "narrativeCore": "",
    "pacing": "",
    "conflictStyle": "",
    "relationshipPattern": "",
    "viewerAftertaste": "",
    "visualStyle": "",
    "notFor": [],
    "contentWarnings": []
  },
  "confidence": 0.0
}
`;
  return generateJson<ProfileJson>(prompt);
}

function fallbackProfileText(subject: Subject): string {
  const title = subject.nameCn || subject.name;
  const tagText = subject.tags.length ? `已知标签包括${subject.tags.slice(0, 10).join("、")}。` : "";
  const mapped = MOOD_MAP.filter(([terms]) => terms.some((term) => subject.tags.includes(term)))
    .map(([, sentence]) => sentence)
    .join("");
  const summary = subject.summary ? `资料简介：${subject.summary}` : "资料简介较少，需要依赖标签和用户反馈校准。";

  return normalizeText(
    `${title}的本地画像基于公开元数据生成。${summary}${tagText}${mapped}这是一份低到中等置信度的体验描述，后续应由 LLM 或人工反馈补充更细的叙事、情绪和关系判断。`,
  );
}

function fallbackFacets(subject: Subject): ExperienceProfile["facets"] {
  const tags = subject.tags;
  const notFor = unique([
    tags.some((tag) => ["热血", "战斗", "少年漫"].includes(tag)) ? "不想看战斗升级的人" : undefined,
    tags.some((tag) => ["致郁", "黑暗", "反乌托邦"].includes(tag)) ? "不想看压抑或黑暗后劲的人" : undefined,
    tags.some((tag) => ["后宫", "卖肉", "福利"].includes(tag)) ? "避雷后宫或卖肉的人" : undefined,
    subject.eps && subject.eps > 40 ? "不想看长篇的人" : undefined,
  ]);

  return {
    themes: tags.slice(0, 8),
    emotionalTexture: inferByTags(tags, [
      [["治愈", "日常"], "温柔、低压力"],
      [["致郁", "黑暗"], "沉重、压抑"],
      [["悬疑"], "紧张、思辨"],
      [["青春"], "明亮、成长"],
    ]),
    narrativeCore: subject.summary ? subject.summary.slice(0, 100) : "资料不足，需反馈校准",
    pacing: inferByTags(tags, [
      [["慢节奏", "空气系", "日常"], "慢节奏"],
      [["悬疑", "战斗", "热血"], "中快节奏"],
    ]),
    conflictStyle: inferByTags(tags, [
      [["战斗", "热血"], "战斗和目标达成驱动"],
      [["治愈", "日常", "空气系"], "低冲突，关系和日常驱动"],
      [["悬疑"], "谜团和信息揭露驱动"],
    ]),
    relationshipPattern: inferByTags(tags, [
      [["友情", "青春"], "友情和成长关系"],
      [["旅行", "公路片"], "旅途中的短暂相遇和同行"],
      [["妖怪"], "人与非人之间的连接"],
    ]),
    viewerAftertaste: inferByTags(tags, [
      [["治愈"], "温柔、放松"],
      [["致郁", "黑暗"], "沉重、有后劲"],
      [["哲学"], "思辨、有余韵"],
    ]),
    visualStyle: subject.platform ?? "未知",
    notFor,
    contentWarnings: unique([
      tags.includes("致郁") || tags.includes("黑暗") ? "压抑主题" : undefined,
      tags.includes("战争") ? "战争相关内容" : undefined,
      tags.includes("卖肉") ? "服务性表达" : undefined,
    ]),
  };
}

function normalizeFacets(
  facets: Partial<ExperienceProfile["facets"]> | undefined,
  subject: Subject,
): ExperienceProfile["facets"] {
  const fallback = fallbackFacets(subject);
  return {
    themes: unique([...(facets?.themes ?? []), ...fallback.themes]).slice(0, 12),
    emotionalTexture: facets?.emotionalTexture ?? fallback.emotionalTexture,
    narrativeCore: facets?.narrativeCore ?? fallback.narrativeCore,
    pacing: facets?.pacing ?? fallback.pacing,
    conflictStyle: facets?.conflictStyle ?? fallback.conflictStyle,
    relationshipPattern: facets?.relationshipPattern ?? fallback.relationshipPattern,
    viewerAftertaste: facets?.viewerAftertaste ?? fallback.viewerAftertaste,
    visualStyle: facets?.visualStyle ?? fallback.visualStyle,
    notFor: unique([...(facets?.notFor ?? []), ...fallback.notFor]).slice(0, 8),
    contentWarnings: unique([...(facets?.contentWarnings ?? []), ...fallback.contentWarnings]).slice(0, 8),
  };
}

function inferByTags(tags: string[], rules: Array<[string[], string]>): string | undefined {
  return rules.find(([needles]) => needles.some((needle) => tags.includes(needle)))?.[1];
}

function heuristicConfidence(subject: Subject): number {
  const hasSummary = subject.summary.length > 20 ? 0.25 : 0.05;
  const tagScore = Math.min(0.25, subject.tags.length * 0.025);
  const ratingScore = Math.min(0.25, Math.log10((subject.ratingTotal ?? subject.collectionTotal ?? 1) + 1) / 16);
  const sourceScore = subject.source === "seed" ? 0.3 : 0.15;
  return Math.min(0.9, sourceScore + hasSummary + tagScore + ratingScore);
}
