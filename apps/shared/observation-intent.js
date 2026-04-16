export const OBSERVATION_INTENT_PATTERNS = [
  /\b(?:tell me what you see|describe what you see|what do you see|what can you see|what are you seeing|what is being seen)\b/i,
  /\b(?:can you see(?:\s+(?:this|that|it|me|us|here|there))?|do you see(?:\s+(?:this|that|it|me|us|here|there))?|see(?:\s+(?:this|that|it|me|us|here|there)))\b/i,
  /\b(?:look at this|check this out|scan this|show you this|look around|observe)\b/i,
  /\b(?:take a look|look here|look over here)\b/i,
  /\b(?:what's in front of you|what is in frame|camera view|camera feed|what(?:'s| is) around me)\b/i,
  /\b(?:what do you detect|what do you observe|can you see me|see me)\b/i,
  /\b(?:scan (?:the )?(?:area|room|environment|surroundings)|map (?:the )?(?:area|room|environment|surroundings))\b/i,
  /\b(?:describe (?:my|the)?\s*(?:area|room|environment|surroundings))\b/i,
  /\b(?:vision|camera)\b/i,
];

export function matchesObservationIntent(input) {
  const text = String(input || '').trim();
  if (!text) return false;
  return OBSERVATION_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}
