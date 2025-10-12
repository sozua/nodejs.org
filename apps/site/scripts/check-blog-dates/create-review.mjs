export async function createReviewForFutureDates({ github, context, core }) {
  const futurePosts = process.env.FUTURE_POSTS;

  if (!futurePosts) {
    core.info('No future posts found, skipping review creation');
    return;
  }

  const body = `**Future publish dates found:**

${futurePosts}

**Posts will be published immediately when merged. Verify dates are correct.**

Once verified, dismiss this review to allow merging.`;

  const { data: reviews } = await github.rest.pulls.listReviews({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
  });

  const existingReview = reviews.find(
    review =>
      review.user.login === 'github-actions[bot]' &&
      review.state === 'CHANGES_REQUESTED' &&
      review.body.includes('Future publish dates found')
  );

  if (!existingReview) {
    await github.rest.pulls.createReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.issue.number,
      event: 'REQUEST_CHANGES',
      body,
    });

    core.info('Created review requesting changes');
  } else {
    core.info('Review already exists, skipping');
  }
}
