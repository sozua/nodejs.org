export async function createReviewForFutureDates({ github, context, core }) {
  const futurePostsTable = process.env.FUTURE_POSTS;

  if (!futurePostsTable) {
    core.info('No future posts found, skipping review creation');
    return;
  }

  const body = `<!-- future-dates-check -->
**Future publish dates found:**

${futurePostsTable}

**Posts will be published immediately when merged. Verify dates are correct.**`;

  const { data: reviews } = await github.rest.pulls.listReviews({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
  });

  const existingReviews = reviews.filter(
    review =>
      review.user.login === 'github-actions[bot]' &&
      review.body.includes('<!-- future-dates-check -->') &&
      review.state !== 'DISMISSED'
  );

  for (const review of existingReviews) {
    await github.rest.pulls.dismissReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.issue.number,
      review_id: review.id,
      message: 'Outdated - new review created',
    });
    core.info(`Dismissed review ${review.id}`);
  }

  await github.rest.pulls.createReview({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
    event: 'COMMENT',
    body,
  });

  core.info('Created new review');
}
