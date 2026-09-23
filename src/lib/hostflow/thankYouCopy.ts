import type { Language, Tone } from "@/lib/brandKit";
import { toLocalDateStr, minutesOfDayInTz } from "@/lib/availability";

// The words in a post-visit email. No model call: a tone-matched writer
// that uses what we genuinely know about the visit — first name, when it
// was, party size, occasion, whether they've been before — and never
// invents anything else. Every combination lands in 60–110 words with one
// review ask, so an email can always go out.

export type ComposeInput = {
  firstName: string;
  venueName: string;
  partySize: number;
  visitAt: Date;
  now?: Date;
  timezone: string;
  occasion: string | null;
  visitCount: number; // 1 = first time here
  tone: Tone;
  signOff: string;
  language: Language;
  /** Anything stable per visit — picks a variant so repeat guests don't get identical wording. */
  seed: string;
  /** Owner-written override; {name}, {restaurant}, {signoff} are filled in. */
  customBody?: string | null;
  customSubject?: string | null;
};

export type ComposedEmail = { subject: string; paragraphs: string[]; signOff: string; wordCount: number };

type Daypart = "morning" | "lunch" | "evening" | "late";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function pick<T>(arr: readonly T[], seed: string, salt: string): T {
  return arr[hash(seed + salt) % arr.length];
}

function daypartOf(visitAt: Date, tz: string): Daypart {
  const m = minutesOfDayInTz(visitAt, tz);
  if (m < 12 * 60) return "morning";
  if (m < 16 * 60) return "lunch";
  if (m < 21 * 60 + 30) return "evening";
  return "late";
}

/** "this evening" / "last night" — relative to when the email is written, not when the visit was. */
function whenPhrase(dp: Daypart, sameDay: boolean, lang: Language): string {
  if (lang === "es") {
    if (sameDay) return { morning: "esta mañana", lunch: "hoy", evening: "esta tarde", late: "esta noche" }[dp];
    return { morning: "ayer por la mañana", lunch: "ayer", evening: "ayer por la tarde", late: "anoche" }[dp];
  }
  if (sameDay) return { morning: "this morning", lunch: "today", evening: "this evening", late: "tonight" }[dp];
  return { morning: "yesterday morning", lunch: "yesterday", evening: "yesterday evening", late: "last night" }[dp];
}

const OCCASION_ES: Record<string, string> = {
  birthday: "cumpleaños",
  anniversary: "aniversario",
  business: "reunión de trabajo",
  celebration: "celebración",
  "date night": "cita",
};

function occasionWord(occasion: string, lang: Language): string {
  const key = occasion.trim().toLowerCase();
  if (lang === "es") return OCCASION_ES[key] ?? key;
  return key;
}

type Pools = {
  opening: readonly string[];
  regular: readonly string[];
  first: readonly string[];
  group: readonly string[];
  occasion: readonly string[];
  plain: readonly string[];
  ask: readonly string[];
  closing: readonly string[];
  /** Spare warm lines, used only when the email would otherwise come out short. */
  extra: readonly string[];
};

