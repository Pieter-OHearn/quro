export const SINGLE_EMOJI_REGEX =
  /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)$/u;

export function isSingleEmoji(value: string) {
  return SINGLE_EMOJI_REGEX.test(value.trim());
}
