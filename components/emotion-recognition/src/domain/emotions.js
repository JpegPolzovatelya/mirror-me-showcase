export const ALL_EMOTIONS = [
  "neutral",
  "happiness",
  "surprise",
  "sadness",
  "anger",
  "disgust",
  "fear",
  "contempt",
];

export const PLAYABLE_EMOTIONS = [
  "happiness",
  "surprise",
  "sadness",
  "anger",
  "disgust",
];

export const EMOTION_NAMES_RU = {
  happiness: "Радость",
  surprise: "Удивление",
  sadness: "Грусть",
  anger: "Злость",
  disgust: "Отвращение",
  neutral: "Нейтрально",
  fear: "Страх",
  contempt: "Презрение",
};

export const EMOTION_HINTS_RU = {
  happiness: [
    "Уголки рта вверх",
    "Мягкая широкая улыбка",
  ],
  surprise: [
    "Брови выше",
    "Рот округлён",
  ],
  sadness: [
    "Уголки губ вниз",
    "Лицо мягкое и спокойное",
  ],
  anger: [
    "Брови ближе друг к другу",
    "Губы сомкнуты",
  ],
  disgust: [
    "Нос чуть наморщен",
    "Верхняя губа слегка поднята",
  ],
};

export function getEmotionName(label) {
  return EMOTION_NAMES_RU[label] ?? label;
}

export function getEmotionHint(label) {
  const hints = EMOTION_HINTS_RU[label] ?? [];
  return hints.join(" · ");
}
