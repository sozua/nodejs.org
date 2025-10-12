export async function checkAndFormatBlogDates({ core }) {
  const originalCwd = process.cwd();
  process.chdir(`${originalCwd}/apps/site`);

  const { checkBlogDates } = await import('./index.mjs');
  const { futurePosts, hasFuturePosts } = await checkBlogDates();

  process.chdir(originalCwd);

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
