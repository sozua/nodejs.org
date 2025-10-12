export async function createReviewForFutureDates({ github, context, core }) {
  const futurePostsJson = process.env.FUTURE_POSTS_JSON;

  if (!futurePostsJson) {
    core.info('No future posts found, skipping');
    return;
  }

  const futurePosts = JSON.parse(futurePostsJson);

  const { data: files } = await github.rest.pulls.listFiles({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
  });

  const { data: existingComments } = await github.rest.pulls.listReviewComments(
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.issue.number,
    }
  );

  // Collect all new comments to be created in a single review
  const newComments = [];

  for (const post of futurePosts) {
    const filePath = `apps/site/pages/en${post.slug}.md`;
    const file = files.find(f => f.filename === filePath);

    core.info(`Processing ${filePath}...`);

    const newBody = `**Future publish date:** ${post.date}\n\nThis post is scheduled ${post.daysInFuture} days in the future. Verify this date is correct.`;

    const existingComment = existingComments.find(
      comment =>
        comment.path === filePath &&
        comment.user.login === 'github-actions[bot]' &&
        comment.body.includes('Future publish date:')
    );

    if (existingComment) {
      if (existingComment.body !== newBody) {
        try {
          await github.rest.pulls.updateReviewComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: existingComment.id,
            body: newBody,
          });
          core.info(`Updated comment on ${filePath}`);
        } catch (error) {
          core.warning(
            `Failed to update comment on ${filePath}: ${error.message}`
          );
        }
      } else {
        core.info(`Comment on ${filePath} already up to date`);
      }
      continue;
    }

    if (file && file.patch) {
      const lines = file.patch.split('\n');
      let position = 0;
      let foundDateLine = false;

      for (const line of lines) {
        position++;
        if (line.includes('date:') && !foundDateLine) {
          foundDateLine = true;
          newComments.push({
            path: filePath,
            position,
            body: newBody,
          });
          core.info(`Added ${filePath} to review at position ${position}`);
          break;
        }
      }

      if (!foundDateLine) {
        core.warning(`Could not find 'date:' line in ${filePath} patch`);
      }
    } else {
      core.warning(`File ${filePath} not found in PR diff`);
    }
  }

  // Create a single review with all new comments
  if (newComments.length > 0) {
    try {
      await github.rest.pulls.createReview({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.issue.number,
        commit_id: context.payload.pull_request.head.sha,
        event: 'COMMENT',
        comments: newComments,
      });
      core.info(
        `Created review with ${newComments.length} comment(s) on future dated files`
      );
    } catch (error) {
      core.warning(`Failed to create review: ${error.message}`);
    }
  }
}
