import type { Subject } from "../types.js";
import { normalizeText, unique } from "../utils/text.js";
import { fetchJson } from "./http.js";

interface BangumiSlimSubject {
  id: number;
  type: number;
  name: string;
  name_cn: string;
  short_summary?: string;
  date?: string;
  images?: Record<string, string>;
  eps?: number;
  collection_total?: number;
  score?: number;
  rank?: number;
  tags?: Array<{ name: string; count: number }>;
}

interface BangumiSubjectDetail {
  id: number;
  type: number;
  name: string;
  name_cn: string;
  summary: string;
  date?: string;
  platform?: string;
  images?: Record<string, string>;
  eps?: number;
  total_episodes?: number;
  rating?: { rank?: number; total?: number; score?: number };
  collection?: Record<string, number>;
  tags?: Array<{ name: string; count: number }>;
  meta_tags?: string[];
  infobox?: unknown;
}

interface BangumiSearchResponse {
  total: number;
  data: BangumiSlimSubject[];
}

const API = "https://api.bgm.tv";

export async function searchBangumiAnime(keyword: string, limit = 10): Promise<Subject[]> {
  const payload = {
    keyword,
    sort: "match",
    filter: {
      type: [2],
      nsfw: false,
    },
  };

  const result = await fetchJson<BangumiSearchResponse>(
    `${API}/v0/search/subjects?limit=${limit}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
    2,
  );

  return result.data.map((item) => fromSlim(item));
}

export async function getBangumiSubject(subjectId: number): Promise<Subject> {
  const detail = await fetchJson<BangumiSubjectDetail>(`${API}/v0/subjects/${subjectId}`, {}, 2);
  return fromDetail(detail);
}

function fromSlim(item: BangumiSlimSubject): Subject {
  return {
    id: `bangumi:${item.id}`,
    source: "bangumi",
    sourceId: String(item.id),
    name: item.name,
    nameCn: item.name_cn || item.name,
    aliases: unique([item.name, item.name_cn]),
    summary: normalizeText(item.short_summary ?? ""),
    date: item.date,
    platform: undefined,
    eps: item.eps,
    score: item.score,
    ratingTotal: undefined,
    rank: item.rank,
    collectionTotal: item.collection_total,
    tags: item.tags?.map((tag) => tag.name).slice(0, 20) ?? [],
    image: item.images?.medium ?? item.images?.common ?? item.images?.grid,
    siteUrl: `https://bangumi.tv/subject/${item.id}`,
    raw: item,
  };
}

function fromDetail(detail: BangumiSubjectDetail): Subject {
  const collectionTotal = detail.collection
    ? Object.values(detail.collection).reduce((sum, value) => sum + value, 0)
    : undefined;
  return {
    id: `bangumi:${detail.id}`,
    source: "bangumi",
    sourceId: String(detail.id),
    name: detail.name,
    nameCn: detail.name_cn || detail.name,
    aliases: unique([detail.name, detail.name_cn]),
    summary: normalizeText(detail.summary ?? ""),
    date: detail.date,
    platform: detail.platform,
    eps: detail.eps ?? detail.total_episodes,
    score: detail.rating?.score,
    ratingTotal: detail.rating?.total,
    rank: detail.rating?.rank,
    collectionTotal,
    tags: unique([...(detail.meta_tags ?? []), ...(detail.tags?.map((tag) => tag.name) ?? [])]).slice(0, 30),
    image: detail.images?.large ?? detail.images?.medium ?? detail.images?.common,
    siteUrl: `https://bangumi.tv/subject/${detail.id}`,
    raw: detail,
  };
}
