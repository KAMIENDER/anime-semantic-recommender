export type SourceName = "seed" | "bangumi" | "anilist";

export interface Subject {
  id: string;
  source: SourceName;
  sourceId: string;
  name: string;
  nameCn: string;
  aliases: string[];
  summary: string;
  date?: string;
  platform?: string;
  eps?: number;
  score?: number;
  ratingTotal?: number;
  rank?: number;
  collectionTotal?: number;
  tags: string[];
  image?: string;
  siteUrl?: string;
  raw?: unknown;
}

export interface ExperienceProfile {
  subjectId: string;
  profileText: string;
  facets: {
    themes: string[];
    emotionalTexture?: string;
    narrativeCore?: string;
    pacing?: string;
    conflictStyle?: string;
    relationshipPattern?: string;
    viewerAftertaste?: string;
    visualStyle?: string;
    notFor: string[];
    contentWarnings: string[];
  };
  confidence: number;
  model: string;
  sourceHash: string;
  generatedAt: string;
}

export interface Intent {
  raw: string;
  idealProfileText: string;
  positiveSemantics: string[];
  negativeSemantics: string[];
  anchors: string[];
  hardFilters: {
    nsfw: boolean;
    minRatingTotal: number;
    minCollectionTotal: number;
  };
  softPreferences: {
    popularity: "mixed" | "popular" | "mid" | "explore";
    novelty: "low" | "normal" | "high";
  };
}

export type FeedbackType =
  | "seen_liked"
  | "seen_ok"
  | "seen_disliked"
  | "want_watch"
  | "not_interested"
  | "too_popular"
  | "too_obscure"
  | "direction_right"
  | "direction_wrong";

export interface Feedback {
  subjectId: string;
  type: FeedbackType;
  comment?: string;
  createdAt: string;
}

export interface Recommendation {
  subject: Subject;
  profile: ExperienceProfile;
  score: number;
  reasons: string[];
  caveats: string[];
  debug: Record<string, number | string | boolean>;
}
