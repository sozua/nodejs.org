// Constants
export const BOT_USER_LOGIN = 'github-actions[bot]';
export const BOT_PREFIX = '**Publish date is in the future:**';
export const DATE_FIELD_MARKER = 'date:';

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
 * Only matches lines that were ADDED (start with +) to ensure the date was modified.
 */
function findDateLinePosition(patch) {
  const lines = patch.split('\n');
  const index = lines.findIndex(
    line => line.startsWith('+') && line.includes(DATE_FIELD_MARKER)
  );
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
    core.info(`Skipping ${filePath}: date line not modified in this PR`);
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
 * Gets files changed in a specific commit.
 */
async function getCommitFiles({ github, requestContext, commitSha, core }) {
  try {
    const { data: commit } = await github.rest.repos.getCommit({
      owner: requestContext.owner,
      repo: requestContext.repo,
      ref: commitSha,
    });

    return commit.files || [];
  } catch (error) {
    core.warning(`Failed to get commit files: ${error.message}`);
    return [];
  }
}

/**
 * Creates inline review comments for blog posts with future publish dates.
 *
 * Process:
 * 1. Parse future posts from environment
 * 2. Fetch files changed in THIS COMMIT (not entire PR) and existing comments
 * 3. Filter posts to only those modified in this specific commit
 * 4. Update existing comments or prepare new ones
 * 5. Create a single review with all new comments
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

  const commitSha = context.payload.pull_request.head.sha;

  core.info(`Checking files changed in commit ${commitSha.substring(0, 7)}`);

  // Fetch commit files and existing comments in parallel
  // Use getCommit to get only files changed in THIS commit, not entire PR
  const [commitFiles, { data: allPrFiles }, { data: existingComments }] =
    await Promise.all([
      getCommitFiles({ github, requestContext, commitSha, core }),
      github.rest.pulls.listFiles(requestContext),
      github.rest.pulls.listReviewComments(requestContext),
    ]);

  // Create a set of files changed in THIS commit only
  const commitChangedPaths = new Set(commitFiles.map(f => f.filename));

  core.info(`Found ${commitChangedPaths.size} file(s) changed in this commit`);

  // Filter future posts to only include files changed in THIS commit
  const relevantPosts = futurePosts.filter(post => {
    const slug = post.slug.startsWith('/') ? post.slug : `/${post.slug}`;
    const filePath = `apps/site/pages/en${slug}.md`;
    return commitChangedPaths.has(filePath);
  });

  if (relevantPosts.length === 0) {
    core.info(
      'No future posts in files changed by this commit, skipping review creation'
    );
    return;
  }

  core.info(
    `Processing ${relevantPosts.length} future post(s) from ${futurePosts.length} total future posts (changed in this commit)`
  );

  // Process each relevant post using the full PR file list for patches
  const newComments = [];
  for (const post of relevantPosts) {
    const comment = await processPost({
      post,
      files: allPrFiles,
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
      commitId: commitSha,
      comments: newComments,
      core,
    });
  }
}
