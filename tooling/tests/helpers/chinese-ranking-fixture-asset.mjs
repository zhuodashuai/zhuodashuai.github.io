import { CHINESE_RANKING_RELEASE } from "../../../vocab/js/chinese-ranking-release.js";

// Permit exactly the pinned public binary alongside existing JSON fixtures.
// Other files, version directories, query strings and foreign origins remain
// outside these local runtime transports.
const ranking = new URL(`../../../vocab/data/chinese-search-ranking/${CHINESE_RANKING_RELEASE.file}`, import.meta.url);
export const isPinnedChineseRankingFixture = value => new URL(value).href === ranking.href;
