import generateBlogData from '../../next-data/generators/blogData.mjs';

export async function checkBlogDates(
  currentDate = new Date(),
  blogDataGenerator = generateBlogData
) {
  const blogData = await blogDataGenerator();

  const futurePosts = blogData.posts
    .filter(post => {
      const postDate = new Date(post.date);
      return postDate > currentDate;
    })
    .map(post => {
      const postDate = new Date(post.date);
      return {
        slug: post.slug,
        title: post.title,
        date: postDate.toISOString(),
        daysInFuture: Math.ceil(
          (postDate - currentDate) / (1000 * 60 * 60 * 24)
        ),
      };
    });

  return { futurePosts, hasFuturePosts: futurePosts.length > 0 };
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const { futurePosts, hasFuturePosts } = await checkBlogDates();

  if (hasFuturePosts) {
    if (process.env.GITHUB_ACTIONS) {
      console.log(JSON.stringify(futurePosts));
    } else {
      console.log('\nFuture publish dates found:\n');

      futurePosts.forEach(post => {
        console.log(`  ${post.slug}`);
        console.log(`  ${post.title}`);
        console.log(`  ${post.date} (+${post.daysInFuture} days)\n`);
      });
    }

    process.exit(1);
  }

  console.log('All blog post dates are valid.');
}
