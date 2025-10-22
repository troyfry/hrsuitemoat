export function getOpenAIKey() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY missing");
  return k;
}
export const QA_MODEL = process.env.OPENAI_QA_MODEL ?? "gpt-4.1";
export const REVIEW_MODEL = process.env.OPENAI_REVIEW_MODEL ?? QA_MODEL;

  