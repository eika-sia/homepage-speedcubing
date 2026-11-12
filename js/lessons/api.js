import { STRAPI_ORIGIN, DISCIPLINE } from "./config.js";
// Query Strapi 5 for public lessons. This does not require frontend credentials.
function apiURL(params) {
  const url = new URL("/api/lessons", STRAPI_ORIGIN);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}

function normalize(record) {
  const entry = record?.attributes ?? record; // Strapi 4 and 5 response shapes
  if (!entry || !entry.slug) return null;
  return {
    id: record.documentId ?? record.id,
    title: String(entry.title ?? "Bez naslova"),
    slug: String(entry.slug),
    description: String(entry.description ?? ""),
    order: Number(entry.order ?? 0),
    sections: Array.isArray(entry.sections) ? entry.sections : [],
  };
}

async function fetchLessons(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(
      `Strapi HTTP ${response.status}. Provjeri objavu lekcije i Public > Lesson > find.`,
    );
  }
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("Strapi odgovor ne sadrzi data[].");
  return payload.data.map(normalize).filter(Boolean);
}

export function usingDemoData() {
  return new URLSearchParams(location.search).get("demo") === "1";
}

export async function listLessons() {
  const lessons = await fetchLessons(
    apiURL({
      "filters[discipline][$eq]": DISCIPLINE,
      "sort[0]": "order:asc",
      "sort[1]": "title:asc",
      "pagination[pageSize]": 100,
    }),
  );
  return lessons.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "hr"));
}

export async function getLesson(slug) {
  const lessons = await fetchLessons(
    apiURL({
      "filters[discipline][$eq]": DISCIPLINE,
      "filters[slug][$eq]": slug,
      "pagination[pageSize]": 1,
      // Strapi's dynamic zones need on-fragments for nested media attributes.
      "populate[sections][on][lesson.text]": "true",
      "populate[sections][on][lesson.image][populate][0]": "image",
      "populate[sections][on][lesson.cube]": "true",
    }),
  );
  return lessons[0] ?? null;
}

export function imageURL(image) {
  const data = image?.data?.attributes ?? image?.data ?? image?.attributes ?? image;
  const src = data?.formats?.medium?.url ?? data?.url;
  if (typeof src !== "string" || !src) return null;
  try {
    // Local example media are intentionally separate from Strapi uploads.
    const base = src.startsWith("./") ? document.baseURI : STRAPI_ORIGIN;
    const url = new URL(src, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
