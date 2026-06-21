import path from "node:path";

const root = process.cwd();

export const config = {
  rootDir: root,
  dbPath: process.env.ANIME_REC_DB ?? path.resolve(root, "data", "anime.sqlite"),
  userAgent:
    process.env.ANIME_REC_UA ??
    "anime-semantic-recommender/0.1 (local semantic anime recommender; contact: local)",
  openaiModel: process.env.ANIME_REC_LLM_MODEL ?? "gpt-5.5",
  embeddingModel: process.env.ANIME_REC_EMBED_MODEL ?? "text-embedding-3-small",
  embeddingDimensions: Number(process.env.ANIME_REC_EMBED_DIMS ?? 512),
  useLlm: process.env.ANIME_REC_USE_LLM !== "0" && Boolean(process.env.OPENAI_API_KEY),
  useEmbeddings:
    process.env.ANIME_REC_USE_EMBEDDINGS === "1" && Boolean(process.env.OPENAI_API_KEY),
};
