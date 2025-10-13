// Constants
const BOT_USER_LOGIN = 'github-actions[bot]';
const BOT_PREFIX = '**Publish date is in the future:**';
const DATE_FIELD_MARKER = 'date:';

// ============================================================================
// EXPORTED UTILITIES
// ============================================================================

/**
 * Builds the comment body for a future post warning.
 */
export function buildCommentBody(post) {
  const dayText = post.daysInFuture === 1 ? 'day' : 'days';
  return `${BOT_PREFIX} ${post.date}\n\nThis post is scheduled ${post.daysInFuture} ${dayText} in the future. Make sure this date is correct.`;
}

// ============================================================================
// COMMENT PROCESSING
// ============================================================================

/**
 * Finds the position of the date field in a git patch (1-indexed).
 */
function findDateLinePosition(patch) {
  const lines = patch.split('\n');
  const index = lines.findIndex(line => line.includes(DATE_FIELD_MARKER));
  if (index === -1) {
    return -1;
  }
  return index + 1;
}

/**
 * Updates an existing review comment if the content has changed.
 * @returns {Promise<boolean>} True if update was attempted
 */
async function updateExistingComment({
  github,
  requestContext,
  comment,
  newBody,
  filePath,
  core,
}) {
  if (comment.body === newBody) {
    return false;
  }

  try {
    await github.rest.pulls.updateReviewComment({
      ...requestContext,
      comment_id: comment.id,
      body: newBody,
    });
    core.info(`Updated comment on ${filePath}`);
  } catch (error) {
    core.warning(`Failed to update comment on ${filePath}: ${error.message}`);
  }

  return true;
}

/**
 * Processes a single post to determine if a new comment should be added.
 * @returns {Promise<Object|null>} Comment data or null
 */
async function processPost({
  post,
  files,
  existingComments,
  github,
  requestContext,
  core,
}) {
  // Build file path
  const slug = post.slug.startsWith('/') ? post.slug : `/${post.slug}`;
  const filePath = `apps/site/pages/en${slug}.md`;
  const commentBody = buildCommentBody(post);

  // Check for existing bot comment on this file
  const existingComment = existingComments.find(
    comment =>
      comment.path === filePath &&
      comment.user.login === BOT_USER_LOGIN &&
      comment.body.includes(BOT_PREFIX)
  );

  if (existingComment) {
    await updateExistingComment({
      github,
      requestContext,
      comment: existingComment,
      newBody: commentBody,
      filePath,
      core,
    });
    return null;
  }

  // Find file in PR diff
  const file = files.find(f => f.filename === filePath);
  if (!file?.patch) {
    core.warning(`File ${filePath} not found in PR diff`);
    return null;
  }

  // Find date line position in patch
  const position = findDateLinePosition(file.patch);
  if (position === -1) {
    core.warning(
      `Could not find '${DATE_FIELD_MARKER}' line in ${filePath} patch`
    );
    return null;
  }

  return {
    path: filePath,
    position,
    body: commentBody,
  };
}

/**
 * Creates a review with comments.
 */
async function createReview({
  github,
  requestContext,
  commitId,
  comments,
  core,
}) {
  try {
    await github.rest.pulls.createReview({
      ...requestContext,
      commit_id: commitId,
      event: 'COMMENT',
      comments,
    });
    core.info(`Created review with ${comments.length} inline comment(s)`);
  } catch (error) {
    core.warning(`Failed to create review: ${error.message}`);
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Creates inline review comments for blog posts with future publish dates.
 *
 * Process:
 * 1. Parse future posts from environment
 * 2. Fetch PR files and existing comments
 * 3. Update existing comments or prepare new ones
 * 4. Create a single review with all new comments
 */
export async function createReviewForFutureDates({ github, context, core }) {
  // Parse environment - JSON string set by previous step in workflow
  const futurePostsJson = process.env.FUTURE_POSTS_JSON;
  if (!futurePostsJson) {
    core.info('No future posts found, skipping review creation');
    return;
  }

  const futurePosts = JSON.parse(futurePostsJson);

  // Build request context
  const requestContext = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number,
  };

  // Fetch PR data in parallel
  const [{ data: files }, { data: existingComments }] = await Promise.all([
    github.rest.pulls.listFiles(requestContext),
    github.rest.pulls.listReviewComments(requestContext),
  ]);

  // Process each post
  const newComments = [];
  for (const post of futurePosts) {
    const comment = await processPost({
      post,
      files,
      existingComments,
      github,
      requestContext,
      core,
    });

    if (comment) {
      newComments.push(comment);
    }
  }

  // Create review if we have new comments
  if (newComments.length > 0) {
    await createReview({
      github,
      requestContext,
      commitId: context.payload.pull_request.head.sha,
      comments: newComments,
      core,
    });
  }
}
