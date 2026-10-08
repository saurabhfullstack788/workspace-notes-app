const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(prior|previous)\s+(context|instructions)/i,
  /forget\s+(all\s+)?(prior|previous|your)\s+(context|instructions|rules)/i,
  /output\s+(the\s+)?(system\s+)?prompt/i,
  /reveal\s+(the\s+)?(system\s+)?prompt/i,
  /return\s+confidential\s+data/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?\s*:/i,
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\buser\s*:\s*/i,
];

export function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

export function sanitizeForPrompt(text: string): string {
  return text
    .replace(/[<>]/g, '')
    .replace(/```/g, '')
    .slice(0, 5000);
}
