import type { RiskTier } from "./riskScoring";

export interface QuestionnaireResult {
  responses: Record<string, string>;
  passed: boolean;
  score: number;
}

export const BASIC_QUESTIONS = [
  { id: "reason", label: "Why are you joining this server?", placeholder: "Tell us why you want to join..." },
  { id: "source", label: "How did you find this server?", placeholder: "e.g. friend invite, Discord search..." },
  { id: "rules", label: 'Agree to the rules? Type "yes" to confirm.', placeholder: "yes" },
];

export const DETAILED_QUESTIONS = [
  { id: "reason", label: "Why are you joining this server?", placeholder: "Please be specific..." },
  { id: "source", label: "How did you find this server?", placeholder: "e.g. friend invite, Discord search..." },
  { id: "rules", label: 'Agree to the rules? Type "yes" to confirm.', placeholder: "yes" },
  { id: "about", label: "Tell us a little about yourself.", placeholder: "Your interests, age group, etc." },
  { id: "alts", label: "Any other Discord accounts in this server?", placeholder: "yes or no" },
];

export function getQuestionsForTier(tier: RiskTier) {
  return tier >= 4 ? DETAILED_QUESTIONS : BASIC_QUESTIONS;
}

export function evaluateQuestionnaire(responses: Record<string, string>): QuestionnaireResult {
  let score = 0;
  const rulesAnswer = (responses["rules"] ?? "").toLowerCase().trim();
  const reasonAnswer = (responses["reason"] ?? "").trim();
  const altsAnswer = (responses["alts"] ?? "").toLowerCase().trim();

  // Must agree to rules
  if (rulesAnswer === "yes" || rulesAnswer === "y") score += 40;

  // Reason should be substantive (more than 5 characters)
  if (reasonAnswer.length > 5) score += 30;

  // Source filled in
  if ((responses["source"] ?? "").trim().length > 2) score += 20;

  // No alt accounts (optional field)
  if (altsAnswer && (altsAnswer === "no" || altsAnswer === "n")) score += 10;
  else if (!altsAnswer) score += 10; // not asked

  const passed = score >= 60 && (rulesAnswer === "yes" || rulesAnswer === "y");
  return { responses, passed, score };
}
