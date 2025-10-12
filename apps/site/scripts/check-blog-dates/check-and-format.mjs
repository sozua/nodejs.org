import { checkBlogDates } from './index.mjs';

export async function checkAndFormatBlogDates({ core }) {
  const { futurePosts, hasFuturePosts } = await checkBlogDates();

  if (hasFuturePosts) {
    const header = [
      '| Post | Title | Publish Date | Days in Future |',
      '|------|-------|--------------|----------------|',
    ];

    const rows = futurePosts.map(
      post =>
        `| ${post.slug} | ${post.title} | ${post.date} | ${post.daysInFuture} |`
    );

    const table = [...header, ...rows].join('\n');

    core.setOutput('HAS_FUTURE_POSTS', 'true');
    core.setOutput('FUTURE_POSTS', table);
  } else {
    core.setOutput('HAS_FUTURE_POSTS', 'false');
  }
}
