export type ModerationVerdict = {
  isExcessive: boolean;
  aiResponseText: string;
  toxicityScore: number;
  verdict: string;
  reasons: string[];
  suggestedAction: string;
};

export function evaluateChatContent(
  text: string,
  senderName: string,
  config: { enabled?: boolean; sensitivity?: string; activeAiName?: string; autoMuteAfterWarnings?: number },
  previousOffenses = 0
): ModerationVerdict {
  const normalized = (text || '').trim();
  const enabled = config.enabled !== false;

  if (!enabled || !normalized) {
    return {
      isExcessive: false,
      aiResponseText: '',
      toxicityScore: 0,
      verdict: 'SAFE',
      reasons: [],
      suggestedAction: 'NONE',
    };
  }

  const lower = normalized.toLowerCase();
  const banned = ['hate', 'kill yourself', 'terror', 'spam', 'nuke'];
  const reasons = banned.filter((term) => lower.includes(term));
  const severity = Math.min(1, (reasons.length + previousOffenses * 0.2) / 3);

  if (!reasons.length && severity < 0.6) {
    return {
      isExcessive: false,
      aiResponseText: '',
      toxicityScore: 0,
      verdict: 'SAFE',
      reasons: [],
      suggestedAction: 'NONE',
    };
  }

  const faker = config.activeAiName || 'Aegis AI';
  const message = `${faker} alertou que a mensagem de ${senderName || 'Jogador'} excedeu a tolerância do chat e foi revisada para manter a comunidade segura.`;

  return {
    isExcessive: true,
    aiResponseText: message,
    toxicityScore: Math.round((severity + reasons.length * 0.25) * 100),
    verdict: 'EXCESSIVE',
    reasons,
    suggestedAction: previousOffenses >= (config.autoMuteAfterWarnings || 3) ? 'MUTE' : 'WARN',
  };
}
