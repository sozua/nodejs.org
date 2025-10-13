import generateBlogData from '../../next-data/generators/blogData.mjs';

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Checks all blog posts for future publish dates.
 *
 * This is a pure function that analyzes blog post dates and returns
 * information about posts scheduled in the future.
 *
 * @param {Date} currentDate - The date to compare against (defaults to now)
 * @param {Function} blogDataGenerator - Function to generate blog data (for testing)
 * @returns {Promise<Object>} Object containing futurePosts array and hasFuturePosts boolean
 */
export async function checkBlogDates(
  currentDate = new Date(),
  blogDataGenerator = generateBlogData
) {
  const blogData = await blogDataGenerator();

  const futurePosts = blogData.posts.reduce((acc, post) => {
    const postDate = new Date(post.date);

    if (postDate > currentDate) {
      acc.push({
        slug: post.slug,
        title: post.title,
        date: postDate.toISOString(),
        daysInFuture: Math.ceil(
          (postDate - currentDate) / MILLISECONDS_PER_DAY
        ),
      });
    }

    return acc;
  }, []);

  return { futurePosts, hasFuturePosts: futurePosts.length > 0 };
}

/**
 * Checks blog dates and formats the results for GitHub Actions output.
 *
 * Note: This function must be run from the repository root as it changes
 * directory to apps/site to access the blog data generator.
 *
 * @param {Object} params - GitHub Actions utilities
 * @param {Object} params.core - GitHub Actions core utilities for setting outputs
 */
export async function checkAndFormatBlogDates({ core }) {
  const originalCwd = process.cwd();
  process.chdir(`${originalCwd}/apps/site`);

  const { futurePosts, hasFuturePosts } = await checkBlogDates();

  process.chdir(originalCwd);

  if (hasFuturePosts) {
    core.setOutput('HAS_FUTURE_POSTS', 'true');
    core.setOutput('FUTURE_POSTS_JSON', JSON.stringify(futurePosts));
  } else {
    core.setOutput('HAS_FUTURE_POSTS', 'false');
  }
}
