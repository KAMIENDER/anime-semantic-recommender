import type { Intent, Recommendation } from "../types.js";
import { generateJson } from "../llm/openai.js";

interface RerankItem {
  subject_id: string;
  fit_score: number;
  why?: string;
  risk?: string;
}

export async function rerankWithLlm(
  intent: Intent,
  recommendations: Recommendation[],
): Promise<Recommendation[]> {
  if (recommendations.length < 2) return recommendations;

  const payload = recommendations.slice(0, 18).map((item) => ({
    subject_id: item.subject.id,
    title: item.subject.nameCn || item.subject.name,
    facts: {
      year: item.subject.date?.slice(0, 4),
      platform: item.subject.platform,
      eps: item.subject.eps,
      score: item.subject.score,
      ratingTotal: item.subject.ratingTotal,
      tags: item.subject.tags.slice(0, 12),
    },
    experience_profile_text: item.profile.profileText,
    not_for: item.profile.facets.notFor,
  }));

  const prompt = `
你是中文动漫推荐的精排器。请基于用户 ideal_profile_text 和候选作品体验画像排序。
不要新增候选，只能重排给定 subject_id。
打分重点：
1. 是否匹配核心体验，不是表面标签。
2. 是否避开用户负向需求。
3. 质量和置信度是否足够。
4. 推荐理由要说明为什么对味，风险要说明可能不适合点。

用户 ideal_profile_text:
${intent.idealProfileText}

正向: ${intent.positiveSemantics.join("、")}
负向: ${intent.negativeSemantics.join("、")}

候选:
${JSON.stringify(payload, null, 2)}

输出 JSON 数组:
[
  {"subject_id": "...", "fit_score": 0.0, "why": "...", "risk": "..."}
]
`;

  const ranked = await generateJson<RerankItem[]>(prompt);
  if (!ranked?.length) return recommendations;

  const rankMap = new Map(ranked.map((item, index) => [item.subject_id, { ...item, index }]));
  return [...recommendations]
    .map((item) => {
      const llm = rankMap.get(item.subject.id);
      if (!llm) return item;
      return {
        ...item,
        score: item.score * 0.55 + Math.max(0, Math.min(1, llm.fit_score)) * 0.45,
        reasons: llm.why ? [llm.why, ...item.reasons.slice(0, 2)] : item.reasons,
        caveats: llm.risk ? [llm.risk, ...item.caveats.slice(0, 1)] : item.caveats,
        debug: { ...item.debug, llmFit: llm.fit_score, llmRank: llm.index },
      };
    })
    .sort((a, b) => b.score - a.score);
}
