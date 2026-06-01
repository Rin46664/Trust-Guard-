import type { RiskTier } from "./riskScoring";

export interface CaptchaChallenge {
  question: string;
  answer: string;
  type: "math" | "logic" | "sequence" | "wordpuzzle";
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSimpleMath(): CaptchaChallenge {
  const a = rand(2, 15);
  const b = rand(2, 15);
  const op = Math.random() < 0.5 ? "+" : "-";
  const answer = op === "+" ? a + b : a - b;
  return {
    question: `Solve: ${a} ${op} ${b} = ?`,
    answer: String(answer),
    type: "math",
  };
}

function generateMediumMath(): CaptchaChallenge {
  const a = rand(5, 20);
  const b = rand(2, 10);
  const c = rand(1, 9);
  const result = a * b - c;
  return {
    question: `Solve: (${a} × ${b}) − ${c} = ?`,
    answer: String(result),
    type: "math",
  };
}

function generateSequence(): CaptchaChallenge {
  const sequences = [
    { seq: [2, 4, 8, 16, "?"], answer: "32", rule: "doubles" },
    { seq: [3, 6, 9, 12, "?"], answer: "15", rule: "add3" },
    { seq: [1, 4, 9, 16, "?"], answer: "25", rule: "squares" },
    { seq: [5, 10, 20, 40, "?"], answer: "80", rule: "doubles" },
    { seq: [100, 50, 25, "?"], answer: "12.5", rule: "halves" },
    { seq: [1, 2, 4, 7, 11, "?"], answer: "16", rule: "increasing diff" },
    { seq: [2, 3, 5, 8, 13, "?"], answer: "21", rule: "fibonacci-like" },
  ];
  const picked = sequences[Math.floor(Math.random() * sequences.length)]!;
  return {
    question: `Complete the sequence: ${picked.seq.join(", ")}`,
    answer: picked.answer,
    type: "sequence",
  };
}

function generateLogic(): CaptchaChallenge {
  const challenges = [
    { question: "How many sides does a hexagon have?", answer: "6" },
    { question: "What is 2 to the power of 5?", answer: "32" },
    { question: "If a dozen eggs costs nothing, how many eggs are in 3 dozens?", answer: "36" },
    { question: "What is the next prime number after 11?", answer: "13" },
    { question: "How many minutes are in 3 hours?", answer: "180" },
    { question: "What is 15% of 200?", answer: "30" },
    { question: "A triangle has 3 sides. A pentagon has how many?", answer: "5" },
  ];
  const picked = challenges[Math.floor(Math.random() * challenges.length)]!;
  return { ...picked, type: "logic" };
}

function generateHardMath(): CaptchaChallenge {
  const a = rand(10, 30);
  const b = rand(3, 9);
  const c = rand(10, 50);
  const result = (a * b) + c;
  return {
    question: `Solve: (${a} × ${b}) + ${c} = ?`,
    answer: String(result),
    type: "math",
  };
}

export function generateCaptcha(tier: RiskTier): CaptchaChallenge {
  switch (tier) {
    case 2:
      return generateSimpleMath();
    case 3:
      return Math.random() < 0.5 ? generateMediumMath() : generateSequence();
    case 4:
      return Math.random() < 0.5 ? generateHardMath() : generateLogic();
    case 5:
    case 6:
      // Two combined — we'll show the harder one
      return Math.random() < 0.5 ? generateLogic() : generateSequence();
    default:
      return generateSimpleMath();
  }
}

export function verifyCaptcha(userAnswer: string, challenge: CaptchaChallenge): boolean {
  return userAnswer.trim().toLowerCase() === challenge.answer.toLowerCase();
}
