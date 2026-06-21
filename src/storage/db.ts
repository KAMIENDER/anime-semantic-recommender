import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { config } from "../config.js";
import { seedProfiles, seedSubjects } from "../data/seeds.js";
import type { ExperienceProfile, Feedback, Subject } from "../types.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => any;
};

interface SubjectRow {
  id: string;
  source: string;
  source_id: string;
  name: string;
  name_cn: string;
  aliases_json: string;
  summary: string;
  date: string | null;
  platform: string | null;
  eps: number | null;
  score: number | null;
  rating_total: number | null;
  rank: number | null;
  collection_total: number | null;
  tags_json: string;
  image: string | null;
  site_url: string | null;
  raw_json: string | null;
  updated_at: string;
}

interface ProfileRow {
  subject_id: string;
  profile_text: string;
  facets_json: string;
  confidence: number;
  model: string;
  source_hash: string;
  generated_at: string;
}

interface FeedbackRow {
  subject_id: string;
  feedback_type: string;
  comment: string | null;
  created_at: string;
}

export class AppDatabase {
  private db: any;

  constructor(private readonly dbPath = config.dbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.migrate();
    this.ensureSeeds();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS source_cache (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_cn TEXT NOT NULL,
        aliases_json TEXT NOT NULL,
        summary TEXT NOT NULL,
        date TEXT,
        platform TEXT,
        eps INTEGER,
        score REAL,
        rating_total INTEGER,
        rank INTEGER,
        collection_total INTEGER,
        tags_json TEXT NOT NULL,
        image TEXT,
        site_url TEXT,
        raw_json TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(source, source_id)
      );

      CREATE TABLE IF NOT EXISTS experience_profiles (
        subject_id TEXT PRIMARY KEY,
        profile_text TEXT NOT NULL,
        facets_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        model TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        generated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        subject_id TEXT NOT NULL,
        vector_kind TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY(subject_id, vector_kind, model)
      );

      CREATE TABLE IF NOT EXISTS user_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  private ensureSeeds(): void {
    for (const subject of seedSubjects()) this.upsertSubject(subject);
    for (const profile of seedProfiles()) this.upsertProfile(profile);
  }

  getCache<T>(key: string, maxAgeMs: number): T | null {
    const row = this.db
      .prepare("SELECT value_json, updated_at FROM source_cache WHERE cache_key = ?")
      .get(key) as { value_json: string; updated_at: string } | undefined;
    if (!row) return null;
    if (Date.now() - Date.parse(row.updated_at) > maxAgeMs) return null;
    return JSON.parse(row.value_json) as T;
  }

  setCache(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO source_cache(cache_key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  upsertSubject(subject: Subject): void {
    this.db
      .prepare(
        `INSERT INTO subjects(
          id, source, source_id, name, name_cn, aliases_json, summary, date, platform, eps,
          score, rating_total, rank, collection_total, tags_json, image, site_url, raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          name_cn = excluded.name_cn,
          aliases_json = excluded.aliases_json,
          summary = excluded.summary,
          date = excluded.date,
          platform = excluded.platform,
          eps = excluded.eps,
          score = excluded.score,
          rating_total = excluded.rating_total,
          rank = excluded.rank,
          collection_total = excluded.collection_total,
          tags_json = excluded.tags_json,
          image = excluded.image,
          site_url = excluded.site_url,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        subject.id,
        subject.source,
        subject.sourceId,
        subject.name,
        subject.nameCn,
        JSON.stringify(subject.aliases),
        subject.summary,
        subject.date ?? null,
        subject.platform ?? null,
        subject.eps ?? null,
        subject.score ?? null,
        subject.ratingTotal ?? null,
        subject.rank ?? null,
        subject.collectionTotal ?? null,
        JSON.stringify(subject.tags),
        subject.image ?? null,
        subject.siteUrl ?? null,
        subject.raw ? JSON.stringify(subject.raw) : null,
        new Date().toISOString(),
      );
  }

  getSubject(id: string): Subject | null {
    const row = this.db.prepare("SELECT * FROM subjects WHERE id = ?").get(id) as SubjectRow | undefined;
    return row ? this.subjectFromRow(row) : null;
  }

  findSubjectByTitle(title: string): Subject | null {
    const needle = title.trim().toLowerCase();
    const subjects = this.listSubjects();
    return (
      subjects.find((subject) =>
        [subject.name, subject.nameCn, ...subject.aliases]
          .filter(Boolean)
          .some((candidate) => candidate.toLowerCase() === needle),
      ) ??
      subjects.find((subject) =>
        [subject.name, subject.nameCn, ...subject.aliases]
          .filter(Boolean)
          .some((candidate) => candidate.toLowerCase().includes(needle) || needle.includes(candidate.toLowerCase())),
      ) ??
      null
    );
  }

  listSubjects(): Subject[] {
    const rows = this.db
      .prepare("SELECT * FROM subjects ORDER BY collection_total DESC NULLS LAST, rating_total DESC NULLS LAST")
      .all() as SubjectRow[];
    return rows.map((row) => this.subjectFromRow(row));
  }

  upsertProfile(profile: ExperienceProfile): void {
    this.db
      .prepare(
        `INSERT INTO experience_profiles(
          subject_id, profile_text, facets_json, confidence, model, source_hash, generated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(subject_id) DO UPDATE SET
          profile_text = excluded.profile_text,
          facets_json = excluded.facets_json,
          confidence = excluded.confidence,
          model = excluded.model,
          source_hash = excluded.source_hash,
          generated_at = excluded.generated_at`,
      )
      .run(
        profile.subjectId,
        profile.profileText,
        JSON.stringify(profile.facets),
        profile.confidence,
        profile.model,
        profile.sourceHash,
        profile.generatedAt,
      );
  }

  getProfile(subjectId: string): ExperienceProfile | null {
    const row = this.db
      .prepare("SELECT * FROM experience_profiles WHERE subject_id = ?")
      .get(subjectId) as ProfileRow | undefined;
    return row ? this.profileFromRow(row) : null;
  }

  listProfiles(): ExperienceProfile[] {
    const rows = this.db.prepare("SELECT * FROM experience_profiles").all() as ProfileRow[];
    return rows.map((row) => this.profileFromRow(row));
  }

  addFeedback(feedback: Feedback): void {
    this.db
      .prepare(
        `INSERT INTO user_feedback(subject_id, feedback_type, comment, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(feedback.subjectId, feedback.type, feedback.comment ?? null, feedback.createdAt);
  }

  listFeedback(): Feedback[] {
    const rows = this.db.prepare("SELECT * FROM user_feedback ORDER BY created_at DESC").all() as FeedbackRow[];
    return rows.map((row) => ({
      subjectId: row.subject_id,
      type: row.feedback_type as Feedback["type"],
      comment: row.comment ?? undefined,
      createdAt: row.created_at,
    }));
  }

  private subjectFromRow(row: SubjectRow): Subject {
    return {
      id: row.id,
      source: row.source as Subject["source"],
      sourceId: row.source_id,
      name: row.name,
      nameCn: row.name_cn,
      aliases: JSON.parse(row.aliases_json) as string[],
      summary: row.summary,
      date: row.date ?? undefined,
      platform: row.platform ?? undefined,
      eps: row.eps ?? undefined,
      score: row.score ?? undefined,
      ratingTotal: row.rating_total ?? undefined,
      rank: row.rank ?? undefined,
      collectionTotal: row.collection_total ?? undefined,
      tags: JSON.parse(row.tags_json) as string[],
      image: row.image ?? undefined,
      siteUrl: row.site_url ?? undefined,
      raw: row.raw_json ? JSON.parse(row.raw_json) : undefined,
    };
  }

  private profileFromRow(row: ProfileRow): ExperienceProfile {
    return {
      subjectId: row.subject_id,
      profileText: row.profile_text,
      facets: JSON.parse(row.facets_json) as ExperienceProfile["facets"],
      confidence: row.confidence,
      model: row.model,
      sourceHash: row.source_hash,
      generatedAt: row.generated_at,
    };
  }
}
