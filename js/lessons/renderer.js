import { imageURL } from "./api.js";

// Render Strapi 5 Blocks with DOM APIs. Content text is never inserted as HTML.
function safeLink(value) {
  try {
    const url = new URL(value, location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function renderInline(node) {
  if (!node) return document.createTextNode("");
  if (node.type === "link") {
    const link = document.createElement("a");
    const href = safeLink(node.url);
    if (href) { link.href = href; link.rel = "noopener noreferrer"; }
    for (const child of node.children ?? []) link.append(renderInline(child));
    return link;
  }
  if (node.type !== "text") {
    const span = document.createElement("span");
    for (const child of node.children ?? []) span.append(renderInline(child));
    return span;
  }
  let output = document.createTextNode(String(node.text ?? ""));
  for (const [field, tag] of [
    ["code", "code"], ["strikethrough", "s"], ["underline", "u"],
    ["italic", "em"], ["bold", "strong"],
  ]) {
    if (node[field]) {
      const wrapper = document.createElement(tag);
      wrapper.append(output);
      output = wrapper;
    }
  }
  return output;
}

function appendInline(parent, children) {
  for (const node of children ?? []) parent.append(renderInline(node));
}

function renderBlock(node) {
  let element;
  switch (node?.type) {
    case "paragraph": element = document.createElement("p"); break;
    case "heading": element = document.createElement(`h${Math.max(3, Math.min(6, Number(node.level) || 3))}`); break;
    case "quote": element = document.createElement("blockquote"); break;
    case "list": element = document.createElement(node.format === "ordered" ? "ol" : "ul"); break;
    case "list-item": element = document.createElement("li"); break;
    case "code": element = document.createElement("pre"); break;
    default: element = document.createElement("p");
  }
  if (node?.type === "list") {
    for (const child of node.children ?? []) element.append(renderBlock(child));
  } else if (node?.type === "code") {
    const code = document.createElement("code");
    appendInline(code, node.children);
    element.append(code);
  } else {
    for (const child of node?.children ?? []) {
      if (child.type === "list") element.append(renderBlock(child));
      else if (child.type === "paragraph" && node.type === "list-item") element.append(renderBlock(child));
      else element.append(renderInline(child));
    }
  }
  return element;
}

export function renderRichText(body) {
  const container = document.createElement("div");
  container.className = "lesson-richtext";
  if (Array.isArray(body)) {
    for (const block of body) container.append(renderBlock(block));
  } else if (typeof body === "string" && body.trim()) {
    // Fallback for legacy Strapi richtext data. Render plain text, not HTML.
    const p = document.createElement("p");
    p.textContent = body;
    container.append(p);
  }
  return container;
}

function sectionText(section) {
  const content = document.createElement("div");
  content.className = "lesson-section-content";
  if (section.heading) {
    const heading = document.createElement("h2");
    heading.className = "lesson-section-heading";
    heading.textContent = section.heading;
    content.append(heading);
  }
  content.append(renderRichText(section.body));
  if (section.__component === "lesson.cube" && section.alg?.trim()) {
    const label = document.createElement("p");
    label.className = "lesson-alg-label";
    label.textContent = "Algoritam";
    const alg = document.createElement("code");
    alg.className = "lesson-alg";
    alg.textContent = section.alg;
    content.append(label, alg);
  }
  return content;
}

export function renderSections(sections, cubeManager) {
  const fragment = document.createDocumentFragment();
  const rendered = [];
  for (const [index, section] of sections.entries()) {
    if (!["lesson.text", "lesson.image", "lesson.cube"].includes(section.__component)) continue;
    const element = document.createElement("section");
    element.className = "lesson-section";
    element.dataset.index = String(rendered.length);
    element.setAttribute("aria-label", section.heading || `Korak ${index + 1}`);
    const content = sectionText(section);

    if (section.__component === "lesson.text") {
      element.classList.add("lesson-section--text");
      element.append(content);
    } else {
      element.classList.add("lesson-section--visual");
      const visual = document.createElement("div");
      visual.className = "lesson-section-visual";
      if (section.__component === "lesson.image") {
        const url = imageURL(section.image);
        if (url) {
          const image = document.createElement("img");
          image.src = url;
          image.alt = section.image?.alternativeText || section.image?.data?.attributes?.alternativeText || section.heading || "Ilustracija";
          image.loading = "lazy";
          visual.append(image);
        } else {
          const fallback = document.createElement("span");
          fallback.className = "lesson-image-missing";
          fallback.textContent = "Ilustracija nije dostupna.";
          visual.append(fallback);
        }
      } else {
        visual.classList.add("lesson-section-visual--cube");
        try { cubeManager.addSection(visual, section); }
        catch (error) {
          visual.textContent = `3D prikaz nije dostupan: ${error.message}`;
        }
      }
      element.append(visual, content);
    }
    rendered.push(element);
    fragment.append(element);
  }
  return { fragment, sections: rendered };
}
