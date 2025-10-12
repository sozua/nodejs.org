import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkBlogDates } from '../index.mjs';

describe('checkBlogDates', () => {
  const mockBlogData = {
    posts: [
      { slug: '/blog/past-post', title: 'Past Post', date: '2024-01-01' },
      { slug: '/blog/future-post', title: 'Future Post', date: '2025-12-31' },
      {
        slug: '/blog/another-future',
        title: 'Another Future',
        date: '2025-11-15',
      },
    ],
  };

  it('should return no future posts when all posts are in the past', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2026-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, false);
    assert.equal(result.futurePosts.length, 0);
  });

  it('should detect future posts correctly', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2025-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, true);
    assert.equal(result.futurePosts.length, 2);
    assert.equal(result.futurePosts[0].slug, '/blog/future-post');
    assert.equal(result.futurePosts[1].slug, '/blog/another-future');
  });

  it('should calculate days in future correctly', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2025-12-30');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, true);
    assert.equal(result.futurePosts.length, 1);
    assert.equal(result.futurePosts[0].daysInFuture, 1);
  });

  it('should handle empty blog data', async () => {
    const mockGenerator = async () => ({ posts: [] });
    const currentDate = new Date('2025-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    assert.equal(result.hasFuturePosts, false);
    assert.equal(result.futurePosts.length, 0);
  });

  it('should include all required fields in future posts', async () => {
    const mockGenerator = async () => mockBlogData;
    const currentDate = new Date('2025-01-01');

    const result = await checkBlogDates(currentDate, mockGenerator);

    result.futurePosts.forEach(post => {
      assert.ok(post.slug);
      assert.ok(post.title);
      assert.ok(post.date);
      assert.ok(typeof post.daysInFuture === 'number');
      assert.ok(post.daysInFuture > 0);
    });
  });
});
