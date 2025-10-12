export async function createReviewForFutureDates({ github, context, core }) {
  const futurePostsTable = process.env.FUTURE_POSTS;

  if (!futurePostsTable) {
    core.info('No future posts found, skipping review creation');
    return;
  }

  const body = `**Future publish dates found:**

${futurePostsTable}

**Posts will be published immediately when merged. Verify dates are correct.**`;

  await github.rest.pulls.createReview({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
    event: 'COMMENT',
    body,
  });

  core.info('Created review comment');
}