// {when} = "this evening"/"last night", {venue}, {occasion}
const EN: Record<Tone, Pools> = {
  WARM_FAMILY: {
    opening: [
      "It was lovely having you with us {when}. Thank you for choosing {venue}.",
      "Thank you for coming in {when} — it was a pleasure looking after you.",
      "We're so glad you came to see us {when}. Thank you for spending it with us.",
    ],
    regular: [
      "It's always good to see a familiar face; thank you for coming back to us.",
      "Seeing you again means a lot — regulars like you are what make this place feel like home.",
    ],
    first: [
      "If this was your first time with us, we hope it's the first of many.",
      "We hope your first visit gave you a real taste of what we're about.",
    ],
    group: ["Looking after your table was a treat — a full, happy table is our favourite kind."],
    occasion: [
      "Happy {occasion} once again — we hope it was everything you wanted it to be.",
      "It was an honour to be part of your {occasion}; we hope it was a good one.",
    ],
    plain: ["We hope the food, the drinks and the company were exactly what you were after."],
    ask: [
      "If you have a moment, a quick Google review would mean a great deal to our small team — it genuinely helps people find us.",
      "Would you leave us a few words on Google? It takes a minute, and it makes a real difference to a family-run place like ours.",
      "We'd be grateful for a short Google review — every one helps more than you'd think.",
    ],
    closing: ["See you again soon.", "Until next time.", "We'd love to see you again."],
    extra: ["Evenings like that are the reason we do this.", "Thank you, too, for the way you were with our team.", "It really was our pleasure."],
  },
  UPSCALE: {
    opening: [
      "Thank you for dining with us {when}. It was a pleasure to have you at {venue}.",
      "It was our pleasure to welcome you to {venue} {when}.",
      "Thank you for choosing {venue} {when}; we hope the evening was to your liking.",
    ],
    regular: ["It is always a pleasure to welcome you back.", "Your continued visits are appreciated more than you know."],
    first: ["We hope your first visit gave you a sense of what we do here.", "We hope this first evening with us was the beginning of many."],
    group: ["It was a pleasure to look after your party."],
    occasion: ["Our warmest wishes again on your {occasion}.", "It was a privilege to host your {occasion}."],
    plain: ["We trust everything was as it should be."],
    ask: [
      "Should you have a moment, we would be grateful for a brief review on Google.",
      "A few words on Google, if you have a moment, would be very much appreciated.",
      "If you enjoyed your time with us, a short Google review would mean a great deal.",
    ],
    closing: ["We look forward to welcoming you back.", "Until we see you again.", "With our thanks."],
    extra: ["Evenings such as this are what we are here for.", "It was our privilege to have you.", "We hope everything was to your satisfaction."],
  },
  FUN_LIVELY: {
    opening: [
      "Thanks for coming to {venue} {when} — you made it a good one!",
      "Thanks for hanging out with us {when}!",
      "You were with us {when} and honestly, thanks for that!",
    ],
    regular: ["Back again — we love that. Thanks for sticking with us.", "A familiar face is the best kind; thanks for coming back."],
    first: ["First time? Welcome to the club.", "If that was your first visit, we hope it won't be your last."],
    group: ["Big table, big energy — thanks for bringing the crew."],
    occasion: ["Happy {occasion} again! Hope it was a proper one.", "Celebrating your {occasion} with us? Best kind of night."],
    plain: ["Hope the food hit the spot and the drinks kept coming."],
    ask: [
      "Got a minute? A quick Google review would make our day (and help more people find the party).",
      "If you had a good time, tell Google! A short review goes a long way for us.",
      "Fancy giving us a shout on Google? A couple of lines is plenty.",
    ],
    closing: ["See you next time!", "Come back soon!", "Same time again?"],
    extra: ["Nights like that are why we open the doors.", "The team were buzzing after your table left.", "You brought the good energy."],
  },
  BEACH_BAR: {
    opening: [
      "Thanks for coming down to {venue} {when}.",
      "Good to have you with us {when} — thanks for stopping by.",
      "Thanks for spending some time with us {when}.",
    ],
    regular: ["Always good to see you back.", "Thanks for coming back — you know where we are."],
    first: ["First time here? Hope it felt easy.", "If that was your first visit, we hope it won't be the last."],
    group: ["Thanks for bringing everyone along."],
    occasion: ["Happy {occasion} again — hope it was a good one.", "Glad we could be part of your {occasion}."],
    plain: ["Hope the drinks were cold and the view did the rest."],
    ask: [
      "If you have a sec, a quick Google review helps us more than you'd think.",
      "A few words on Google would be brilliant — no pressure, and thanks either way.",
      "Fancy leaving us a Google review? Takes a minute, means a lot.",
    ],
    closing: ["See you by the water.", "Come back whenever you're passing.", "Until next time."],
    extra: ["Days like that are the whole point of this place.", "The team loved having you.", "Hope you left a little more relaxed than you arrived."],
  },
};

