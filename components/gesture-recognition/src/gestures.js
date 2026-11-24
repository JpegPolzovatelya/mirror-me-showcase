export const GESTURES = {
  Open_Palm: { label: 'Ладонь', icon: '✋', instruction: 'Раскрой ладонь и выпрями все пальцы.' },
  Closed_Fist: { label: 'Кулак', icon: '✊', instruction: 'Сожми пальцы в кулак. Большой палец положи поверх остальных.' },
  Victory: { label: 'Победа', icon: '✌️', instruction: 'Подними указательный и средний пальцы. Остальные согни.' },
  Pointing_Up: { label: 'Указательный палец', icon: '☝️', instruction: 'Подними только указательный палец вверх. Остальные пальцы согни.' },
};
export const TASKS = {
  Give: { label: 'Дай', icon: '🤲', instruction: 'Поверни ладонь вверх. Дважды согни пальцы к себе и снова раскрой ладонь, как будто подзываешь.' },
  Take: { label: 'На', icon: '🤲', instruction: 'Раскрой ладонь вверх и плавно протяни её к камере, будто предлагаешь предмет.' },
  Hello: { label: 'Привет', icon: '👋', instruction: 'Раскрой ладонь и помаши рукой влево-вправо несколько раз, чтобы поздороваться.' },
  Goodbye: { label: 'Пока', icon: '👋', instruction: 'Ладонь к камере. Дважды согни четыре пальца к ладони и снова выпрями. Руку держи на месте.' },
};
export const LABELS = { ...Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, v.label])), Wave: 'Махание рукой', unknown: 'Жест не определён', none: 'Рука не видна' };

export function classifyModel(categories = [], threshold = 0.65) {
  const best = [...categories].filter(c => Number.isFinite(c.score)).sort((a, b) => b.score - a.score)[0];
  const confidence = Math.max(0, Math.min(1, best?.score ?? 0));
  // Keep all model categories: an unsupported winner must never be replaced by a weaker allowed class.
  return { gesture: best && Object.hasOwn(GESTURES, best.categoryName) && confidence >= threshold ? best.categoryName : 'unknown', confidence };
}

const vector = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const norm = v => Math.hypot(...v);
const distance = (a, b) => norm(vector(a, b));
function angle(a, b, c) {
  const u = vector(a, b), v = vector(c, b), length = norm(u) * norm(v);
  if (length < 1e-12) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((s, x, i) => s + x * v[i], 0) / length))) * 180 / Math.PI;
}

export function normalizeLandmarks(points) {
  if (!Array.isArray(points) || points.length !== 21 || points.some(p => !p || !['x', 'y', 'z'].every(k => Number.isFinite(p[k])))) return null;
  const scale = distance(points[0], points[9]);
  if (scale < 1e-8) return null;
  return points.map(p => ({ x: (p.x - points[0].x) / scale, y: (p.y - points[0].y) / scale, z: (p.z - points[0].z) / scale }));
}

export function classifyGeometry(points) {
  const p = normalizeLandmarks(points);
  if (!p) return { gesture: 'unknown', confidence: null, features: null };
  const fingerMetrics = [5, 9, 13, 17].map(base => ({
    bend: angle(p[base], p[base + 1], p[base + 3]),
    reach: distance(p[base + 3], p[0]) / distance(p[base + 1], p[0]),
  }));
  const fingers = fingerMetrics.map(({ bend, reach }) => {
    return bend > 155 && reach > 1.15 ? 'straight' : bend < 125 && reach < 1.1 ? 'bent' : 'ambiguous';
  });
  const thumbBend = angle(p[1], p[2], p[4]);
  const thumbTipDistance = distance(p[4], p[5]);
  const thumbStraight = thumbBend > 150 && thumbTipDistance > 0.45;
  const thumbNear = thumbTipDistance < 0.8;
  let gesture = 'unknown';
  if (fingers.every(f => f === 'straight') && thumbStraight) gesture = 'Open_Palm';
  else if (fingers.every(f => f === 'bent') && thumbNear) gesture = 'Closed_Fist';
  else if (fingers.join(',') === 'straight,straight,bent,bent' && thumbNear) gesture = 'Victory';
  else if (fingers.join(',') === 'straight,bent,bent,bent' && thumbNear) gesture = 'Pointing_Up';
  // A rule has no calibrated probability. Never display its heuristic as model confidence.
  return { gesture, confidence: null, features: { fingers, fingerMetrics, thumbBend, thumbTipDistance, thumbStraight, thumbNear } };
}

export function interpretResult(raw, { timestamp = Date.now(), threshold = 0.65, width = 1, height = 1 } = {}) {
  const hands = (raw.landmarks ?? []).map((points, i) => ({
    hand: raw.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
    model: classifyModel(raw.gestures?.[i], threshold),
    baseline: classifyGeometry(raw.worldLandmarks?.[i]?.length === 21 ? raw.worldLandmarks[i] : points.map(p => ({ x: p.x * width, y: p.y * height, z: p.z * width }))),
    landmarks: points,
    worldLandmarks: raw.worldLandmarks?.[i] ?? null,
    imageAspect: width / height,
  }));
  return { timestamp, status: hands.length ? 'hand_detected' : 'none', hands };
}

export class StableGesture {
  constructor(holdMs = 450) { this.holdMs = holdMs; this.reset(); }
  reset() { this.candidate = null; this.since = 0; }
  update(gesture, timestamp) {
    if (!Object.hasOwn(GESTURES, gesture)) { this.reset(); return gesture; }
    if (gesture !== this.candidate || timestamp < this.since) { this.candidate = gesture; this.since = timestamp; }
    return timestamp - this.since >= this.holdMs ? gesture : 'unknown';
  }
}

export function computeMetrics(samples, method) {
  const classes = [...Object.keys(GESTURES), 'Wave', 'unknown', 'none'];
  const rows = samples.filter(s => classes.includes(s.expected) && classes.includes(s[method]));
  const matrix = classes.map(a => classes.map(b => rows.filter(s => s.expected === a && s[method] === b).length));
  const supported = classes.map((name, i) => {
    const tp = matrix[i][i], actual = matrix[i].reduce((a, b) => a + b, 0), predicted = matrix.reduce((a, r) => a + r[i], 0);
    return { name, support: actual, precision: predicted ? tp / predicted : 0, recall: actual ? tp / actual : 0, f1: actual + predicted ? 2 * tp / (actual + predicted) : 0 };
  });
  const present = supported.filter(c => c.support > 0);
  return { count: rows.length, classes, matrix, perClass: supported, accuracy: rows.length ? matrix.reduce((s, r, i) => s + r[i], 0) / rows.length : null, macroF1: present.length ? present.reduce((s, c) => s + c.f1, 0) / present.length : null, macroScope: 'classes_with_ground_truth_support', completeCoverage: supported.every(c => c.support > 0) };
}
