import { createHash } from "node:crypto";

const KNOWN_TERMS = [
  "时间流逝",
  "关系余韵",
  "慢节奏",
  "世界观",
  "战斗不是主轴",
  "王道热血",
  "打怪升级",
  "后宫",
  "卖肉",
  "治愈",
  "致郁",
  "压抑",
  "日常",
  "公路片",
  "旅途",
  "奇幻",
  "科幻",
  "悬疑",
  "群像",
  "成长",
  "孤独",
  "陪伴",
  "错过",
  "记忆",
  "温柔",
  "怅然",
  "轻松",
  "短篇",
  "长篇",
  "剧场版",
  "TV",
  "WEB",
  "老番",
  "新番",
  "中腰部",
  "冷门",
  "热门",
];

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function normalizeText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text).toLowerCase();
  const tokens = new Map<string, number>();

  for (const term of KNOWN_TERMS) {
    if (normalized.includes(term.toLowerCase())) {
      tokens.set(term.toLowerCase(), (tokens.get(term.toLowerCase()) ?? 0) + 4);
    }
  }

  const latin = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  for (const token of latin) tokens.set(token, (tokens.get(token) ?? 0) + 1);

  const cjkRuns = normalized.match(/[\u3400-\u9fffぁ-んァ-ヶー]{2,}/g) ?? [];
  for (const run of cjkRuns) {
    for (let n = 2; n <= 4; n += 1) {
      for (let i = 0; i <= run.length - n; i += 1) {
        const gram = run.slice(i, i + n);
        tokens.set(gram, (tokens.get(gram) ?? 0) + (n === 2 ? 1 : 1.4));
      }
    }
  }

  return [...tokens.entries()].flatMap(([token, weight]) =>
    Array.from({ length: Math.max(1, Math.round(weight)) }, () => token),
  );
}

export function termVector(text: string): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokenize(text)) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

export function cosineText(a: string, b: string): number {
  const va = termVector(a);
  const vb = termVector(b);
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const value of va.values()) magA += value * value;
  for (const value of vb.values()) magB += value * value;
  for (const [key, value] of va.entries()) dot += value * (vb.get(key) ?? 0);

  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
    .map((value) => value.trim())
    .filter(Boolean);
}

export function yearFromDate(date?: string): string {
  return date?.slice(0, 4) ?? "年份未知";
}
