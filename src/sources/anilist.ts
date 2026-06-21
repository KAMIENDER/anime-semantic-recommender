import type { Subject } from "../types.js";
import { normalizeText, unique } from "../utils/text.js";
import { fetchJson } from "./http.js";

interface AniListResponse {
  data?: {
    Page?: {
      media?: AniListMedia[];
    };
  };
}

interface AniListMedia {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
    userPreferred?: string;
  };
  description?: string;
  startDate?: { year?: number; month?: number; day?: number };
  format?: string;
  episodes?: number;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  genres?: string[];
  tags?: Array<{ name: string; rank: number; isMediaSpoiler?: boolean }>;
  coverImage?: { large?: string; medium?: string };
  siteUrl?: string;
}

const ENDPOINT = "https://graphql.anilist.co";

export async function searchAniListAnime(keyword: string, limit = 10): Promise<Subject[]> {
  const query = `
    query SearchAnime($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME, sort: [POPULARITY_DESC]) {
          id
          title { romaji english native userPreferred }
          description(asHtml: false)
          startDate { year month day }
          format
          episodes
          averageScore
          meanScore
          popularity
          genres
          tags { name rank isMediaSpoiler }
          coverImage { large medium }
          siteUrl
        }
      }
    }
  `;

  const result = await fetchJson<AniListResponse>(
    ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { search: keyword, perPage: limit } }),
    },
    1,
  );

  return result.data?.Page?.media?.map(fromMedia) ?? [];
}

function fromMedia(media: AniListMedia): Subject {
  const title = media.title.userPreferred ?? media.title.romaji ?? media.title.english ?? media.title.native ?? "";
  const date =
    media.startDate?.year ?
      `${media.startDate.year}-${String(media.startDate.month ?? 1).padStart(2, "0")}-${String(media.startDate.day ?? 1).padStart(2, "0")}`
    : undefined;
  const score = media.averageScore ? media.averageScore / 10 : media.meanScore ? media.meanScore / 10 : undefined;
  const tags = unique([
    ...(media.genres ?? []),
    ...(media.tags?.filter((tag) => !tag.isMediaSpoiler && tag.rank >= 50).map((tag) => tag.name) ?? []),
  ]);

  return {
    id: `anilist:${media.id}`,
    source: "anilist",
    sourceId: String(media.id),
    name: media.title.romaji ?? title,
    nameCn: media.title.native ?? media.title.english ?? title,
    aliases: unique([media.title.romaji, media.title.english, media.title.native, media.title.userPreferred]),
    summary: normalizeText(media.description ?? ""),
    date,
    platform: media.format,
    eps: media.episodes,
    score,
    ratingTotal: undefined,
    rank: undefined,
    collectionTotal: media.popularity,
    tags,
    image: media.coverImage?.large ?? media.coverImage?.medium,
    siteUrl: media.siteUrl,
    raw: media,
  };
}
