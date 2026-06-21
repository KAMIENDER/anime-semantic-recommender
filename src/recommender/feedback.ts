import { AppDatabase } from "../storage/db.js";
import type { FeedbackType } from "../types.js";

export function addFeedback(
  db: AppDatabase,
  titleOrId: string,
  type: FeedbackType,
  comment?: string,
): string {
  const subject = titleOrId.includes(":") ? db.getSubject(titleOrId) : db.findSubjectByTitle(titleOrId);
  if (!subject) {
    throw new Error(`没有在本地库里找到作品：${titleOrId}。可以先跑一次 recommend/search 让它进入缓存。`);
  }
  db.addFeedback({
    subjectId: subject.id,
    type,
    comment,
    createdAt: new Date().toISOString(),
  });
  return `${subject.nameCn || subject.name} -> ${type}`;
}
