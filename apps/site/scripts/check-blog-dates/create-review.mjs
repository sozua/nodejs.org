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

  if (existingReview) {
    await github.rest.pulls.dismissReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.issue.number,
      review_id: existingReview.id,
      message: 'Dismissed to create updated review',
    });
    core.info('Dismissed old review');
  }

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
    event: 'REQUEST_CHANGES',
    body,
    comments,
  });

  core.info('Created review requesting changes with file comments');
}
