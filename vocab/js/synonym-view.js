import { collectionMemberships } from "./collections.js";

export function renderSynonymGroups(container, groups, { onOpen, isOutsideScope = () => false, selectedId = "" } = {}) {
  const doc = container.ownerDocument;
  const cards = groups.map((group) => {
    const card = doc.createElement("article");
    card.className = "synonym-group";
    card.dataset.groupId = group.id;
    const title = doc.createElement("h3");
    title.textContent = group.title;
    const note = doc.createElement("p");
    note.className = "synonym-group-note";
    note.textContent = group.note;
    const list = doc.createElement("ul");
    list.className = "synonym-members";
    for (const { entry, note: distinction } of group.members) {
      const row = doc.createElement("li");
      const open = doc.createElement("button");
      open.type = "button";
      open.className = "synonym-term";
      open.textContent = entry.term;
      open.lang = "en";
      open.setAttribute("aria-label", `打开词条 ${entry.term}`);
      open.disabled = entry.id === selectedId;
      open.addEventListener("click", () => onOpen?.(entry, open));
      const origin = doc.createElement("small");
      origin.className = "synonym-origin";
      const memberships = collectionMemberships(entry);
      origin.textContent = [
        entry.partOfSpeech,
        memberships.length ? [...new Set(memberships.map((m) => `Chapter ${m.chapterNumber}`))].join(" / ") : "主词本",
        isOutsideScope(entry) ? "其他章节 / 词本" : ""
      ].filter(Boolean).join(" · ");
      const explanation = doc.createElement("p");
      explanation.textContent = distinction;
      row.append(open, origin, explanation);
      list.append(row);
    }
    card.append(title, note, list);
    return card;
  });
  container.replaceChildren(...cards);
}
