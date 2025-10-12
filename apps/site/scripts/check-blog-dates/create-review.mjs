export async function createReviewForFutureDates({ github, context, core }) {
  const futurePostsTable = process.env.FUTURE_POSTS;
  const futurePostsJson = process.env.FUTURE_POSTS_JSON;

  if (!futurePostsTable || !futurePostsJson) {
    core.info('No future posts found, skipping review creation');
    return;
  }

  const futurePosts = JSON.parse(futurePostsJson);

  const body = `**Future publish dates found:**

${futurePostsTable}

**Posts will be published immediately when merged. Verify dates are correct.**`;

  const comments = futurePosts.map(post => {
    const filePath = `apps/site/pages/en${post.slug}.md`;
    return {
      path: filePath,
      body: `**Future publish date detected:** ${post.date}\n\nThis post is scheduled ${post.daysInFuture} days in the future. Posts are published immediately when merged. Verify this date is correct.`,
      line: 2,
    };
  });

  await github.rest.pulls.createReview({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
    event: 'COMMENT',
    body,
    comments,
  });

  core.info('Created review with file comments');
}
