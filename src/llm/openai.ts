import OpenAI from "openai";
import { config } from "../config.js";

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!config.useLlm && !config.useEmbeddings) return null;
  client ??= new OpenAI();
  return client;
}

export async function generateText(prompt: string): Promise<string | null> {
  const openai = getClient();
  if (!openai || !config.useLlm) return null;

  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      input: prompt,
    });
    return response.output_text?.trim() || null;
  } catch (error) {
    console.warn(`[llm] OpenAI generation failed; using fallback. ${String(error)}`);
    return null;
  }
}

export async function generateJson<T>(prompt: string): Promise<T | null> {
  const text = await generateText(prompt);
  if (!text) return null;

  const jsonText = extractJson(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const openai = getClient();
  if (!openai || !config.useEmbeddings) return null;

  try {
    const response = await openai.embeddings.create({
      model: config.embeddingModel,
      input: texts,
      dimensions: config.embeddingDimensions,
    });
    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.warn(`[llm] OpenAI embedding failed; using lexical fallback. ${String(error)}`);
    return null;
  }
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) return text.slice(firstObject, lastObject + 1);
  const firstArray = text.indexOf("[");
  const lastArray = text.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) return text.slice(firstArray, lastArray + 1);
  return null;
}
