#!/usr/bin/env node
import { AppDatabase } from "./storage/db.js";
import { addFeedback } from "./recommender/feedback.js";
import { formatRecommendation, recommendAnime } from "./recommender/recommend.js";
import { searchBangumiAnime } from "./sources/bangumi.js";
import { searchAniListAnime } from "./sources/anilist.js";
import type { FeedbackType } from "./types.js";

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = new AppDatabase();
  try {
    switch (args.command) {
      case "recommend":
        await commandRecommend(db, args);
        break;
      case "search":
        await commandSearch(db, args);
        break;
      case "feedback":
        commandFeedback(db, args);
        break;
      case "profile":
        commandProfile(db);
        break;
      case "help":
      case "":
        printHelp();
        break;
      default:
        throw new Error(`未知命令：${args.command}`);
    }
  } finally {
    db.close();
  }
}

async function commandRecommend(db: AppDatabase, args: ParsedArgs): Promise<void> {
  const query = args.positional.join(" ").trim();
  if (!query) throw new Error("recommend 需要一个口味描述。");
  const limit = Number(args.flags.limit ?? args.flags.n ?? 8);
  const result = await recommendAnime(db, query, {
    limit,
    noNetwork: Boolean(args.flags["no-network"]),
    refresh: Boolean(args.flags.refresh),
    useLlmRerank: args.flags["no-llm-rerank"] ? false : undefined,
  });

  if (args.flags.json) {
    console.log(
      JSON.stringify(
        {
          intent: result.intent,
          warnings: result.warnings,
          recommendations: result.recommendations.map((item) => ({
            id: item.subject.id,
            title: item.subject.nameCn || item.subject.name,
            score: item.score,
            reasons: item.reasons,
            caveats: item.caveats,
            source: item.subject.siteUrl,
            debug: item.debug,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`理解到的理想体验：\n${result.intent.idealProfileText}\n`);
  if (result.warnings.length) {
    console.log(`数据源提示：`);
    for (const warning of result.warnings.slice(0, 4)) console.log(`- ${warning}`);
    console.log("");
  }

  console.log(`推荐：\n`);
  result.recommendations.forEach((item, index) => {
    console.log(formatRecommendation(item, index));
    console.log("");
  });

  console.log("反馈示例：");
  console.log('npm run feedback -- "少女终末旅行" --seen --liked --comment "方向对"');
  console.log('npm run feedback -- "灰羽联盟" --seen --disliked --comment "太压抑"');
}

async function commandSearch(db: AppDatabase, args: ParsedArgs): Promise<void> {
  const keyword = args.positional.join(" ").trim();
  if (!keyword) throw new Error("search 需要关键词。");
  const limit = Number(args.flags.limit ?? args.flags.n ?? 8);
  const warnings: string[] = [];

  try {
    for (const subject of await searchBangumiAnime(keyword, limit)) db.upsertSubject(subject);
  } catch (error) {
    warnings.push(`Bangumi 搜索失败：${String(error).slice(0, 160)}`);
  }

  try {
    for (const subject of await searchAniListAnime(keyword, limit)) db.upsertSubject(subject);
  } catch (error) {
    warnings.push(`AniList 搜索失败：${String(error).slice(0, 160)}`);
  }

  const subjects = db
    .listSubjects()
    .filter((subject) =>
      [subject.name, subject.nameCn, ...subject.aliases]
        .join(" ")
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    )
    .slice(0, limit);

  for (const warning of warnings) console.log(`- ${warning}`);
  for (const subject of subjects) {
    console.log(`${subject.id}  ${subject.nameCn || subject.name}  ${subject.date?.slice(0, 4) ?? ""}  ${subject.siteUrl ?? ""}`);
  }
}

function commandFeedback(db: AppDatabase, args: ParsedArgs): void {
  const title = args.positional.join(" ").trim();
  if (!title) throw new Error("feedback 需要作品名或 subject id。");
  const type = feedbackTypeFromFlags(args.flags);
  const comment = typeof args.flags.comment === "string" ? args.flags.comment : undefined;
  const result = addFeedback(db, title, type, comment);
  console.log(`已记录反馈：${result}`);
}

function commandProfile(db: AppDatabase): void {
  const feedback = db.listFeedback();
  const subjects = db.listSubjects();
  console.log(`本地作品数：${subjects.length}`);
  console.log(`反馈数：${feedback.length}`);
  if (!feedback.length) return;

  for (const item of feedback.slice(0, 20)) {
    const subject = db.getSubject(item.subjectId);
    console.log(`- ${item.type}: ${subject?.nameCn || subject?.name || item.subjectId}${item.comment ? ` (${item.comment})` : ""}`);
  }
}

function feedbackTypeFromFlags(flags: Record<string, string | boolean>): FeedbackType {
  if (flags.seen && flags.liked) return "seen_liked";
  if (flags.seen && flags.ok) return "seen_ok";
  if (flags.seen && flags.disliked) return "seen_disliked";
  if (flags.want) return "want_watch";
  if (flags["not-interested"]) return "not_interested";
  if (flags["too-popular"]) return "too_popular";
  if (flags["too-obscure"]) return "too_obscure";
  if (flags["direction-right"]) return "direction_right";
  if (flags["direction-wrong"]) return "direction_wrong";
  throw new Error(
    "请提供反馈类型，例如 --seen --liked、--seen --disliked、--want、--not-interested、--too-popular、--direction-right。",
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    if (rawValue !== undefined) {
      flags[rawKey] = rawValue;
      continue;
    }

    const next = rest[i + 1];
    if (next && !next.startsWith("--") && ["limit", "n", "comment"].includes(rawKey)) {
      flags[rawKey] = next;
      i += 1;
    } else {
      flags[rawKey] = true;
    }
  }

  return { command, positional, flags };
}

function printHelp(): void {
  console.log(`
anime-recommend 本地语义动漫推荐 MVP

用法：
  npm run recommend -- "想看像芙莉莲那种，有余韵但不要王道热血"
  npm run recommend -- "想看安静的旅途感" -- --limit 5 --no-network
  npm run search -- "葬送的芙莉莲"
  npm run feedback -- "少女终末旅行" -- --seen --liked --comment "方向对"
  npm run profile

环境变量：
  OPENAI_API_KEY              可选，开启 LLM 画像和精排
  ANIME_REC_USE_LLM=0         关闭 LLM
  ANIME_REC_USE_EMBEDDINGS=1  开启 OpenAI embedding 预留路径
  ANIME_REC_DB=...            指定 SQLite 路径
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