const ES: Record<Tone, Pools> = {
  WARM_FAMILY: {
    opening: [
      "Fue un placer tenerte con nosotros {when}. Gracias por elegir {venue}.",
      "Gracias por venir {when}; nos encantó atenderte.",
      "Nos alegra mucho que vinieras {when}. Gracias por compartirlo con nosotros.",
    ],
    regular: ["Siempre es un gusto ver una cara conocida; gracias por volver.", "Que vuelvas significa mucho para nosotros."],
    first: ["Si era tu primera vez con nosotros, esperamos que sea la primera de muchas.", "Esperamos que tu primera visita te haya dado una buena idea de lo que somos."],
    group: ["Cuidar de tu mesa fue un placer; una mesa llena y contenta es nuestra favorita."],
    occasion: ["Feliz {occasion} de nuevo; esperamos que fuera todo lo que querías.", "Fue un honor formar parte de tu {occasion}."],
    plain: ["Esperamos que la comida, las bebidas y la compañía fueran justo lo que buscabas."],
    ask: [
      "Si tienes un momento, una reseña rápida en Google significaría muchísimo para nuestro pequeño equipo.",
      "¿Nos dejarías unas palabras en Google? Lleva un minuto y marca una gran diferencia para un negocio familiar como el nuestro.",
      "Te agradeceríamos una breve reseña en Google; cada una ayuda más de lo que imaginas.",
    ],
    closing: ["Hasta pronto.", "Hasta la próxima.", "Nos encantaría verte de nuevo."],
    extra: ["Momentos así son la razón por la que hacemos esto.", "Gracias también por cómo tratasteis a nuestro equipo.", "De verdad, fue un placer para nosotros."],
  },
  UPSCALE: {
    opening: [
      "Gracias por cenar con nosotros {when}. Fue un placer recibirle en {venue}.",
      "Fue un placer darle la bienvenida a {venue} {when}.",
      "Gracias por elegir {venue} {when}; esperamos que fuera de su agrado.",
    ],
    regular: ["Siempre es un placer volver a recibirle.", "Sus visitas se aprecian más de lo que imagina."],
    first: ["Esperamos que su primera visita le haya dado una idea de lo que hacemos aquí.", "Esperamos que esta primera velada sea el comienzo de muchas."],
    group: ["Fue un placer atender a su grupo."],
    occasion: ["Reciba de nuevo nuestros mejores deseos por su {occasion}.", "Fue un privilegio acoger su {occasion}."],
    plain: ["Confiamos en que todo estuviera como debía."],
    ask: [
      "Si dispone de un momento, le agradeceríamos una breve reseña en Google.",
      "Unas palabras en Google, si tiene un momento, serían muy apreciadas.",
      "Si disfrutó de su tiempo con nosotros, una breve reseña en Google significaría mucho.",
    ],
    closing: ["Esperamos volver a recibirle pronto.", "Hasta la próxima ocasión.", "Con nuestro agradecimiento."],
    extra: ["Veladas como esta son nuestra razón de ser.", "Fue un privilegio contar con su presencia.", "Confiamos en que todo estuviera a la altura."],
  },
  FUN_LIVELY: {
    opening: [
      "¡Gracias por venir a {venue} {when}! Lo hiciste aún mejor.",
      "¡Gracias por pasar el rato con nosotros {when}!",
      "Estuviste con nosotros {when} y, sinceramente, ¡gracias por eso!",
    ],
    regular: ["Otra vez por aquí, nos encanta. Gracias por seguir con nosotros.", "Una cara conocida es la mejor; gracias por volver."],
    first: ["¿Primera vez? Bienvenido al club.", "Si fue tu primera visita, esperamos que no sea la última."],
    group: ["Mesa grande, energía grande: gracias por traer a la tropa."],
    occasion: ["¡Feliz {occasion} otra vez! Esperamos que fuera como se merece.", "¿Celebrar tu {occasion} con nosotros? La mejor clase de noche."],
    plain: ["Esperamos que la comida diera en el clavo y las bebidas no pararan."],
    ask: [
      "¿Tienes un minuto? Una reseña rápida en Google nos alegraría el día (y ayuda a que más gente encuentre la fiesta).",
      "Si lo pasaste bien, ¡cuéntaselo a Google! Una reseña corta nos ayuda un montón.",
      "¿Nos dejas unas líneas en Google? Con un par de frases basta.",
    ],
    closing: ["¡Hasta la próxima!", "¡Vuelve pronto!", "¿Repetimos?"],
    extra: ["Noches así son el motivo por el que abrimos.", "El equipo se quedó con muy buen sabor de boca.", "Trajiste la energía buena."],
  },
  BEACH_BAR: {
    opening: [
      "Gracias por pasarte por {venue} {when}.",
      "Qué bien tenerte con nosotros {when}; gracias por venir.",
      "Gracias por pasar un rato con nosotros {when}.",
    ],
    regular: ["Siempre es bueno verte de vuelta.", "Gracias por volver; ya sabes dónde estamos."],
    first: ["¿Primera vez aquí? Esperamos que fuera fácil.", "Si fue tu primera visita, esperamos que no sea la última."],
    group: ["Gracias por traer a todo el mundo."],
    occasion: ["Feliz {occasion} de nuevo; esperamos que fuera un buen día.", "Nos alegra haber sido parte de tu {occasion}."],
    plain: ["Esperamos que las bebidas estuvieran frías y las vistas hicieran el resto."],
    ask: [
      "Si tienes un segundo, una reseña rápida en Google nos ayuda más de lo que crees.",
      "Unas palabras en Google serían geniales; sin presión, y gracias de todos modos.",
      "¿Nos dejas una reseña en Google? Un minuto, y significa mucho.",
    ],
    closing: ["Nos vemos junto al mar.", "Vuelve cuando pases por aquí.", "Hasta la próxima."],
    extra: ["Días así son todo el sentido de este sitio.", "Al equipo le encantó tenerte por aquí.", "Esperamos que te fueras un poco más relajado de lo que llegaste."],
  },
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function subjectFor(dp: Daypart, sameDay: boolean, tone: Tone, name: string, lang: Language): string {
  const upscale = tone === "UPSCALE";
  let s: string;
  if (lang === "es") {
    const when = sameDay ? (dp === "evening" || dp === "late" ? "esta noche" : "hoy") : dp === "evening" || dp === "late" ? "anoche" : "ayer";
    s = upscale ? `Gracias, ${name}` : `Gracias por ${when}, ${name}`;
  } else {
    const when = sameDay ? (dp === "evening" || dp === "late" ? "tonight" : "today") : dp === "evening" || dp === "late" ? "last night" : "yesterday";
    s = upscale ? `Thank you, ${name}` : `Thanks for ${when}, ${name}`;
  }
  if (s.length > 45) s = lang === "es" ? `Gracias, ${name}` : `Thank you, ${name}`;
  if (s.length > 45) s = lang === "es" ? "Gracias por tu visita" : "Thank you for visiting";
  return s;
}

export function composeThankYou(input: ComposeInput): ComposedEmail {
  const now = input.now ?? new Date();
  const lang: Language = input.language === "es" ? "es" : "en";
  const dp = daypartOf(input.visitAt, input.timezone);
  const sameDay = toLocalDateStr(input.visitAt, input.timezone) === toLocalDateStr(now, input.timezone);
  const name = input.firstName.trim() || (lang === "es" ? "hola" : "there");

  const vars = {
    name,
    venue: input.venueName,
    when: whenPhrase(dp, sameDay, lang),
    occasion: input.occasion ? occasionWord(input.occasion, lang) : "",
    restaurant: input.venueName,
    signoff: input.signOff,
  };

  // Owner-written copy wins outright — their words, their voice.
  if (input.customBody?.trim()) {
    const paragraphs = fill(input.customBody.trim(), vars)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const subject = input.customSubject?.trim() ? fill(input.customSubject.trim(), vars) : subjectFor(dp, sameDay, input.tone, name, lang);
    return { subject, paragraphs, signOff: input.signOff, wordCount: countWords(paragraphs.join(" ")) };
  }

  const pools = (lang === "es" ? ES : EN)[input.tone];
  const greeting = lang === "es" ? (input.tone === "UPSCALE" ? `Estimado/a ${name},` : `Hola ${name},`) : `Hi ${name},`;
  const opening = fill(pick(pools.opening, input.seed, "o"), vars);

  // One or two real specifics, in priority order — never more than we know.
  const specifics: string[] = [];
  if (input.occasion) specifics.push(fill(pick(pools.occasion, input.seed, "oc"), vars));
  if (input.visitCount >= 2) specifics.push(pick(pools.regular, input.seed, "r"));
  else if (!input.occasion) specifics.push(pick(pools.first, input.seed, "f"));
  if (input.partySize >= 6 && specifics.length < 2) specifics.push(pick(pools.group, input.seed, "g"));
  if (specifics.length === 0) specifics.push(pick(pools.plain, input.seed, "p"));

  const ask = pick(pools.ask, input.seed, "a");
  const closing = pick(pools.closing, input.seed, "c");

  const build = (middle: string[]) => [greeting, `${opening} ${middle.join(" ")}`, ask, closing];
  let middle = specifics.slice(0, 2);
  let paragraphs = build(middle);
  let words = countWords(paragraphs.join(" "));
  // Keep to the 60–110 window. Too long: drop the second specific. Too
  // short (Spanish runs terse): add a spare warm line, then a second, then
  // the plain line — in a fixed order so the same visit always reads the same.
  if (words > 110 && middle.length > 1) {
    middle = [specifics[0]];
    paragraphs = build(middle);
    words = countWords(paragraphs.join(" "));
  }
  const spare = [pick(pools.extra, input.seed, "e1"), ...pools.extra.filter((l) => l !== pick(pools.extra, input.seed, "e1")), pick(pools.plain, input.seed, "p2")];
  for (const line of spare) {
    if (words >= 60) break;
    if (middle.includes(line)) continue;
    middle = [...middle, line];
    paragraphs = build(middle);
    words = countWords(paragraphs.join(" "));
  }

  return {
    subject: subjectFor(dp, sameDay, input.tone, name, lang),
    paragraphs,
    signOff: input.signOff,
    wordCount: words,
  };
}
