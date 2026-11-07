// Study.Net readings 1 and 2 have not been collected in this book.
const TEAMWORK_CHAPTERS = [
  "chapter-1", "chapter-3", "chapter-2", "chapter-4", "chapter-7", "chapter-6", "chapter-5",
  "chapter-13", "chapter-12", "chapter-11", "chapter-10", "chapter-8", "chapter-9"
];
const courseNumber = new Map(TEAMWORK_CHAPTERS.map((id, index) => [id, index + 3]));

export function chaptersForNavigation(collection) {
  const chapters = collection?.chapters || [];
  if (collection?.id !== "teamwork") return chapters;
  return chapters.map(chapter => {
    const number = courseNumber.get(chapter.id);
    return {
      ...chapter,
      studyNetNumber: number,
      title: number ? `${number}. ${chapter.title}` : chapter.title
    };
  }).sort((left, right) =>
    (left.studyNetNumber ?? Infinity) - (right.studyNetNumber ?? Infinity) || left.number - right.number);
}
